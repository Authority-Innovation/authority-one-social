/**
 * Approval-card resolution must branch on the runtime's body `status`, not HTTP-ok.
 *
 * SYMPTOM (live): approving a social post whose execution failed (e.g. Zernio
 * "no connected account") made the card reappear forever. The runtime consumes
 * the draft the moment it accepts a decision, then reports the failed execution
 * as 409 + {status:'failed'} — and every re-click of the restored card 404s
 * ({status:'not-found'}) and restored it again. Restore is ONLY correct when the
 * action is genuinely still pending server-side (auth/paused/transport).
 */
import {beforeEach, describe, expect, it, jest} from '@jest/globals'
import {act, renderHook, waitFor} from '@testing-library/react-native'

jest.mock('#/lib/agent-runtime', () => ({
  fetchHistory: jest.fn(),
  streamChat: jest.fn(),
  postApprovalDecision: jest.fn(),
}))

import {
  type ApprovalAction,
  fetchHistory,
  postApprovalDecision,
  streamChat,
} from '#/lib/agent-runtime'
import {useAgentChat} from '../useAgentChat'

type StreamHandlers = {
  onActions: (actions: ApprovalAction[]) => void
  onDone: (result: unknown) => void
}
const mockFetchHistory = fetchHistory as unknown as jest.Mock
const mockStreamChat = streamChat as unknown as jest.Mock<
  (req: unknown, handlers: StreamHandlers) => {abort: () => void}
>
const mockDecision = postApprovalDecision as unknown as jest.Mock

const ACTION: ApprovalAction = {
  id: 'act-1',
  kind: 'social.post',
  title: 'Post to Facebook',
}

/** Mount the hook and drive one turn that leaves an approval card on screen. */
async function mountWithCard() {
  mockFetchHistory.mockResolvedValue({signedOut: false, messages: []} as never)
  mockStreamChat.mockImplementation(
    (_req: unknown, handlers: StreamHandlers) => {
      handlers.onActions([ACTION])
      handlers.onDone({
        message: 'Draft ready — approve to post.',
        status: 'drafted',
        pending: [],
        mediaUrls: [],
      })
      return {abort: jest.fn()}
    },
  )
  const hook = renderHook(() => useAgentChat('ada'))
  await waitFor(() => expect(hook.result.current.isHydrating).toBe(false))
  act(() => hook.result.current.send('post this to facebook'))
  const assistant = hook.result.current.messages.find(
    m => m.role === 'assistant',
  )
  expect(assistant?.actions).toEqual([ACTION])
  return hook
}

function cardCount(messages: {actions?: ApprovalAction[]}[]) {
  return messages.filter(m => m.actions?.some(a => a.id === ACTION.id)).length
}

describe('useAgentChat decide — approval card resolution', () => {
  beforeEach(() => {
    mockFetchHistory.mockReset()
    mockStreamChat.mockReset()
    mockDecision.mockReset()
  })

  it('successful execution → card stays removed, no extra message', async () => {
    const {result} = await mountWithCard()
    mockDecision.mockResolvedValueOnce({ok: true, status: 'executed'} as never)

    const before = result.current.messages.length
    await act(async () => {
      await result.current.decide(ACTION, 'approve')
    })

    expect(cardCount(result.current.messages)).toBe(0)
    expect(result.current.messages).toHaveLength(before)
  })

  it("status:'failed' → card removed AND the execution error is shown as an assistant message", async () => {
    const {result} = await mountWithCard()
    mockDecision.mockResolvedValueOnce({
      ok: false,
      status: 'failed',
      error: "Couldn't post: Facebook isn't connected",
    } as never)

    await act(async () => {
      await result.current.decide(ACTION, 'approve')
    })

    // The draft is consumed server-side — restoring it would create the
    // unresolvable zombie card. It must NOT come back.
    expect(cardCount(result.current.messages)).toBe(0)

    const last = result.current.messages[result.current.messages.length - 1]
    expect(last.role).toBe('assistant')
    expect(last.status).toBe('error')
    expect(last.text).toContain("Facebook isn't connected")
    expect(last.text).toContain(ACTION.title)
  })

  it("status:'failed' without an error string still notifies (generic line)", async () => {
    const {result} = await mountWithCard()
    mockDecision.mockResolvedValueOnce({ok: false, status: 'failed'} as never)

    await act(async () => {
      await result.current.decide(ACTION, 'approve')
    })

    expect(cardCount(result.current.messages)).toBe(0)
    const last = result.current.messages[result.current.messages.length - 1]
    expect(last.status).toBe('error')
    expect(last.text).toContain(ACTION.title)
  })

  it("status:'not-found' → card removed silently (already consumed)", async () => {
    const {result} = await mountWithCard()
    mockDecision.mockResolvedValueOnce({
      ok: false,
      status: 'not-found',
    } as never)

    const before = result.current.messages.length
    await act(async () => {
      await result.current.decide(ACTION, 'approve')
    })

    expect(cardCount(result.current.messages)).toBe(0)
    expect(result.current.messages).toHaveLength(before)
  })

  it("status:'expired' → card removed silently", async () => {
    const {result} = await mountWithCard()
    mockDecision.mockResolvedValueOnce({ok: false, status: 'expired'} as never)

    const before = result.current.messages.length
    await act(async () => {
      await result.current.decide(ACTION, 'reject')
    })

    expect(cardCount(result.current.messages)).toBe(0)
    expect(result.current.messages).toHaveLength(before)
  })

  it("status:'paused' → still pending server-side, card restored", async () => {
    const {result} = await mountWithCard()
    mockDecision.mockResolvedValueOnce({ok: false, status: 'paused'} as never)

    await act(async () => {
      await result.current.decide(ACTION, 'approve')
    })

    expect(cardCount(result.current.messages)).toBe(1)
  })

  it('auth failure (401/403) → card restored', async () => {
    const {result} = await mountWithCard()
    mockDecision.mockResolvedValueOnce({ok: false, status: 'auth'} as never)

    await act(async () => {
      await result.current.decide(ACTION, 'approve')
    })

    expect(cardCount(result.current.messages)).toBe(1)
  })

  it('transport failure → card restored', async () => {
    const {result} = await mountWithCard()
    mockDecision.mockResolvedValueOnce({
      ok: false,
      status: 'transport',
    } as never)

    await act(async () => {
      await result.current.decide(ACTION, 'approve')
    })

    expect(cardCount(result.current.messages)).toBe(1)
  })

  it('undefined client result (defensive) → card restored', async () => {
    const {result} = await mountWithCard()
    mockDecision.mockResolvedValueOnce(undefined as never)

    await act(async () => {
      await result.current.decide(ACTION, 'approve')
    })

    expect(cardCount(result.current.messages)).toBe(1)
  })

  it('restore is idempotent — the card is not duplicated on its holder', async () => {
    const {result} = await mountWithCard()
    mockDecision.mockResolvedValue({ok: false, status: 'paused'} as never)

    await act(async () => {
      await result.current.decide(ACTION, 'approve')
    })
    await act(async () => {
      await result.current.decide(ACTION, 'approve')
    })

    const holder = result.current.messages.find(m =>
      m.actions?.some(a => a.id === ACTION.id),
    )
    expect(holder?.actions?.filter(a => a.id === ACTION.id)).toHaveLength(1)
    expect(cardCount(result.current.messages)).toBe(1)
  })
})
