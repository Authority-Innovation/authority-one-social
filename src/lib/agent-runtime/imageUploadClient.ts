import {logger} from '#/logger'
import {getSupabaseAccessToken} from './authToken'
import {CHAT_IMAGE_UPLOAD_ENDPOINT} from './config'

/**
 * Upload a picked image to the runtime, which hosts it in R2 and returns the public
 * URL. The URL is then sent with the chat turn (see `streamChat`) so the runtime's
 * existing vision pipeline processes it — no new vision code on either side.
 *
 * The runtime expects the RAW image bytes as the request body with an image
 * `Content-Type` header (it reads `request.arrayBuffer()` and validates the MIME);
 * it does NOT parse multipart/form-data. We therefore read the local file into a Blob
 * and POST it directly with `Content-Type: <mime>`.
 *
 * Owner-scoped (Supabase bearer). RESILIENT: never throws. Returns the hosted URL on
 * success, or `null` when signed out / unreachable / the endpoint isn't deployed yet,
 * so the composer can degrade gracefully (send text-only) instead of crashing.
 */
export interface ChatImageToUpload {
  /** Local file URI from the image picker (file:// or blob:). */
  uri: string
  /** MIME type, e.g. "image/jpeg". */
  mime: string
  /** Optional file name; a sensible default is derived from the MIME otherwise. */
  name?: string
}

/**
 * Read a local image URI into a Blob. Uses XMLHttpRequest rather than `fetch()` because
 * Android's `fetch()` cannot read `file://` URIs (the same reason the PDS blob upload in
 * `#/lib/api/upload-blob` uses XHR). Works for file://, content:// and blob: URIs on
 * web, iOS and Android.
 */
function readImageBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.onload = () => resolve(xhr.response as Blob)
    xhr.onerror = () => reject(new Error('Failed to read image file'))
    xhr.responseType = 'blob'
    xhr.open('GET', uri, true)
    xhr.send(null)
  })
}

export async function uploadChatImage(
  image: ChatImageToUpload,
): Promise<string | null> {
  try {
    const token = await getSupabaseAccessToken()
    if (!token) return null

    const blob = await readImageBlob(image.uri)

    const res = await fetch(CHAT_IMAGE_UPLOAD_ENDPOINT, {
      method: 'POST',
      // Raw bytes + explicit image Content-Type — the runtime reads arrayBuffer() and
      // gates on this header. Do NOT use FormData here (the runtime won't parse it).
      headers: {Authorization: `Bearer ${token}`, 'Content-Type': image.mime},
      body: blob,
    })
    if (!res.ok) return null

    const data = (await res.json()) as {url?: unknown}
    return typeof data?.url === 'string' && data.url.length > 0
      ? data.url
      : null
  } catch (e) {
    logger.warn('chat image upload failed', {safeMessage: String(e)})
    return null
  }
}
