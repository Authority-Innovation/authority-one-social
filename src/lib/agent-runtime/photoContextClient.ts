import {type PhotoContextConclusion} from '#/lib/photoContext/types'
import {logger} from '#/logger'
import {getSupabaseAccessToken} from './authToken'
import {CONTEXT_EVENTS_ENDPOINT} from './config'

/**
 * Photo Context sync client. Reuses the Context Engine event path
 * (POST /app/context/events), tagging the conclusion with `source: 'photos'` so the
 * runtime threads it into the same recent-context memory Bob already references. Only a
 * derived CONCLUSION is sent (count + time window + coarse place) — never image content.
 *
 * Owner-scoped (Supabase bearer). RESILIENT: never throws; no-ops when signed out or the
 * endpoint isn't deployed yet, so the local flow keeps working regardless.
 */
export async function postPhotoContext(
  conclusion: PhotoContextConclusion,
): Promise<void> {
  try {
    const token = await getSupabaseAccessToken()
    if (!token) return
    await fetch(CONTEXT_EVENTS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({events: [conclusion]}),
    })
  } catch (e) {
    logger.warn('photoContext: sync failed', {safeMessage: String(e)})
  }
}
