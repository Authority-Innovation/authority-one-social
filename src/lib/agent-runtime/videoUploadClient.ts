import {logger} from '#/logger'
import {getSupabaseAccessToken} from './authToken'
import {
  VIDEO_UPLOAD_ENDPOINT,
  VIDEO_UPLOAD_MAX_BYTES,
  VIDEO_UPLOAD_MIME_TYPES,
  videoStatusUrl,
} from './config'

/**
 * Upload a picked VIDEO to the runtime's phase-1 pipeline (POST /app/media/video).
 * The runtime commits the ORIGINAL bytes to R2 and returns a `videoId`; the post
 * is then published via /app/agents/posts carrying that id, and the runtime builds
 * app.bsky.embed.video server-side (Option A — the app never uploads a PDS blob or
 * builds the embed itself). Playback hydrates once Cloudflare Stream is configured
 * + ready; a post made before then is still published and renders text-only.
 *
 * The runtime expects the RAW bytes as the request body with a video `Content-Type`
 * header (it reads `request.arrayBuffer()` and gates on the MIME) — NOT
 * multipart/form-data. We read the local file into a Blob and PUT it via XHR so we
 * can report upload progress and support cancellation.
 *
 * Owner-scoped (Supabase bearer). NEVER throws — returns a tagged result so the
 * composer degrades gracefully (surface a clear error, keep the draft) instead of
 * crashing the whole post.
 */
export interface VideoToUpload {
  /** Local file URI from the picker (file://, content:// or blob:). */
  uri: string
  /** MIME type, e.g. "video/mp4". */
  mime: string
  /** Optional file name (for display). */
  name?: string
  /** Optional known byte size (used for a fast pre-read size check). */
  size?: number
}

export type VideoUploadErrorCode =
  | 'signed-out'
  | 'unsupported-type'
  | 'too-large'
  | 'unconfigured'
  | 'canceled'
  | 'network'
  | 'server'

export type VideoUploadResult =
  | {ok: true; videoId: string; status: string; originalUrl?: string}
  | {ok: false; code: VideoUploadErrorCode; error: string}

function isSupportedVideoMime(mime: string): boolean {
  return (VIDEO_UPLOAD_MIME_TYPES as readonly string[]).includes(mime)
}

/**
 * Read a local URI into a Blob via XHR (Android's `fetch()` can't read `file://`,
 * same reason the PDS blob upload uses XHR). Works on web, iOS and Android.
 */
function readVideoBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.onload = () => resolve(xhr.response as Blob)
    xhr.onerror = () => reject(new Error('Failed to read video file'))
    xhr.responseType = 'blob'
    xhr.open('GET', uri, true)
    xhr.send(null)
  })
}

export async function uploadAuthorityVideo(
  video: VideoToUpload,
  opts: {onProgress?: (fraction: number) => void; signal?: AbortSignal} = {},
): Promise<VideoUploadResult> {
  const {onProgress, signal} = opts

  if (!isSupportedVideoMime(video.mime)) {
    return {
      ok: false,
      code: 'unsupported-type',
      error: `Unsupported video type (${video.mime || 'unknown'}). Use MP4, MOV or WebM.`,
    }
  }

  // Fast reject on a known size before we even read the bytes.
  if (typeof video.size === 'number' && video.size > VIDEO_UPLOAD_MAX_BYTES) {
    return {ok: false, code: 'too-large', error: sizeError()}
  }

  try {
    const token = await getSupabaseAccessToken()
    if (!token) {
      return {ok: false, code: 'signed-out', error: 'You are signed out.'}
    }

    if (signal?.aborted) return {ok: false, code: 'canceled', error: 'Canceled'}

    const blob = await readVideoBlob(video.uri)
    if (blob.size > VIDEO_UPLOAD_MAX_BYTES) {
      return {ok: false, code: 'too-large', error: sizeError()}
    }

    return await new Promise<VideoUploadResult>(resolve => {
      const xhr = new XMLHttpRequest()
      let settled = false
      const settle = (r: VideoUploadResult) => {
        if (settled) return
        settled = true
        if (signal) signal.removeEventListener('abort', onAbort)
        resolve(r)
      }
      const onAbort = () => {
        try {
          xhr.abort()
        } catch {}
        settle({ok: false, code: 'canceled', error: 'Canceled'})
      }
      if (signal) signal.addEventListener('abort', onAbort)

      xhr.open('POST', VIDEO_UPLOAD_ENDPOINT, true)
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      // RAW bytes + explicit video Content-Type — the runtime reads arrayBuffer()
      // and gates on this header. Do NOT use FormData (the runtime won't parse it).
      xhr.setRequestHeader('Content-Type', video.mime)
      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = e => {
          if (e.lengthComputable && e.total > 0) {
            onProgress(Math.min(1, e.loaded / e.total))
          }
        }
      }
      xhr.onload = () => {
        let body: {
          videoId?: unknown
          status?: unknown
          originalUrl?: unknown
          error?: unknown
          code?: unknown
        } = {}
        try {
          body = JSON.parse(xhr.responseText || '{}')
        } catch {
          body = {}
        }
        if (
          xhr.status >= 200 &&
          xhr.status < 300 &&
          typeof body.videoId === 'string'
        ) {
          settle({
            ok: true,
            videoId: body.videoId,
            status:
              typeof body.status === 'string' ? body.status : 'processing',
            originalUrl:
              typeof body.originalUrl === 'string'
                ? body.originalUrl
                : undefined,
          })
          return
        }
        if (xhr.status === 503 || body.code === 'video-unconfigured') {
          settle({
            ok: false,
            code: 'unconfigured',
            error:
              'Video hosting is not configured yet. Please try again later.',
          })
          return
        }
        if (xhr.status === 413) {
          settle({ok: false, code: 'too-large', error: sizeError()})
          return
        }
        settle({
          ok: false,
          code: 'server',
          error:
            typeof body.error === 'string' && body.error
              ? body.error
              : `Video upload failed (${xhr.status}).`,
        })
      }
      xhr.onerror = () =>
        settle({
          ok: false,
          code: 'network',
          error:
            'Network error while uploading the video. Check your connection and try again.',
        })
      xhr.send(blob)
    })
  } catch (e) {
    logger.warn('authority video upload failed', {safeMessage: String(e)})
    return {
      ok: false,
      code: 'network',
      error: 'Could not upload the video. Please try again.',
    }
  }
}

function sizeError(): string {
  const mb = Math.floor(VIDEO_UPLOAD_MAX_BYTES / (1024 * 1024))
  return `That video is too large. The maximum size is ${mb} MB.`
}

export type VideoStreamState = string

export type VideoStatusResult =
  | {ok: true; videoId: string; streamState: VideoStreamState}
  | {ok: false; error: string}

/**
 * Poll the two-leg status for an uploaded videoId. Returns the Cloudflare Stream
 * transcoding state so the composer can gate submission until stream.state === 'ready'.
 */
export async function getVideoStatus(
  videoId: string,
): Promise<VideoStatusResult> {
  try {
    const token = await getSupabaseAccessToken()
    if (!token) return {ok: false, error: 'You are signed out.'}
    const res = await fetch(videoStatusUrl(videoId), {
      headers: {Authorization: `Bearer ${token}`},
    })
    if (!res.ok) {
      return {ok: false, error: `Video status check failed (${res.status}).`}
    }
    const body = (await res.json()) as {stream?: {state?: string}}
    const streamState: VideoStreamState = body?.stream?.state ?? 'pending'
    return {ok: true, videoId, streamState}
  } catch (e) {
    logger.warn('authority video status check failed', {safeMessage: String(e)})
    return {ok: false, error: 'Network error checking video status.'}
  }
}

/**
 * app.bsky.embed.video record MINUS the `video` blob — the alt/aspectRatio and
 * the custom `onePlayback` playback companion the runtime derives from Cloudflare
 * Stream. The caller uploads the original bytes to ITS OWN PDS repo and adds
 * `video: <that blobRef>` to complete the embed. `onePlayback` is only present
 * once Stream has finished processing (kept as unknown — the app just forwards it
 * verbatim into the record; the AppView reads it).
 */
export interface VideoEmbedMeta {
  $type: string
  alt?: string
  aspectRatio?: {width: number; height: number}
  onePlayback?: unknown
}

export interface VideoEmbedSource {
  bytes: ArrayBuffer
  contentType: string
  streamState: VideoStreamState
  embed: VideoEmbedMeta
}

export type VideoEmbedSourceResult =
  | ({ok: true} & VideoEmbedSource)
  | {ok: false; code?: string; error: string}

/** Decode the base64(UTF-8 JSON) X-One-Video-Embed header. atob/btoa are present
 *  on web and on RN 0.81 (Hermes). */
function decodeEmbedHeader(b64: string): VideoEmbedMeta {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as VideoEmbedMeta
  return parsed && typeof parsed === 'object'
    ? parsed
    : {$type: 'app.bsky.embed.video'}
}

/**
 * Fetch the Stream-backed embed material for an uploaded video so the CURRENT PDS
 * session (whoever's profile the person is composing on) can build the
 * app.bsky.embed.video and create the post record ITSELF — the runtime is used
 * ONLY to produce the embed, never to write the record. This is what keeps a
 * human's video post under the human's own repo instead of their agent's.
 *
 * GET /app/media/video/{videoId}/embed-source returns the ORIGINAL bytes as the
 * body + the embed companion (no blob) in the X-One-Video-Embed header. Owner-
 * scoped (Supabase bearer). NEVER throws — returns a tagged result.
 */
export async function fetchVideoEmbedSource(
  videoId: string,
): Promise<VideoEmbedSourceResult> {
  try {
    const token = await getSupabaseAccessToken()
    if (!token) return {ok: false, code: 'signed-out', error: 'You are signed out.'}
    const url = `${VIDEO_UPLOAD_ENDPOINT}/${encodeURIComponent(videoId)}/embed-source`
    const res = await fetch(url, {headers: {Authorization: `Bearer ${token}`}})
    if (!res.ok) {
      let body: {error?: unknown; code?: unknown} = {}
      try {
        body = await res.json()
      } catch {
        body = {}
      }
      return {
        ok: false,
        code: typeof body.code === 'string' ? body.code : undefined,
        error:
          typeof body.error === 'string' && body.error
            ? body.error
            : `Could not prepare the video for posting (${res.status}).`,
      }
    }
    const header = res.headers.get('x-one-video-embed')
    const embed = header
      ? decodeEmbedHeader(header)
      : {$type: 'app.bsky.embed.video'}
    const bytes = await res.arrayBuffer()
    const contentType = (res.headers.get('content-type') || 'video/mp4')
      .split(';')[0]
      .trim()
    const streamState: VideoStreamState =
      res.headers.get('x-one-video-stream-state') || 'pending'
    return {ok: true, bytes, contentType, streamState, embed}
  } catch (e) {
    logger.warn('authority video embed source failed', {safeMessage: String(e)})
    return {
      ok: false,
      code: 'network',
      error: 'Could not prepare the video. Please try again.',
    }
  }
}
