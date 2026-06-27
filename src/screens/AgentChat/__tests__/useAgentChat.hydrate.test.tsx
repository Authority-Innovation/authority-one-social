/**
 * Hydration-on-mount for the AgentChat hook. The screen keeps messages only in
 * transient React state, so navigating away and back returned a BLANK chat. The hook
 * now reads the runtime's per-owner rolling window (GET /app/history, via fetchHistory)
 * on mount and seeds the message list with it — a UNIFIED, cross-channel thread.
 *
 * We mock `#/lib/agent-runtime` so the test exercises the hook's mount behavior without
 * the network or the heavy client graph.
 */
import {beforeEach, describe, expect, it, jest} from '@jest/globals'
import {renderHook, waitFor} from '@testing-library/react-native'

jest.mock('#/lib/agent-runtime', () => ({
  fetchHistory: jest.fn(),
  streamChat: jest.fn(),
  postApprovalDecision: jest.fn(),
}))

import {fetchHistory} from '#/lib/agent-runtime'
import {useAgentChat} from '../useAgentChat'

const mockFetchHistory = fetchHistory as unknown as jest.Mock

describe('useAgentChat hydration on mount', () => {
  beforeEach(() => {
    mockFetchHistory.mockReset()
  })

  it('loads history on mount and seeds the message list (cross-channel)', async () => {
    mockFetchHistory.mockResolvedValue({
      signedOut: false,
      messages: [
        {id: 'h1', role: 'user', text: 'texted you earlier', channel: 'sms', mediaUrls: [], createdAt: 1},
        {id: 'h2', role: 'assistant', text: 'here is that photo', channel: 'app', mediaUrls: ['https://r2/p.png'], createdAt: 2},
      ],
    } as never)

    const {result} = renderHook(() => useAgentChat('ada'))

    // The read fires exactly once on mount.
    expect(mockFetchHistory).toHaveBeenCalledTimes(1)
    // Initially hydrating (so the screen shows a loader, not blank/empty-state).
    expect(result.current.isHydrating).toBe(true)

    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    expect(result.current.isHydrating).toBe(false)
    // The unified thread carries the off-app origin + media for the bubble to render.
    expect(result.current.messages[0].channel).toBe('sms')
    expect(result.current.messages[1].mediaUrls).toEqual(['https://r2/p.png'])
  })

  it('empty history → no messages, hydration still settles (shows empty-state, not a hang)', async () => {
    mockFetchHistory.mockResolvedValue({signedOut: false, messages: []} as never)

    const {result} = renderHook(() => useAgentChat('ada'))

    await waitFor(() => expect(result.current.isHydrating).toBe(false))
    expect(result.current.messages).toEqual([])
  })

  it('signed out → empty + settled (the screen surfaces its own sign-in prompt)', async () => {
    mockFetchHistory.mockResolvedValue({signedOut: true, messages: []} as never)

    const {result} = renderHook(() => useAgentChat('ada'))

    await waitFor(() => expect(result.current.isHydrating).toBe(false))
    expect(result.current.messages).toEqual([])
  })
})
