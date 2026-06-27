/**
 * Transport failures must NOT render as a fake assistant bubble.
 *
 * SYMPTOM (live): a dropped /app/chat connection showed up as a literal message
 * bubble — "⚠️ fetch failed: The network connection was lost." — masquerading as
 * Bob's reply. The hook now distinguishes a TRANSPORT failure (kind: 'transport')
 * from a SERVER/auth error (kind: 'server'): transport drops the empty placeholder
 * and exposes `transportError` + `retry` for a quiet retry affordance, while server
 * errors stay visible as a real message.
 *
 * We mock `#/lib/agent-runtime` so the test drives the hook's error/retry paths
 * without the network or the heavy client graph.
 */
import {beforeEach, describe, expect, it, jest} from '@jest/globals'
import {act, renderHook, waitFor} from '@testing-library/react-native'

jest.mock('#/lib/agent-runtime', () => ({
  fetchHistory: jest.fn(),
  streamChat: jest.fn(),
  postApprovalDecision: jest.fn(),
}))

import {fetchHistory, streamChat} from '#/lib/agent-runtime'
import {useAgentChat} from '../useAgentChat'

const mockFetchHistory = fetchHistory as unknown as jest.Mock
const mockStreamChat = streamChat as unknown as jest.Mock

async function mountSettled() {
  mockFetchHistory.mockResolvedValue({signedOut: false, messages: []} as never)
  const hook = renderHook(() => useAgentChat('ada'))
  await waitFor(() => expect(hook.result.current.isHydrating).toBe(false))
  return hook
}

describe('useAgentChat transport errors', () => {
  beforeEach(() => {
    mockFetchHistory.mockReset()
    mockStreamChat.mockReset()
  })

  it('transport failure → no assistant bubble, sets transportError', async () => {
    const {result} = await mountSettled()

    mockStreamChat.mockImplementation((_req: unknown, handlers: any) => {
      handlers.onError('fetch failed: The network connection was lost.', 'transport')
      return {abort: jest.fn()}
    })

    act(() => result.current.send('hello'))

    // The user's message stays; the empty assistant placeholder is removed.
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].role).toBe('user')
    expect(result.current.messages[0].text).toBe('hello')

    // The raw network string is NEVER pushed into the message list as a bubble.
    const texts = result.current.messages.map(m => m.text)
    expect(texts.some(t => t.includes('fetch failed'))).toBe(false)
    expect(texts.some(t => t.startsWith('⚠️'))).toBe(false)

    // Instead, the inline retry affordance is flagged.
    expect(result.current.transportError).toBe(true)
    expect(result.current.isStreaming).toBe(false)
  })

  it('server error → still shown as a real ⚠️ message, no transportError', async () => {
    const {result} = await mountSettled()

    mockStreamChat.mockImplementation((_req: unknown, handlers: any) => {
      handlers.onError('Runtime error 500', 'server')
      return {abort: jest.fn()}
    })

    act(() => result.current.send('hello'))

    expect(result.current.transportError).toBe(false)
    // user + assistant(error) bubble
    expect(result.current.messages).toHaveLength(2)
    const assistant = result.current.messages[1]
    expect(assistant.role).toBe('assistant')
    expect(assistant.text).toBe('⚠️ Runtime error 500')
    expect(assistant.status).toBe('error')
  })

  it('omitted error kind defaults to server (kept visible)', async () => {
    const {result} = await mountSettled()

    mockStreamChat.mockImplementation((_req: unknown, handlers: any) => {
      handlers.onError('Sign in at /account to chat with your agent.')
      return {abort: jest.fn()}
    })

    act(() => result.current.send('hello'))

    expect(result.current.transportError).toBe(false)
    expect(result.current.messages[1].text).toContain('Sign in at /account')
  })

  it('retry replays the failed turn — one user bubble, then the reply', async () => {
    const {result} = await mountSettled()

    // First attempt drops the connection.
    mockStreamChat.mockImplementationOnce((_req: unknown, handlers: any) => {
      handlers.onError('The network connection was lost.', 'transport')
      return {abort: jest.fn()}
    })
    act(() => result.current.send('what is 2+2'))
    expect(result.current.transportError).toBe(true)
    expect(result.current.messages).toHaveLength(1)

    // Retry succeeds.
    mockStreamChat.mockImplementationOnce((req: any, handlers: any) => {
      // Replays the SAME user text, not a new one.
      expect(req.text).toBe('what is 2+2')
      handlers.onTextDelta('4')
      handlers.onDone({message: '4', status: 'answered', pending: [], mediaUrls: []})
      return {abort: jest.fn()}
    })
    act(() => result.current.retry())

    expect(result.current.transportError).toBe(false)
    // No duplicate user bubble — exactly one.
    expect(result.current.messages.filter(m => m.role === 'user')).toHaveLength(1)
    const assistant = result.current.messages.find(m => m.role === 'assistant')
    expect(assistant?.text).toBe('4')
    expect(assistant?.pending).toBe(false)
  })

  it('a fresh send clears a prior transportError', async () => {
    const {result} = await mountSettled()

    mockStreamChat.mockImplementationOnce((_req: unknown, handlers: any) => {
      handlers.onError('connection lost', 'transport')
      return {abort: jest.fn()}
    })
    act(() => result.current.send('one'))
    expect(result.current.transportError).toBe(true)

    mockStreamChat.mockImplementationOnce((_req: unknown, handlers: any) => {
      handlers.onTextDelta('ok')
      handlers.onDone({message: 'ok', status: 'answered', pending: [], mediaUrls: []})
      return {abort: jest.fn()}
    })
    act(() => result.current.send('two'))
    expect(result.current.transportError).toBe(false)
  })
})
