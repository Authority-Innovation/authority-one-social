import {useCallback, useEffect, useRef, useState} from 'react'

import {
  type ApprovalAction,
  type ChatMessage,
  type ChatRole,
  fetchHistory,
  fetchThreadMessages,
  makeThreadTransport,
  postApprovalDecision,
  streamChat,
} from '#/lib/agent-runtime'

type TurnHistory = {role: ChatRole; text: string}[]

let idSeq = 0
const newId = (p: string) => `${p}_${Date.now()}_${idSeq++}`

/** How often a mounted thread chat re-reads its server history for live updates. */
export const THREAD_POLL_INTERVAL_MS = 4000

/** Content identity of a message, ignoring client-generated ids. */
function contentSig(m: ChatMessage): string {
  return JSON.stringify([m.role, m.senderName ?? '', m.text, m.mediaUrls ?? []])
}

/**
 * Merge a freshly-fetched server history into the local list. Server content is
 * authoritative for settled turns, but fetched rows get NEW client ids each time, so
 * matching rows REUSE the existing local objects (stable React keys, and an unchanged
 * poll returns `prev` itself — no re-render, no scroll jump). Local-only rows survive
 * when they are still meaningful: an in-flight pending placeholder, or a just-sent
 * local turn the server hasn't persisted yet (newer than the newest server row).
 * Exported for tests. PURE.
 */
export function mergeServerMessages(
  prev: ChatMessage[],
  server: ChatMessage[],
): ChatMessage[] {
  const unused = [...prev]
  let changed = false
  const out: ChatMessage[] = server.map(srow => {
    const i = unused.findIndex(
      p => !p.pending && contentSig(p) === contentSig(srow),
    )
    if (i !== -1) {
      const [hit] = unused.splice(i, 1)
      return hit
    }
    changed = true
    return srow
  })
  const newestServerAt = server.reduce(
    (max, s) => Math.max(max, s.createdAt || 0),
    0,
  )
  for (const p of unused) {
    if (p.pending || (p.createdAt || 0) > newestServerAt) {
      out.push(p)
    } else {
      changed = true // a stale local row was dropped in favor of server truth
    }
  }
  if (!changed && out.length === prev.length) {
    return prev
  }
  return out
}

export interface UseAgentChat {
  messages: ChatMessage[]
  isStreaming: boolean
  /**
   * True until the initial history load settles. The screen can show a quiet loader
   * (instead of the empty-state copy) so a returning user doesn't see a flash of
   * "blank chat" before their recent thread hydrates.
   */
  isHydrating: boolean
  /**
   * Send a user message and stream the reply. `onReplyChunk` lets the caller pipe
   * text to TTS. `images` are hosted R2 URLs (already uploaded) to attach to the turn;
   * a turn may be image-only (empty text) when images are present.
   */
  send: (
    text: string,
    opts?: {onReplyChunk?: (fullText: string) => void; images?: string[]},
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
 *
 * When `opts.threadId` is set, the SAME machine drives a multi-chat thread instead of
 * the default Talk-to-Bob channel: history loads from the thread and turns POST to the
 * thread's send endpoint (non-streaming) — the UI is identical. Without a threadId it is
 * the existing single-chat behavior (back-compat).
 */
export function useAgentChat(
  agent?: string,
  opts?: {threadId?: string; selfSenderId?: string},
): UseAgentChat {
  const threadId = opts?.threadId
  // The CURRENT signed-in account's identity (DID). Stamped onto locally-created
  // user turns so group attribution can match strictly on sender identity — a
  // message is "You" only when ITS sender is the viewer, never inferred from role.
  const selfSenderId = opts?.selfSenderId
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [isHydrating, setIsHydrating] = useState(true)
  // Set only on a TRANSPORT failure (see UseAgentChat.transportError). The text +
  // history of that failed turn live in `retryRef` so `retry` can re-run it.
  const [transportError, setTransportError] = useState(false)
  const retryRef = useRef<{
    text: string
    history: TurnHistory
    images?: string[]
  } | null>(null)
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
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const load = async (): Promise<{messages: ChatMessage[]; ok: boolean}> => {
      if (threadId) {
        return fetchThreadMessages(threadId)
      }
      // E6 agent selector: scope the read to THIS agent's 1:1 thread when the
      // caller picked one; absent -> the owner's primary agent (back-compat).
      const res = await fetchHistory({agent})
      return {messages: res.messages, ok: !res.error && !res.signedOut}
    }
    const hydrate = async (attempt: number) => {
      const loaded = await load()
      if (cancelled) return
      if (loaded.messages.length > 0) {
        setMessages(prev => (prev.length === 0 ? loaded.messages : prev))
      }
      // A FAILED read (auth race / transient network) is not "no history": retry
      // once shortly instead of settling on a false empty-chat screen. A genuinely
      // empty thread (ok:true) settles immediately.
      if (!loaded.ok && attempt === 0) {
        retryTimer = setTimeout(() => void hydrate(1), 1500)
        return
      }
      setIsHydrating(false)
    }
    void hydrate(0)
    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
    // Re-hydrate if the thread OR selected agent changes; the empty-list guard
    // makes a re-run safe.
  }, [threadId, agent])
  // Mirror of messages for building the history payload without stale closures.
  // Written in an effect (not during render) so we never mutate a ref mid-render;
  // `send` only reads it from event handlers, which always run post-commit.
  const messagesRef = useRef<ChatMessage[]>([])
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])
  // Mirror of isStreaming so the poll below can skip while a turn is in flight
  // without re-arming its interval on every streaming transition.
  const isStreamingRef = useRef(false)
  useEffect(() => {
    isStreamingRef.current = isStreaming
  }, [isStreaming])

  // LIVE UPDATES (threads): other participants — group agents on their own turn
  // schedule, other members — write into the thread server-side, and the send
  // round-trip only ever carries THIS device's turn. Poll the thread history while
  // the screen is mounted and merge new rows in, so an agent's reply appears
  // without leaving and re-entering the chat. The merge reuses existing message
  // objects for unchanged rows, so an idle poll is a no-op render-wise (no scroll
  // jumps), and it skips entirely while a local turn is streaming so optimistic
  // state is never clobbered mid-flight.
  useEffect(() => {
    if (!threadId) return
    let cancelled = false
    let inFlight = false
    const tick = async () => {
      if (cancelled || inFlight || isStreamingRef.current) return
      inFlight = true
      try {
        const loaded = await fetchThreadMessages(threadId)
        if (cancelled || isStreamingRef.current) return
        // Merge only a SUCCESSFUL read; a failed poll must not touch local state.
        if (loaded.ok && loaded.messages.length > 0) {
          setMessages(prev => mergeServerMessages(prev, loaded.messages))
        }
      } finally {
        inFlight = false
      }
    }
    const interval = setInterval(() => {
      void tick()
    }, THREAD_POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [threadId])

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
      opts?: {onReplyChunk?: (fullText: string) => void; images?: string[]},
    ) => {
      setIsStreaming(true)

      // Thread turns POST to the thread's send endpoint (JSON reply); the default
      // channel streams via SSE. Both satisfy the same transport contract.
      const startTurn = threadId ? makeThreadTransport(threadId) : streamChat

      let acc = ''
      const {abort} = startTurn(
        {text, history, agent, images: opts?.images},
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
            // A SILENT turn is a deliberate no-op (e.g. a group agent that wasn't
            // addressed). Drop the empty assistant placeholder entirely rather than
            // leaving a blank bubble — but only when there's genuinely nothing to show
            // (no text, media, or approval actions arrived for it).
            const isSilent =
              result?.silent === true || result?.status === 'silent'
            if (isSilent && !finalText && !(result?.mediaUrls?.length ?? 0)) {
              setMessages(prev => {
                const held = prev.find(m => m.id === assistantId)
                if (held?.actions?.length) return prev // keep: it carries an action card
                return prev.filter(m => m.id !== assistantId)
              })
              setIsStreaming(false)
              abortRef.current = null
              return
            }
            if (finalText) acc = finalText
            upsertAssistant(assistantId, m => ({
              ...m,
              text: finalText || m.text,
              pending: false,
              status: result?.status ?? m.status,
              mediaUrls: result?.mediaUrls ?? m.mediaUrls,
              // Group attribution: the responding persona's name/identity when the
              // runtime sends them (else the screen falls back to the agent name).
              senderName: result?.senderName ?? m.senderName,
              senderId: result?.senderId ?? m.senderId,
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
              retryRef.current = {text, history, images: opts?.images}
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
    [agent, threadId, upsertAssistant],
  )

  const send = useCallback(
    (
      text: string,
      opts?: {onReplyChunk?: (fullText: string) => void; images?: string[]},
    ) => {
      const trimmed = text.trim()
      const images = opts?.images ?? []
      // Allow an image-only turn (no text) when at least one image is attached.
      if ((!trimmed && images.length === 0) || isStreaming) return

      // A new turn clears any prior transport-failure affordance (and its retry ctx).
      setTransportError(false)
      retryRef.current = null

      const userMsg: ChatMessage = {
        id: newId('u'),
        role: 'user',
        text: trimmed,
        createdAt: Date.now(),
        ...(selfSenderId ? {senderId: selfSenderId} : {}),
        ...(images.length > 0 ? {mediaUrls: images} : {}),
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
    [isStreaming, runTurn, selfSenderId],
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
    runTurn(ctx.text, ctx.history, assistantId, {images: ctx.images})
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
        messagesRef.current.find(m => m.actions?.some(a => a.id === action.id))
          ?.id ?? null
      // Optimistically remove the action card from whichever message holds it.
      setMessages(prev =>
        prev.map(m =>
          m.actions?.some(a => a.id === action.id)
            ? {...m, actions: m.actions.filter(a => a.id !== action.id)}
            : m,
        ),
      )
      const res = await postApprovalDecision({
        actionId: action.id,
        decision,
        agent,
      })
      if (res?.ok) return

      // Non-ok does NOT mean still-pending: the runtime consumes the draft the
      // moment it accepts a decision, so an accepted-but-failed execution comes
      // back 409 + status 'failed' and a re-posted decision 404s ('not-found').
      // Restoring the card in those states resurrects a zombie card that can never
      // be resolved — every click 404s and re-restores it, forever. Branch on the
      // body `status`, not on HTTP-ok.
      if (res?.status === 'failed') {
        // Decision accepted, execution failed — the draft is consumed. Tell the
        // user what actually happened instead of resurrecting the card.
        const failMsg: ChatMessage = {
          id: newId('a'),
          role: 'assistant',
          text: `⚠️ Couldn't complete “${action.title}”${res.error ? `: ${res.error}` : '.'}`,
          status: 'error',
          pending: false,
          createdAt: Date.now(),
        }
        setMessages(prev => [...prev, failMsg])
        return
      }
      if (res?.status === 'not-found' || res?.status === 'expired') {
        // Already resolved (or expired) server-side — nothing to restore or say.
        return
      }

      // RESTORE ON FAILURE: everything else means the action is genuinely STILL
      // pending server-side (signed-out/auth, runtime paused, transport blip, or
      // an unrecognized state) — an optimistic removal would lie to the user (the
      // card vanishes while the item lingers and is later resurfaced). Put the card
      // back so the queue state the user sees matches the server's.
      if (holderId) {
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
