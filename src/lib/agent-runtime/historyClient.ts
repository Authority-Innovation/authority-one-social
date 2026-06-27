import {logger} from '#/logger'
import {getSupabaseAccessToken} from './authToken'
import {HISTORY_ENDPOINT} from './config'
import {type ChatMessage, type HistoryEntry} from './types'

/**
 * Outcome of a history load. `signedOut` lets the caller stay quiet (the chat screen
 * already surfaces a sign-in prompt) rather than show an error; `messages` is the
 * hydrated, ordered thread (oldest → newest) on success.
 */
export interface HistoryResult {
  messages: ChatMessage[]
  signedOut: boolean
  error?: string
}

let histSeq = 0
/** A stable-ish id for a hydrated turn. History is read once on mount, so a simple
 *  monotonic counter (namespaced) is sufficient and collision-free within a session. */
function historyId(prefix: string): string {
  return `h_${prefix}_${histSeq++}`
}

/** Best-effort message extraction from an `unknown` caught error. */
function errorMessage(e: unknown): string | undefined {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return undefined
}

/** Map one wire HistoryEntry to the app's ChatMessage. The runtime stores the agent
 *  role as 'agent'; the app renders 'assistant'. `channel` and `mediaUrls` ride along
 *  so the bubble can annotate origin and render inline images. */
function toChatMessage(entry: HistoryEntry): ChatMessage {
  const role = entry.role === 'user' ? 'user' : 'assistant'
  const at = entry.at ? Date.parse(entry.at) : NaN
  return {
    id: historyId(role),
    role,
    text: typeof entry.text === 'string' ? entry.text : '',
    channel: typeof entry.channel === 'string' ? entry.channel : 'app',
    mediaUrls: Array.isArray(entry.mediaUrls)
      ? entry.mediaUrls.filter(u => typeof u === 'string' && u)
      : [],
    createdAt: Number.isFinite(at) ? at : Date.now(),
  }
}

/**
 * Fetch the owner's recent conversation history from the runtime (GET /app/history)
 * and hydrate it into ChatMessage[]. Owner-scoping is enforced server-side from the
 * bearer (the endpoint is self-scoped), so no agent/handle is sent. Returns an ordered
 * thread (the runtime already returns oldest → newest). Never throws — failures are
 * reported in the result so a blank/old screen degrades gracefully rather than crashing.
 */
export async function fetchHistory(): Promise<HistoryResult> {
  let token: string | null
  try {
    token = await getSupabaseAccessToken()
  } catch (e) {
    return {messages: [], signedOut: false, error: errorMessage(e) ?? 'auth error'}
  }
  // Signed out → no bearer. The screen shows a sign-in prompt; just return empty.
  if (!token) return {messages: [], signedOut: true}

  try {
    const res = await fetch(HISTORY_ENDPOINT, {
      method: 'GET',
      headers: {Authorization: `Bearer ${token}`},
    })
    // 401/403 → token rejected or no agent provisioned yet. Not fatal for hydration:
    // the live /app/chat path surfaces the same condition with a clear message, so
    // here we just return empty (no spurious error banner on first open).
    if (res.status === 401 || res.status === 403) {
      return {messages: [], signedOut: false}
    }
    if (!res.ok) {
      return {messages: [], signedOut: false, error: `Runtime error ${res.status}`}
    }
    const json = await res.json()
    const rows: HistoryEntry[] = Array.isArray(json?.history) ? json.history : []
    return {messages: rows.map(toChatMessage), signedOut: false}
  } catch (e) {
    logger.error('agent-runtime fetchHistory failed', {safeMessage: e})
    return {messages: [], signedOut: false, error: errorMessage(e) ?? 'network error'}
  }
}
