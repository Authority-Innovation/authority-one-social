import {normalizeSceneTags, type SceneTag} from '#/lib/photoContext/sceneTags'
import {logger} from '#/logger'
import {getSupabaseAccessToken} from './authToken'
import {SCENE_TAGS_ENDPOINT} from './config'

/**
 * Scene-tag client — the "small vision call" for Photo Context. POSTs the RAW bytes of an
 * EXPLICITLY-captured photo to the runtime vision proxy and returns coarse scene tags
 * (forest/trail/rocks/indoor…), normalized to the canonical vocabulary.
 *
 * PRIVACY BOUNDARY: this sends image bytes, so it is ONLY for a photo the user explicitly
 * captured/shared — the same boundary as the in-chat vision path. The passive EXIF photo
 * sampler must NOT call this (it stays metadata-only, no bytes).
 *
 * Owner-scoped (Supabase bearer). RESILIENT: never throws. Returns [] when signed out /
 * unreachable / the endpoint isn't deployed yet, so scene fusion simply degrades to
 * location-only.
 */
export interface SceneImage {
  /** Local file URI from the picker/camera (file:// or blob:). */
  uri: string
  /** MIME type, e.g. "image/jpeg". */
  mime: string
}

/** Read a local image URI into a Blob via XHR (Android can't fetch() file:// URIs). */
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

export async function fetchSceneTags(image: SceneImage): Promise<SceneTag[]> {
  try {
    const token = await getSupabaseAccessToken()
    if (!token) return []
    const blob = await readImageBlob(image.uri)
    const res = await fetch(SCENE_TAGS_ENDPOINT, {
      method: 'POST',
      // Raw bytes + explicit image Content-Type (same shape as /app/media/upload).
      headers: {Authorization: `Bearer ${token}`, 'Content-Type': image.mime},
      body: blob,
    })
    if (!res.ok) return []
    const data = (await res.json()) as {tags?: unknown}
    return normalizeSceneTags(data?.tags)
  } catch (e) {
    logger.warn('scene: tag lookup failed', {safeMessage: String(e)})
    return []
  }
}
