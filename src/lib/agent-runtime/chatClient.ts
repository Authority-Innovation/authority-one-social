import {fetch as expoFetch} from 'expo/fetch'

import {logger} from '#/logger'
import {getSupabaseAccessToken} from './authToken'
import {CHAT_ENDPOINT} from './config'
import {
  type ApprovalAction,
  type ChatTurnResult,
  type PendingAction,
  type SendMessageRequest,
} from './types'

/**
 * Why a turn failed.
 *
 * - `transport` — the request/stream never completed: connection dropped, fetch
 *   threw, or the runtime returned no readable body. The message is a raw
 *   network string ("fetch failed: The network connection was lost") that must
 *   NOT be shown as the agent's reply; the UI should offer a quiet retry.
 * - `server` — a server/auth condition that DID come back from (or about) the
 *   runtime and carries meaningful copy for the user: 401/403 auth, a non-OK
 *   HTTP status, a server-sent SSE `error` event, or signed-out. These stay
 *   visible as a real error message, distinct from transport blips.
 */
export type ChatErrorKind = 'transport' | 'server'

export interface StreamHandlers {
  /** Called for every incremental text chunk; concatenate to render live. */
  onTextDelta: (delta: string) => void
  /** Called when the runtime attaches approval actions to this turn (from `pending`). */
  onActions?: (actions: ApprovalAction[]) => void
  /**
   * Called once when the turn settles. `result` carries the AUTHORITATIVE final
   * `message` (use it as the bubble's final text), `status`, `pending`, and
   * `mediaUrls`. May be undefined only for a stream that ended without a `done`
   * frame (treat the accumulated text as final in that case).
   */
  onDone?: (result?: ChatTurnResult) => void
  /**
   * Called on any error. `kind` lets the caller treat a dropped connection
   * (`transport`) differently from a server/auth-reported error (`server`) —
   * e.g. show a retry affordance for the former instead of rendering the raw
   * network string as a chat bubble. Defaults to `server` when omitted so older
   * callers keep their previous behavior.
   */
  onError: (message: string, kind?: ChatErrorKind) => void
}

/** Map the runtime's `pending` wire item to the app's approval-card UI type. */
function toApprovalAction(p: PendingAction): ApprovalAction {
  return {
    id: p.id,
    kind: p.kind,
    title: p.summary ?? p.label ?? p.kind,
    detail: p.ref,
  }
}

/** Normalize a `done`/JSON body into a ChatTurnResult with safe defaults. */
function toTurnResult(data: unknown): ChatTurnResult {
  const d = (data ?? {}) as Record<string, unknown>
  // A deliberate no-op turn: the runtime tags it `status:'silent'` or a bare
  // `silent:true`. It carries no reply text; the UI must render no bubble.
  const silent = d.status === 'silent' || d.silent === true
  // The runtime sends the reply under `message` (authoritative) and now also `text`;
  // prefer `message`, fall back to `text`, so a reply is never dropped as blank.
  const message =
    typeof d.message === 'string' && d.message
      ? d.message
      : typeof d.text === 'string'
        ? d.text
        : ''
  return {
    message,
    status: silent
      ? 'silent'
      : typeof d.status === 'string'
        ? (d.status as ChatTurnResult['status'])
        : 'answered',
    pending: Array.isArray(d.pending) ? (d.pending as PendingAction[]) : [],
    mediaUrls: Array.isArray(d.mediaUrls) ? (d.mediaUrls as string[]) : [],
    ...(silent ? {silent: true} : {}),
  }
}

/** Surface a settled turn: emit any approval actions, then the done result. */
function emitDone(result: ChatTurnResult, handlers: StreamHandlers): void {
  if (result.pending.length > 0) {
    handlers.onActions?.(result.pending.map(toApprovalAction))
  }
  handlers.onDone?.(result)
}

export class AgentAuthError extends Error {}

/**
 * Shown when there is no Supabase session, so no bearer can be attached. Auth IS
 * wired (see `#/state/supabase`); this means the user is simply signed out.
 */
export const SIGNED_OUT_MESSAGE = 'Sign in at /account to chat with your agent.'

/**
 * Shown when a bearer WAS attached but the runtime answered 401/403. The client
 * token is fine — this is a server-side condition: the agent runtime hasn't been
 * deployed with Supabase JWT verification (SUPABASE_JWT_SECRET) or has no
 * app-index row mapping this user to an agent. See SUPABASE-AUTH-INTEGRATION.md.
 */
export const TOKEN_REJECTED_MESSAGE =
  'The agent runtime rejected your account session. The runtime may not be deployed with Supabase verification yet.'

/** Best-effort message extraction from an `unknown` caught error. */
function errorMessage(e: unknown): string | undefined {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return undefined
}

/**
 * Stream a chat turn from the runtime's POST /app/chat (SSE).
 *
 * Uses `expo/fetch`, whose Response exposes a real ReadableStream body so we can parse
 * SSE incrementally on-device. Returns an `abort()` you can call to cancel the turn
 * (e.g. the user starts a new message). Auth = Supabase bearer (see authToken.ts).
 */
export function streamChat(
  req: SendMessageRequest,
  handlers: StreamHandlers,
): {abort: () => void} {
  const controller = new AbortController()

  void (async () => {
    let token: string | null
    try {
      token = await getSupabaseAccessToken()
    } catch (e) {
      handlers.onError(`Auth token error: ${errorMessage(e) ?? 'unknown'}`)
      return
    }

    // Signed out → no bearer to attach. Don't round-trip to the runtime just to
    // get a 401; tell the user how to authenticate. (Distinct from a rejected
    // token, handled below.)
    if (!token) {
      handlers.onError(SIGNED_OUT_MESSAGE)
      return
    }

    try {
      const res = await expoFetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          // Live Supabase session bearer (installed by #/state/supabase).
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text: req.text,
          history: req.history ?? [],
          // E6 agent selector: send `agent` ONLY when the caller picked one (hub
          // roster / route param). Absent = the runtime routes to the owner's
          // primary agent — do NOT default to a hardcoded handle here, or every
          // owner whose primary agent isn't that handle would be misrouted (or
          // 403'd by the ownership gate) once the selector is live server-side.
          ...(req.agent ? {agent: req.agent} : {}),
          // Attach hosted image URLs only when present, so text-only turns keep
          // their exact prior wire shape. The runtime's /app/chat reads
          // `imageUrls` (+ a single `imageUrl`), matching threadsClient — NOT
          // `images`, which it silently drops (→ 400 on an image-only turn).
          ...(req.images && req.images.length > 0
            ? {imageUrls: req.images, imageUrl: req.images[0]}
            : {}),
        }),
        signal: controller.signal,
      })

      if (res.status === 401 || res.status === 403) {
        handlers.onError(TOKEN_REJECTED_MESSAGE)
        return
      }
      if (!res.ok) {
        handlers.onError(`Runtime error ${res.status}`)
        return
      }

      // The runtime answers SSE only when it opts into it; otherwise (or if a proxy
      // strips streaming) it returns the JSON body {message,status,pending,mediaUrls}.
      // Branch on content-type so both shapes populate the bubble.
      const contentType = res.headers?.get?.('content-type') ?? ''
      if (contentType.includes('application/json')) {
        const json = await res.json()
        const result = toTurnResult(json)
        // Push the full reply through the delta channel so live consumers (e.g. TTS)
        // still receive it, then settle with the authoritative result.
        if (result.message) handlers.onTextDelta(result.message)
        emitDone(result, handlers)
        return
      }

      if (!res.body) {
        // The connection opened but produced no readable body — a transport
        // failure, not a server message. Let the UI offer a retry.
        handlers.onError('No response stream from runtime.', 'transport')
        return
      }

      await consumeSSE(res.body, handlers)
    } catch (e) {
      if (controller.signal.aborted) return // user-initiated cancel; not an error
      logger.error('agent-runtime streamChat failed', {safeMessage: e})
      // Reached here = fetch/stream threw (e.g. "The network connection was
      // lost"). That's a TRANSPORT failure: never surface the raw string as the
      // agent's reply — the caller shows a retry instead.
      handlers.onError(
        errorMessage(e) ?? 'Network error talking to the agent.',
        'transport',
      )
    }
  })()

  return {abort: () => controller.abort()}
}

/**
 * Parse an SSE byte stream and dispatch to handlers.
 *
 * Per APP-CHANNEL.md the event NAME is on the `event:` line; the `data:` line is a
 * bare JSON object (no discriminator). We therefore key on the event name:
 *   `chunk` → onTextDelta(data.delta)   `done` → settle with the result
 *   `error` → onError(data.message)
 */
async function consumeSSE(
  body: ReadableStream<Uint8Array>,
  handlers: StreamHandlers,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  // Guard so a `done` frame and the end-of-stream fallback don't both settle.
  let settled = false

  const settle = (result?: ChatTurnResult) => {
    if (settled) return
    settled = true
    if (result) emitDone(result, handlers)
    else handlers.onDone?.()
  }

  // SSE frames are separated by a blank line. A frame may carry an `event:` line and
  // one or more `data:` lines.
  const flushFrame = (frame: string) => {
    let eventName = 'message'
    const dataLines: string[] = []
    for (const raw of frame.split('\n')) {
      const line = raw.replace(/\r$/, '')
      if (line.startsWith(':')) continue // comment / keep-alive
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).replace(/^ /, ''))
      }
    }
    if (dataLines.length === 0) return
    const payload = dataLines.join('\n')
    if (payload === '[DONE]') {
      settle()
      return
    }
    let data: unknown
    try {
      data = JSON.parse(payload)
    } catch {
      return // ignore keep-alives / non-JSON comments
    }
    const frameData = (data ?? {}) as Record<string, unknown>
    switch (eventName) {
      case 'chunk':
      case 'text': // tolerate the legacy name too
        if (typeof frameData.delta === 'string')
          handlers.onTextDelta(frameData.delta)
        break
      case 'done':
        settle(toTurnResult(data))
        break
      case 'error':
        handlers.onError(
          typeof frameData.message === 'string'
            ? frameData.message
            : typeof frameData.error === 'string'
              ? frameData.error
              : 'Agent runtime error.',
        )
        settled = true // an error is terminal; don't also fire onDone
        break
    }
  }

  for (;;) {
    const {done, value} = await reader.read()
    if (done) break
    buffer += decoder.decode(value, {stream: true})
    let sep
    // Handle both \n\n and \r\n\r\n frame separators.
    while ((sep = indexOfFrameBreak(buffer)) !== -1) {
      const frame = buffer.slice(0, sep.index)
      buffer = buffer.slice(sep.index + sep.len)
      flushFrame(frame)
    }
  }
  // Flush any trailing frame, then settle if the stream ended without `done`.
  if (buffer.trim().length > 0) flushFrame(buffer)
  settle()
}

function indexOfFrameBreak(s: string): {index: number; len: number} | -1 {
  const a = s.indexOf('\n\n')
  const b = s.indexOf('\r\n\r\n')
  if (a === -1 && b === -1) return -1
  if (b === -1 || (a !== -1 && a < b)) return {index: a, len: 2}
  return {index: b, len: 4}
}
