import {logger} from '#/logger'
import {getSupabaseAccessToken} from './authToken'
import {FEED_PROFILE_ENDPOINT, FEED_SIGNALS_ENDPOINT} from './config'

/**
 * Client for the "For You" engagement contract (owner-scoped, same auth pattern as
 * the persona client). Resilient: signals POST is fire-and-forget (never throws);
 * the profile GET returns `undefined` when signed out / unreachable so the feed
 * falls back to the round-robin blend.
 */

/** One engagement event (structurally matches ForYou's SignalEvent). */
export interface FeedSignalEvent {
  itemId: string
  mediaType: string
  tags: {teams?: string[]; topics?: string[]; geo?: string[]}
  action: string
  value?: number
  at: number
}

export interface FeedProfileWeights {
  teams: Record<string, number>
  topics: Record<string, number>
  geo: Record<string, number>
}

async function authHeaders(): Promise<Record<string, string> | null> {
  const token = await getSupabaseAccessToken()
  if (!token) return null
  return {Authorization: `Bearer ${token}`}
}

function numberMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
  }
  return out
}

/** Pure: GET /app/feed/profile JSON -> weights (defensive). */
export function normalizeFeedProfile(json: unknown): FeedProfileWeights {
  const w = (json as {weights?: unknown})?.weights as
    | Record<string, unknown>
    | undefined
  return {
    teams: numberMap(w?.teams),
    topics: numberMap(w?.topics),
    geo: numberMap(w?.geo),
  }
}

/**
 * POST a batch of engagement events. Fire-and-forget: returns void and swallows all
 * errors (signed out, network, non-ok) so capturing signals never disrupts the UI.
 */
export async function postFeedSignals(events: FeedSignalEvent[]): Promise<void> {
  if (events.length === 0) return
  try {
    const headers = await authHeaders()
    if (!headers) return
    await fetch(FEED_SIGNALS_ENDPOINT, {
      method: 'POST',
      headers: {...headers, 'Content-Type': 'application/json'},
      body: JSON.stringify({events}),
    })
  } catch (e) {
    logger.warn('feed signals: post failed', {safeMessage: String(e)})
  }
}

/** GET /app/feed/profile -> weights, or `undefined` when signed out / unreachable. */
export async function fetchFeedProfile(): Promise<FeedProfileWeights | undefined> {
  try {
    const headers = await authHeaders()
    if (!headers) return undefined
    const res = await fetch(FEED_PROFILE_ENDPOINT, {method: 'GET', headers})
    if (!res.ok) return undefined
    const json: unknown = await res.json()
    return normalizeFeedProfile(json)
  } catch (e) {
    logger.warn('feed profile: fetch failed', {safeMessage: String(e)})
    return undefined
  }
}
