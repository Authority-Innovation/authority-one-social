import {fetch as expoFetch} from 'expo/fetch'

import {logger} from '#/logger'
import {getSupabaseAccessToken} from './authToken'
import {CHAT_ENDPOINT, DEFAULT_AGENT} from './config'
import {
  type ApprovalAction,
  type ChatStreamEvent,
  type SendMessageRequest,
} from './types'

export interface StreamHandlers {
  /** Called for every incremental text chunk; concatenate to render live. */
  onTextDelta: (delta: string) => void
  /** Called when the runtime attaches approval actions to this turn. */
  onActions?: (actions: ApprovalAction[]) => void
  /** Called once when the turn completes successfully. */
  onDone?: (messageId?: string) => void
  /** Called on any error (network, auth, or server-reported). */
  onError: (message: string) => void
}

export class AgentAuthError extends Error {}

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

    try {
      const res = await expoFetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          // Supabase session bearer (stubbed until Supabase auth is wired — see authToken.ts).
          ...(token ? {Authorization: `Bearer ${token}`} : {}),
        },
        body: JSON.stringify({
          text: req.text,
          history: req.history ?? [],
          agent: req.agent ?? DEFAULT_AGENT,
        }),
        signal: controller.signal,
      })

      if (res.status === 401 || res.status === 403) {
        handlers.onError(
          'Not authorized. (Supabase sign-in is not wired yet — see authToken.ts TODO.)',
        )
        return
      }
      if (!res.ok) {
        handlers.onError(`Runtime error ${res.status}`)
        return
      }
      if (!res.body) {
        handlers.onError('No response stream from runtime.')
        return
      }

      await consumeSSE(res.body, handlers)
    } catch (e) {
      if (controller.signal.aborted) return // user-initiated cancel; not an error
      logger.error('agent-runtime streamChat failed', {safeMessage: e})
      handlers.onError(errorMessage(e) ?? 'Network error talking to the agent.')
    }
  })()

  return {abort: () => controller.abort()}
}

/** Parse an SSE byte stream into ChatStreamEvents and dispatch to handlers. */
async function consumeSSE(
  body: ReadableStream<Uint8Array>,
  handlers: StreamHandlers,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  // SSE frames are separated by a blank line. Each frame may have multiple `data:` lines.
  const flushFrame = (frame: string) => {
    const dataLines = frame
      .split('\n')
      .filter(l => l.startsWith('data:'))
      .map(l => l.slice(5).trimStart())
    if (dataLines.length === 0) return
    const payload = dataLines.join('\n')
    if (payload === '[DONE]') {
      handlers.onDone?.()
      return
    }
    let evt: ChatStreamEvent
    try {
      evt = JSON.parse(payload)
    } catch {
      return // ignore keep-alives / non-JSON comments
    }
    dispatch(evt, handlers)
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
  // Flush any trailing frame.
  if (buffer.trim().length > 0) flushFrame(buffer)
  handlers.onDone?.()
}

function indexOfFrameBreak(s: string): {index: number; len: number} | -1 {
  const a = s.indexOf('\n\n')
  const b = s.indexOf('\r\n\r\n')
  if (a === -1 && b === -1) return -1
  if (b === -1 || (a !== -1 && a < b)) return {index: a, len: 2}
  return {index: b, len: 4}
}

function dispatch(evt: ChatStreamEvent, handlers: StreamHandlers): void {
  switch (evt.type) {
    case 'text':
      handlers.onTextDelta(evt.delta)
      break
    case 'actions':
      handlers.onActions?.(evt.actions)
      break
    case 'done':
      handlers.onDone?.(evt.messageId)
      break
    case 'error':
      handlers.onError(evt.message)
      break
  }
}
