import {type ChatChannel} from '#/lib/agent-runtime/types'
import {logger} from '#/logger'
import {getSupabaseAccessToken} from './authToken'
import {agentConversationsUrl, threadReadUrl} from './config'

/**
 * Unified per-agent CONVERSATIONS client — the cross-channel inbox behind the
 * AgentHub Messages tab. GET /app/agents/:agent/conversations returns every
 * conversation the agent participates in, across channels (in-app threads and
 * groups, per-channel 1:1 mirrors, legacy Twilio SMS groups), newest-first,
 * with real previews and unread counts. POST /app/threads/:id/read clears a
 * row's unread.
 *
 * Same owner-scoped /app auth + resilience contract as the other agent-runtime
 * clients: every call degrades gracefully and never throws.
 */

export type ConversationKind = 'chat' | 'group'

export interface AgentConversation {
  /** Thread id (app), `ch:<channel>` (per-channel 1:1), or a Twilio `CH…` sid. */
  id: string
  channel: ChatChannel
  kind: ConversationKind
  name: string
  lastMessage: {text: string; at: number} | null
  updatedAt: number | null
  unreadCount: number
  memberCount?: number
  /** True when the conversation is hosted on another owned agent's DO. */
  hosted?: boolean
}

export interface AgentConversationsResult {
  conversations: AgentConversation[]
  signedOut: boolean
  error?: string
}

export interface MarkReadResult {
  ok: boolean
  signedOut: boolean
  error?: string
}

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** Normalize one raw conversation row defensively. Returns null without an id. */
export function normalizeConversation(raw: unknown): AgentConversation | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = str(r.id)
  if (!id) return null
  const channel = str(r.channel) ?? 'app'
  const kind: ConversationKind = r.kind === 'group' ? 'group' : 'chat'
  let lastMessage: AgentConversation['lastMessage'] = null
  if (r.lastMessage && typeof r.lastMessage === 'object') {
    const m = r.lastMessage as Record<string, unknown>
    const text = str(m.text)
    if (text) lastMessage = {text, at: num(m.at) ?? 0}
  }
  return {
    id,
    channel,
    kind,
    name: str(r.name) ?? (kind === 'group' ? 'Group' : 'Chat'),
    lastMessage,
    updatedAt: num(r.updatedAt) ?? null,
    unreadCount: num(r.unreadCount) ?? 0,
    memberCount: num(r.memberCount),
    ...(r.hosted === true ? {hosted: true} : {}),
  }
}

/** Rows arrive newest-first from the runtime; keep that order after filtering. */
export function normalizeConversations(json: unknown): AgentConversation[] {
  const rows = (json as {conversations?: unknown})?.conversations
  if (!Array.isArray(rows)) return []
  return rows
    .map(normalizeConversation)
    .filter((c): c is AgentConversation => c !== null)
}

/** Total unread across a conversation list. PURE. */
export function sumUnread(conversations: AgentConversation[]): number {
  return conversations.reduce((total, c) => total + c.unreadCount, 0)
}

/** A Twilio Conversations sid ("CH" + 32 hex chars). PURE. */
const TWILIO_SID_RE = /^CH[0-9a-f]{32}$/i

/**
 * How the app opens a conversation row, by id space + shape:
 * - 'sms-mirror' — legacy Twilio group sid -> the read-only SMS mirror screen.
 * - 'direct'     — the in-app 1:1 or a per-channel 1:1 mirror (`ch:<channel>`);
 *                  all render in the unified AgentChat buffer.
 * - 'thread'     — an in-app thread/group id -> AgentChat by threadId.
 * PURE + tested.
 */
export function conversationOpenKind(
  c: Pick<AgentConversation, 'id' | 'kind' | 'channel'>,
): 'sms-mirror' | 'direct' | 'thread' {
  if (TWILIO_SID_RE.test(c.id)) return 'sms-mirror'
  if (c.id.startsWith('ch:')) return 'direct'
  if (c.kind === 'chat' && c.channel === 'app') return 'direct'
  return 'thread'
}

// ── Transport ────────────────────────────────────────────────────────────────

/**
 * All channels' conversations for one owned agent. Signed out / unreachable /
 * not-owned degrade to an empty list (with flags), never a throw.
 */
export async function fetchAgentConversations(
  agent: string,
): Promise<AgentConversationsResult> {
  try {
    const token = await getSupabaseAccessToken()
    if (!token) return {conversations: [], signedOut: true}
    const res = await fetch(agentConversationsUrl(agent), {
      method: 'GET',
      headers: {Authorization: `Bearer ${token}`},
    })
    if (!res.ok) {
      logger.warn('conversations: fetch non-ok', {
        safeMessage: `status ${res.status}`,
      })
      return {
        conversations: [],
        signedOut: false,
        error: `status ${res.status}`,
      }
    }
    const json = await res.json()
    return {conversations: normalizeConversations(json), signedOut: false}
  } catch (e) {
    logger.warn('conversations: fetch failed', {safeMessage: String(e)})
    return {conversations: [], signedOut: false, error: String(e)}
  }
}

/**
 * Mark a conversation read (POST /app/threads/:id/read, optional `{agent}`
 * body for rows scoped to a specific owned agent). Fire on open; the caller
 * optimistically zeroes the cached row regardless.
 */
export async function markThreadRead(
  id: string,
  agent?: string,
): Promise<MarkReadResult> {
  try {
    const token = await getSupabaseAccessToken()
    if (!token) return {ok: false, signedOut: true}
    const res = await fetch(threadReadUrl(id), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(agent ? {agent} : {}),
    })
    if (!res.ok) {
      return {ok: false, signedOut: false, error: `status ${res.status}`}
    }
    return {ok: true, signedOut: false}
  } catch (e) {
    logger.warn('conversations: mark-read failed', {safeMessage: String(e)})
    return {ok: false, signedOut: false, error: String(e)}
  }
}
