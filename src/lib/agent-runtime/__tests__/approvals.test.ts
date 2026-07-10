import {beforeEach, describe, expect, it, jest} from '@jest/globals'

// Keep the test off the real logger graph.
jest.mock('#/logger', () => ({logger: {error: jest.fn(), warn: jest.fn()}}))

// Stable endpoint/agent so we don't pull in #/lib/constants.
jest.mock('../config', () => ({
  AGENT_RUNTIME_BASE_URL: 'https://runtime.test',
  DEFAULT_AGENT: 'ada',
}))

import {postApprovalDecision} from '../approvals'
import {setSupabaseTokenProvider} from '../authToken'

type MockRequestInit = {
  method?: string
  headers?: Record<string, string>
  body?: string
}
const mockFetch =
  jest.fn<(url: string, init?: MockRequestInit) => Promise<{ok: boolean}>>()
// approvals.ts uses the global fetch.
;(global as unknown as {fetch: unknown}).fetch = mockFetch

describe('postApprovalDecision — runtime approval contract', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    setSupabaseTokenProvider(() => Promise.resolve('tok-123'))
  })

  it('POSTs to /app/approve with {id, decision} (NOT /app/approvals / actionId)', async () => {
    mockFetch.mockResolvedValueOnce({ok: true})
    const ok = await postApprovalDecision({actionId: 'act-9', decision: 'reject'})
    expect(ok).toBe(true)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0]
    // The bug was the wrong path + field — the runtime 404/400'd the decision while
    // the UI optimistically removed the card, so the action survived server-side.
    expect(url).toBe('https://runtime.test/app/approve')
    expect(url).not.toContain('/app/approvals')

    const body = JSON.parse(init?.body ?? '{}') as {
      id?: string
      decision?: string
    }
    expect(body.id).toBe('act-9') // runtime reads `id`
    expect(body).not.toHaveProperty('actionId')
    expect(body.decision).toBe('reject')
    expect(init?.headers?.Authorization).toBe('Bearer tok-123')
  })

  it('approve decisions use the same corrected endpoint + field', async () => {
    mockFetch.mockResolvedValueOnce({ok: true})
    await postApprovalDecision({actionId: 'act-1', decision: 'approve', agent: 'ada'})
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://runtime.test/app/approve')
    const body = JSON.parse(init?.body ?? '{}') as {
      id?: string
      decision?: string
    }
    expect(body.id).toBe('act-1')
    expect(body.decision).toBe('approve')
  })

  it('reports failure (false) when the runtime rejects the decision — caller can restore the card', async () => {
    mockFetch.mockResolvedValueOnce({ok: false})
    const ok = await postApprovalDecision({actionId: 'act-2', decision: 'reject'})
    expect(ok).toBe(false)
  })

  it('does not post an unauthenticated decision (signed out → false, no fetch)', async () => {
    setSupabaseTokenProvider(() => Promise.resolve(null))
    const ok = await postApprovalDecision({actionId: 'act-3', decision: 'reject'})
    expect(ok).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
