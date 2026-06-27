import {useCallback, useEffect, useRef, useState} from 'react'

import {
  type ApprovalAction,
  type ChatMessage,
  type ChatRole,
  fetchHistory,
  postApprovalDecision,
  streamChat,
} from '#/lib/agent-runtime'

type TurnHistory = {role: ChatRole; text: string}[]

let idSeq = 0
const newId = (p: string) => `${p}_${Date.now()}_${idSeq++}`

export interface UseAgentChat {
  messages: ChatMessage[]
  isStreaming: boolean
  /**
   * True until the initial history load settles. The screen can show a quiet loader
   * (instead of the empty-state copy) so a returning user doesn't see a flash of
   * "blank chat" before their recent thread hydrates.
   */
  isHydrating: boolean
  /** Send a user message and stream the reply. `onReplyChunk` lets the caller pipe text to TTS. */
  send: (
    text: string,
    opts?: {onReplyChunk?: (fullText: string) => void},
  ) => void
  /** Cancel the in-flight turn (e.g. user starts a new message / barge-in). */
  abort: () => void
  /**
   * True when the LAST turn failed at the transport layer (dropped connection /
   * fetch threw) rather than with a server-reported error. The screen renders a
   * quiet "Couldn't reach Bob — tap to retry" affordance instead of a fake
   * assistant bubble. Cleared by `send`, `retry`, or `abort`. Server/auth errors
   * do NOT set this — they stay visible as a real error message.
   */
  transportError: boolean
  /** Re-run the last transport-failed turn, reusing its text + history (no new user bubble). */
  retry: () => void
  /** Approve or reject an approval action; updates local state optimistically. */
  decide: (
    action: ApprovalAction,
    decision: 'approve' | 'reject',
  ) => Promise<void>
}

/**
 * Chat state machine for the agent runtime. Keeps the message list, drives the
 * streaming reply into a single "pending" assistant message, and exposes hooks so the
 * screen can pipe streamed text into TTS.
 */
export function useAgentChat(agent?: string): UseAgentChat {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [isHydrating, setIsHydrating] = useState(true)
  // Set only on a TRANSPORT failure (see UseAgentChat.transportError). The text +
  // history of that failed turn live in `retryRef` so `retry` can re-run it.
  const [transportError, setTransportError] = useState(false)
  const retryRef = useRef<{text: string; history: TurnHistory} | null>(null)
  const abortRef = useRef<null | (() => void)>(null)

  // HYDRATE ON MOUNT: the screen keeps messages only in transient React state, so a
  // user who navigates away and back comes back to a blank list. On mount we read the
  // runtime's per-owner rolling window (GET /app/history) — which is CROSS-CHANNEL, so
  // it also surfaces SMS/voice turns the app never saw — and seed the list with it.
  // Guarded so a concurrent send() (user types immediately) is never clobbered: we
  // only seed when the list is still empty. Runs once per mount; remounting on
  // re-entry re-hydrates, which is exactly the desired "repopulate on return".
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchHistory()
      if (cancelled) return
      if (result.messages.length > 0) {
        setMessages(prev => (prev.length === 0 ? result.messages : prev))
      }
      setIsHydrating(false)
    })()
    return () => {
      cancelled = true
    }
    // Mount-only: the empty-list guard makes a re-run safe, but we want a single load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Mirror of messages for building the history payload without stale closures.
  // Written in an effect (not during render) so we never mutate a ref mid-render;
  // `send` only reads it from event handlers, which always run post-commit.
  const messagesRef = useRef<ChatMessage[]>([])
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const upsertAssistant = useCallback(
    (id: string, mutate: (m: ChatMessage) => ChatMessage) => {
      setMessages(prev => {
        const idx = prev.findIndex(m => m.id === id)
        if (idx === -1) return prev
        const next = prev.slice()
        next[idx] = mutate(next[idx])
        return next
      })
    },
    [],
  )

  // Drive a single streamed turn against an EXISTING assistant placeholder. Shared
  // by `send` (fresh user turn) and `retry` (re-run a transport-failed turn without
  // adding a second user bubble). `history` is the prior context to send; `text` is
  // the user message being answered.
  const runTurn = useCallback(
    (
      text: string,
      history: TurnHistory,
      assistantId: string,
      opts?: {onReplyChunk?: (fullText: string) => void},
    ) => {
      setIsStreaming(true)

      let acc = ''
      const {abort} = streamChat(
        {text, history, agent},
        {
          onTextDelta: delta => {
            acc += delta
            upsertAssistant(assistantId, m => ({...m, text: acc}))
            opts?.onReplyChunk?.(acc)
          },
          onActions: actions => {
            upsertAssistant(assistantId, m => ({...m, actions}))
          },
          onDone: result => {
            // `result.message` is authoritative (the guard can replace the streamed
            // text and the approval decoration appends to it). Fall back to the
            // accumulated chunks if a stream ended without a `done` frame.
            const finalText = result?.message || acc
            if (finalText) acc = finalText
            upsertAssistant(assistantId, m => ({
              ...m,
              text: finalText || m.text,
              pending: false,
              status: result?.status ?? m.status,
              mediaUrls: result?.mediaUrls ?? m.mediaUrls,
            }))
            if (finalText) opts?.onReplyChunk?.(finalText)
            setIsStreaming(false)
            abortRef.current = null
          },
          onError: (message, kind) => {
            if (kind === 'transport') {
              // TRANSPORT failure (dropped connection): do NOT push the raw network
              // string into the bubble masquerading as Bob's reply. Drop the empty
              // placeholder, stash the turn for retry, and let the screen show a
              // quiet "tap to retry" affordance instead.
              setMessages(prev => prev.filter(m => m.id !== assistantId))
              retryRef.current = {text, history}
              setTransportError(true)
            } else {
              // SERVER/auth-reported error: keep it visible as a real message so the
              // user sees what the runtime actually said (distinct from a blip).
              upsertAssistant(assistantId, m => ({
                ...m,
                pending: false,
                status: 'error',
                text: m.text || `⚠️ ${message}`,
              }))
            }
            setIsStreaming(false)
            abortRef.current = null
          },
        },
      )
      abortRef.current = abort
    },
    [agent, upsertAssistant],
  )

  const send = useCallback(
    (text: string, opts?: {onReplyChunk?: (fullText: string) => void}) => {
      const trimmed = text.trim()
      if (!trimmed || isStreaming) return

      // A new turn clears any prior transport-failure affordance (and its retry ctx).
      setTransportError(false)
      retryRef.current = null

      const userMsg: ChatMessage = {
        id: newId('u'),
        role: 'user',
        text: trimmed,
        createdAt: Date.now(),
      }
      const assistantId = newId('a')
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        text: '',
        pending: true,
        createdAt: Date.now(),
      }

      const history = messagesRef.current.map(m => ({
        role: m.role,
        text: m.text,
      }))

      setMessages(prev => [...prev, userMsg, assistantMsg])
      runTurn(trimmed, history, assistantId, opts)
    },
    [isStreaming, runTurn],
  )

  // Re-run the last transport-failed turn. The user's message bubble is already on
  // screen (only the assistant placeholder was dropped), so we add a fresh assistant
  // placeholder and replay the stored text/history — no duplicate user bubble.
  const retry = useCallback(() => {
    const ctx = retryRef.current
    if (!ctx || isStreaming) return
    setTransportError(false)
    retryRef.current = null

    const assistantId = newId('a')
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      text: '',
      pending: true,
      createdAt: Date.now(),
    }
    setMessages(prev => [...prev, assistantMsg])
    runTurn(ctx.text, ctx.history, assistantId)
  }, [isStreaming, runTurn])

  const abort = useCallback(() => {
    abortRef.current?.()
    abortRef.current = null
    setIsStreaming(false)
    setTransportError(false)
    setMessages(prev => prev.map(m => (m.pending ? {...m, pending: false} : m)))
  }, [])

  const decide = useCallback(
    async (action: ApprovalAction, decision: 'approve' | 'reject') => {
      // Remember which message currently holds the card so we can restore it if the
      // server rejects the decision (read from the post-commit mirror, no stale closure).
      const holderId =
        messagesRef.current.find(m => m.actions?.some(a => a.id === action.id))?.id ?? null
      // Optimistically remove the action card from whichever message holds it.
      setMessages(prev =>
        prev.map(m =>
          m.actions?.some(a => a.id === action.id)
            ? {...m, actions: m.actions.filter(a => a.id !== action.id)}
            : m,
        ),
      )
      const ok = await postApprovalDecision({actionId: action.id, decision, agent})
      // RESTORE ON FAILURE: if the runtime did not accept the decision, the action is
      // STILL pending server-side — an optimistic removal would lie to the user (the
      // card vanishes while the item lingers and is later resurfaced). Put the card back
      // so the queue state the user sees matches the server's.
      if (!ok && holderId) {
        setMessages(prev =>
          prev.map(m =>
            m.id === holderId && !m.actions?.some(a => a.id === action.id)
              ? {...m, actions: [...(m.actions ?? []), action]}
              : m,
          ),
        )
      }
    },
    [agent],
  )

  return {
    messages,
    isStreaming,
    isHydrating,
    send,
    abort,
    decide,
    transportError,
    retry,
  }
}
