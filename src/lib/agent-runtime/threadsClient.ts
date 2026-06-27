import {type ChatMessage, type ChatTurnResult,type SendMessageRequest} from '#/lib/agent-runtime/types'
import {logger} from '#/logger'
import {getSupabaseAccessToken} from './authToken'
import {SIGNED_OUT_MESSAGE,type StreamHandlers} from './chatClient'
import {
  threadGroupUrl,
  threadMessagesUrl,
  THREADS_ENDPOINT,
  threadSendUrl,
} from './config'

/**
 * Multi-chat client: threads (the default agent "Talk to Bob" thread + groups). Same
 * owner-scoped /app auth + resilience contract as the persona/feed/context clients —
 * every call is resilient and degrades gracefully (the chat list falls back to the
 * single Talk-to-Bob chat when threads aren't reachable).
 */

export type ThreadKind = 'agent' | 'group'

export interface Thread {
  id: string
  kind: ThreadKind
  /** Pinned persona for an agent/group thread; its name + voice drive the header. */
  personaId?: string
  title: string
  lastMessage?: string
  unreadCount: number
  updatedAt: number
  /**
   * Membership status for the current user, when the runtime supplies it. A 'pending'
   * thread is an invite the user can accept/decline; 'owner'/'admin' gate management.
   */
  membership?: 'owner' | 'admin' | 'member' | 'pending'
}

export interface ThreadsResult {
  threads: Thread[]
  signedOut: boolean
  error?: string
}

export interface ThreadWriteResult<T = undefined> {
  ok: boolean
  signedOut: boolean
  error?: string
  data?: T
}

export type GroupMemberKind = 'person' | 'persona'
export type GroupOp =
  | 'invite'
  | 'add'
  | 'accept'
  | 'decline'
  | 'remove'
  | 'leave'
  | 'admin'

export interface GroupOpInput {
  op: GroupOp
  memberId?: string
  memberKind?: GroupMemberKind
  role?: string
  makeAdmin?: boolean
}

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** Normalize one raw thread row defensively. Returns null without an id. */
export function normalizeThread(raw: unknown): Thread | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = str(r.id)
  if (!id) return null
  const kind: ThreadKind = r.kind === 'group' ? 'group' : 'agent'
  const membership = r.membership
  return {
    id,
    kind,
    personaId: str(r.personaId),
    title: str(r.title) ?? (kind === 'group' ? 'Group' : 'Talk to Bob'),
    lastMessage: str(r.lastMessage),
    unreadCount: num(r.unreadCount),
    updatedAt: num(r.updatedAt),
    membership:
      membership === 'owner' ||
      membership === 'admin' ||
      membership === 'member' ||
      membership === 'pending'
        ? membership
        : undefined,
  }
}

/** Newest-first, with pending invites surfaced at the top. */
export function normalizeThreads(json: unknown): Thread[] {
  const rows = (json as {threads?: unknown})?.threads
  if (!Array.isArray(rows)) return []
  const threads = rows
    .map(normalizeThread)
    .filter((t): t is Thread => t !== null)
  return threads.sort((a, b) => {
    const aPending = a.membership === 'pending' ? 1 : 0
    const bPending = b.membership === 'pending' ? 1 : 0
    if (aPending !== bPending) return bPending - aPending
    return b.updatedAt - a.updatedAt
  })
}

/**
 * Friend-vs-invite decision: an already-connected person (in the owner's follows /
 * social graph) is ADDED directly; anyone else is INVITED and must accept. Personas are
 * always added directly (no consent step). PURE + tested.
 */
export function memberOpFor(
  memberKind: GroupMemberKind,
  memberId: string,
  friendIds: ReadonlySet<string> | readonly string[],
): GroupOp {
  if (memberKind === 'persona') return 'add'
  const set =
    friendIds instanceof Set ? friendIds : new Set<string>(friendIds)
  return set.has(memberId) ? 'add' : 'invite'
}

/** Build the POST body for a group op (drops undefined fields). */
export function groupOpBody(input: GroupOpInput): Record<string, unknown> {
  const body: Record<string, unknown> = {op: input.op}
  if (input.memberId !== undefined) body.memberId = input.memberId
  if (input.memberKind !== undefined) body.memberKind = input.memberKind
  if (input.role !== undefined) body.role = input.role
  if (input.makeAdmin !== undefined) body.makeAdmin = input.makeAdmin
  return body
}

// ── Transport ────────────────────────────────────────────────────────────────

function errorMessage(e: unknown): string | undefined {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return undefined
}

async function authHeaders(): Promise<Record<string, string> | null> {
  const token = await getSupabaseAccessToken()
  if (!token) return null
  return {Authorization: `Bearer ${token}`}
}

let msgSeq = 0
function msgId(role: string): string {
  return `t_${role}_${Date.now().toString(36)}_${msgSeq++}`
}

/** Map a per-thread history row to a ChatMessage (same shape as /app/history). */
function toThreadMessage(raw: unknown): ChatMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const role = r.role === 'user' ? 'user' : 'assistant'
  const at = typeof r.at === 'string' ? Date.parse(r.at) : num(r.at)
  return {
    id: msgId(role),
    role,
    text: typeof r.text === 'string' ? r.text : '',
    channel: typeof r.channel === 'string' ? r.channel : 'app',
    mediaUrls: Array.isArray(r.mediaUrls)
      ? r.mediaUrls.filter((u): u is string => typeof u === 'string' && !!u)
      : [],
    createdAt: Number.isFinite(at) ? at : Date.now(),
  }
}

/** GET /app/threads — the owner's threads. Never throws. */
export async function fetchThreads(): Promise<ThreadsResult> {
  let headers: Record<string, string> | null
  try {
    headers = await authHeaders()
  } catch (e) {
    return {threads: [], signedOut: false, error: errorMessage(e) ?? 'auth error'}
  }
  if (!headers) return {threads: [], signedOut: true}
  try {
    const res = await fetch(THREADS_ENDPOINT, {method: 'GET', headers})
    if (res.status === 401 || res.status === 403)
      return {threads: [], signedOut: true}
    if (!res.ok)
      return {threads: [], signedOut: false, error: `Runtime error ${res.status}`}
    return {threads: normalizeThreads(await res.json()), signedOut: false}
  } catch (e) {
    logger.warn('threads: fetch failed', {safeMessage: String(e)})
    return {threads: [], signedOut: false, error: errorMessage(e) ?? 'network error'}
  }
}

/** POST /app/threads — create a thread (group seeds creator as owner/guardian). */
export async function createThread(input: {
  title?: string
  kind: ThreadKind
  personaId?: string
  roleSet?: string
}): Promise<ThreadWriteResult<Thread>> {
  const headers = await authHeaders().catch(() => null)
  if (!headers) return {ok: false, signedOut: true}
  try {
    const res = await fetch(THREADS_ENDPOINT, {
      method: 'POST',
      headers: {...headers, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        title: input.title,
        kind: input.kind,
        personaId: input.personaId,
        roleSet: input.roleSet,
      }),
    })
    if (res.status === 401 || res.status === 403)
      return {ok: false, signedOut: true}
    if (!res.ok)
      return {ok: false, signedOut: false, error: `Runtime error ${res.status}`}
    const created = normalizeThread(await res.json()) ?? undefined
    return {ok: true, signedOut: false, data: created}
  } catch (e) {
    logger.warn('threads: create failed', {safeMessage: String(e)})
    return {ok: false, signedOut: false, error: errorMessage(e) ?? 'network error'}
  }
}

/** GET /app/threads/:id/messages — per-thread history. Returns [] when unavailable. */
export async function fetchThreadMessages(
  threadId: string,
): Promise<ChatMessage[]> {
  try {
    const headers = await authHeaders()
    if (!headers) return []
    const res = await fetch(threadMessagesUrl(threadId), {
      method: 'GET',
      headers,
    })
    if (!res.ok) return []
    const json = (await res.json()) as {messages?: unknown; history?: unknown}
    const rows = Array.isArray(json?.messages)
      ? json.messages
      : Array.isArray(json?.history)
        ? json.history
        : []
    return rows.map(toThreadMessage).filter((m): m is ChatMessage => m !== null)
  } catch (e) {
    logger.warn('threads: fetch messages failed', {safeMessage: String(e)})
    return []
  }
}

/** POST /app/threads/:id/send — send into a thread; returns the reply (if any). */
export async function sendToThread(
  threadId: string,
  input: {message?: string; imageUrls?: string[]},
): Promise<ThreadWriteResult<ChatTurnResult>> {
  const headers = await authHeaders().catch(() => null)
  if (!headers) return {ok: false, signedOut: true}
  try {
    const body: Record<string, unknown> = {}
    if (input.message) body.message = input.message
    if (input.imageUrls && input.imageUrls.length > 0) {
      body.imageUrls = input.imageUrls
      body.imageUrl = input.imageUrls[0] // tolerate both shapes
    }
    const res = await fetch(threadSendUrl(threadId), {
      method: 'POST',
      headers: {...headers, 'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    })
    if (res.status === 401 || res.status === 403)
      return {ok: false, signedOut: true}
    if (!res.ok)
      return {ok: false, signedOut: false, error: `Runtime error ${res.status}`}
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    const reply: ChatTurnResult = {
      message: typeof data?.message === 'string' ? data.message : '',
      status: 'answered',
      pending: Array.isArray(data?.pending) ? (data.pending as never[]) : [],
      mediaUrls: Array.isArray(data?.mediaUrls)
        ? (data.mediaUrls as string[]).filter(u => typeof u === 'string')
        : [],
    }
    return {ok: true, signedOut: false, data: reply}
  } catch (e) {
    logger.warn('threads: send failed', {safeMessage: String(e)})
    return {ok: false, signedOut: false, error: errorMessage(e) ?? 'network error'}
  }
}

/** POST /app/threads/:id/group — membership operations. */
export async function groupOp(
  threadId: string,
  input: GroupOpInput,
): Promise<ThreadWriteResult> {
  const headers = await authHeaders().catch(() => null)
  if (!headers) return {ok: false, signedOut: true}
  try {
    const res = await fetch(threadGroupUrl(threadId), {
      method: 'POST',
      headers: {...headers, 'Content-Type': 'application/json'},
      body: JSON.stringify(groupOpBody(input)),
    })
    if (res.status === 401 || res.status === 403)
      return {ok: false, signedOut: true}
    if (!res.ok)
      return {ok: false, signedOut: false, error: `Runtime error ${res.status}`}
    return {ok: true, signedOut: false}
  } catch (e) {
    logger.warn('threads: group op failed', {safeMessage: String(e)})
    return {ok: false, signedOut: false, error: errorMessage(e) ?? 'network error'}
  }
}

/**
 * Adapts a thread's send into the chat hook's transport contract (same signature as
 * `streamChat`), so the existing AgentChat UI + state machine drive a thread unchanged.
 * Threads reply via JSON (no SSE), so the full reply is emitted as one delta then done.
 */
export function makeThreadTransport(threadId: string) {
  return (
    req: SendMessageRequest,
    handlers: StreamHandlers,
  ): {abort: () => void} => {
    const controller = new AbortController()
    void (async () => {
      const result = await sendToThread(threadId, {
        message: req.text,
        imageUrls: req.images,
      })
      if (controller.signal.aborted) return
      if (result.signedOut) {
        handlers.onError(SIGNED_OUT_MESSAGE, 'server')
        return
      }
      if (!result.ok) {
        handlers.onError(result.error ?? 'Could not send to this thread.', 'transport')
        return
      }
      const reply = result.data
      if (reply?.message) handlers.onTextDelta(reply.message)
      handlers.onDone?.(reply)
    })()
    return {abort: () => controller.abort()}
  }
}
