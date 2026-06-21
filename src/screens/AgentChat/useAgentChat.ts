import {useCallback, useEffect, useRef, useState} from 'react'

import {
  type ApprovalAction,
  type ChatMessage,
  postApprovalDecision,
  streamChat,
} from '#/lib/agent-runtime'

let idSeq = 0
const newId = (p: string) => `${p}_${Date.now()}_${idSeq++}`

export interface UseAgentChat {
  messages: ChatMessage[]
  isStreaming: boolean
  /** Send a user message and stream the reply. `onReplyChunk` lets the caller pipe text to TTS. */
  send: (
    text: string,
    opts?: {onReplyChunk?: (fullText: string) => void},
  ) => void
  /** Cancel the in-flight turn (e.g. user starts a new message / barge-in). */
  abort: () => void
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
  const abortRef = useRef<null | (() => void)>(null)
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

  const send = useCallback(
    (text: string, opts?: {onReplyChunk?: (fullText: string) => void}) => {
      const trimmed = text.trim()
      if (!trimmed || isStreaming) return

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
      setIsStreaming(true)

      let acc = ''
      const {abort} = streamChat(
        {text: trimmed, history, agent},
        {
          onTextDelta: delta => {
            acc += delta
            upsertAssistant(assistantId, m => ({...m, text: acc}))
            opts?.onReplyChunk?.(acc)
          },
          onActions: actions => {
            upsertAssistant(assistantId, m => ({...m, actions}))
          },
          onDone: () => {
            upsertAssistant(assistantId, m => ({...m, pending: false}))
            setIsStreaming(false)
            abortRef.current = null
          },
          onError: message => {
            upsertAssistant(assistantId, m => ({
              ...m,
              pending: false,
              text: m.text || `⚠️ ${message}`,
            }))
            setIsStreaming(false)
            abortRef.current = null
          },
        },
      )
      abortRef.current = abort
    },
    [agent, isStreaming, upsertAssistant],
  )

  const abort = useCallback(() => {
    abortRef.current?.()
    abortRef.current = null
    setIsStreaming(false)
    setMessages(prev => prev.map(m => (m.pending ? {...m, pending: false} : m)))
  }, [])

  const decide = useCallback(
    async (action: ApprovalAction, decision: 'approve' | 'reject') => {
      // Optimistically remove the action card from whichever message holds it.
      setMessages(prev =>
        prev.map(m =>
          m.actions?.some(a => a.id === action.id)
            ? {...m, actions: m.actions.filter(a => a.id !== action.id)}
            : m,
        ),
      )
      await postApprovalDecision({actionId: action.id, decision, agent})
    },
    [agent],
  )

  return {messages, isStreaming, send, abort, decide}
}
