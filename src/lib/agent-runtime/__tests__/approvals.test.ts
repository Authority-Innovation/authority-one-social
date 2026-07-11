import {beforeEach, describe, expect, it, jest} from '@jest/globals'

// Keep the test off the real logger graph.
jest.mock('#/logger', () => ({logger: {error: jest.fn(), warn: jest.fn()}}))

// Stable endpoint/agent so we don't pull in #/lib/constants.
jest.mock('../config', () => ({
  AGENT_RUNTIME_BASE_URL: 'https://runtime.test',
  DEFAULT_AGENT: 'ada',
}))

// SINGLE-LOGIN: the bearer is the atproto session token read via authToken.ts
// (setSupabaseTokenProvider is a retained NO-OP), so mock the module itself.
const mockGetToken = jest.fn<() => Promise<string | null>>()
jest.mock('../authToken', () => ({
  getSupabaseAccessToken: () => mockGetToken(),
}))

import {postApprovalDecision} from '../approvals'

const mockFetch = jest.fn()
// approvals.ts uses the global fetch.
;(global as unknown as {fetch: unknown}).fetch = mockFetch

/** Shape a fetch Response the way approvals.ts consumes it. */
function response(httpStatus: number, body?: unknown) {
  return {
    ok: httpStatus >= 200 && httpStatus < 300,
    status: httpStatus,
    json: body === undefined ? undefined : () => Promise.resolve(body),
  }
}

describe('postApprovalDecision — runtime approval contract', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockGetToken.mockResolvedValue('tok-123')
  })

  it('POSTs to /app/approve with {id, decision} (NOT /app/approvals / actionId)', async () => {
    mockFetch.mockResolvedValueOnce(
      response(200, {ok: true, status: 'rejected'}) as never,
    )
    const res = await postApprovalDecision({
      actionId: 'act-9',
      decision: 'reject',
    })
    expect(res.ok).toBe(true)
    expect(res.status).toBe('rejected')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    // The bug was the wrong path + field — the runtime 404/400'd the decision while
    // the UI optimistically removed the card, so the action survived server-side.
    expect(url).toBe('https://runtime.test/app/approve')
    expect(url).not.toContain('/app/approvals')

    const body = JSON.parse(init.body as string) as {
      id?: string
      decision?: string
    }
    expect(body.id).toBe('act-9') // runtime reads `id`
    expect(body).not.toHaveProperty('actionId')
    expect(body.decision).toBe('reject')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer tok-123',
    )
  })

  it('approve decisions use the same corrected endpoint + field', async () => {
    mockFetch.mockResolvedValueOnce(
      response(200, {ok: true, status: 'executed'}) as never,
    )
    const res = await postApprovalDecision({
      actionId: 'act-1',
      decision: 'approve',
      agent: 'ada',
    })
    expect(res.ok).toBe(true)
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://runtime.test/app/approve')
    const body = JSON.parse(init.body as string) as {
      id?: string
      decision?: string
    }
    expect(body.id).toBe('act-1')
    expect(body.decision).toBe('approve')
  })

  it("failed execution (409 + status:'failed') surfaces the body status + friendly error", async () => {
    // The zombie-card loop: the runtime CONSUMED the draft, executed it, and the
    // execution failed. HTTP is 409 but the action is NOT pending anymore — the
    // caller must see status 'failed' (never treat this as restore-the-card).
    mockFetch.mockResolvedValueOnce(
      response(409, {
        ok: false,
        status: 'failed',
        decision: 'approve',
        id: 'act-2',
        result: {
          ok: false,
          status: 'failed',
          error: 'ZernioError: no connected account for facebook',
          friendly: "Couldn't post: Facebook isn't connected",
        },
      }) as never,
    )
    const res = await postApprovalDecision({
      actionId: 'act-2',
      decision: 'approve',
    })
    expect(res.ok).toBe(false)
    expect(res.status).toBe('failed')
    // The owner-readable `friendly` line wins over the raw error.
    expect(res.error).toBe("Couldn't post: Facebook isn't connected")
  })

  it('failed execution without a friendly line falls back to the raw result.error', async () => {
    mockFetch.mockResolvedValueOnce(
      response(409, {
        ok: false,
        status: 'failed',
        result: {ok: false, status: 'failed', error: 'provider exploded'},
      }) as never,
    )
    const res = await postApprovalDecision({
      actionId: 'act-2b',
      decision: 'approve',
    })
    expect(res.status).toBe('failed')
    expect(res.error).toBe('provider exploded')
  })

  it("already-consumed action (404 + status:'not-found') reports 'not-found'", async () => {
    mockFetch.mockResolvedValueOnce(
      response(404, {ok: false, status: 'not-found'}) as never,
    )
    const res = await postApprovalDecision({
      actionId: 'act-3',
      decision: 'approve',
    })
    expect(res.ok).toBe(false)
    expect(res.status).toBe('not-found')
  })

  it("paused runtime (409 + status:'paused') reports 'paused' — still pending", async () => {
    mockFetch.mockResolvedValueOnce(
      response(409, {ok: false, status: 'paused'}) as never,
    )
    const res = await postApprovalDecision({
      actionId: 'act-4',
      decision: 'approve',
    })
    expect(res.ok).toBe(false)
    expect(res.status).toBe('paused')
  })

  it("401/403 without a body status map to the 'auth' pseudo-status", async () => {
    mockFetch.mockResolvedValueOnce(
      response(401, {error: 'bad token'}) as never,
    )
    const res = await postApprovalDecision({
      actionId: 'act-5',
      decision: 'approve',
    })
    expect(res.ok).toBe(false)
    expect(res.status).toBe('auth')
  })

  it("other status-less non-2xx maps to 'unknown' (still treated as pending)", async () => {
    mockFetch.mockResolvedValueOnce(
      response(502, {
        error: 'approve failed',
        detail: 'DO fetch threw',
      }) as never,
    )
    const res = await postApprovalDecision({
      actionId: 'act-6',
      decision: 'approve',
    })
    expect(res.ok).toBe(false)
    expect(res.status).toBe('unknown')
    expect(res.error).toBe('approve failed')
  })

  it("fetch throwing reports the 'transport' pseudo-status", async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down') as never)
    const res = await postApprovalDecision({
      actionId: 'act-7',
      decision: 'reject',
    })
    expect(res.ok).toBe(false)
    expect(res.status).toBe('transport')
  })

  it("unparseable success body still reports ok ('executed' pseudo-status)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('not json')),
    } as never)
    const res = await postApprovalDecision({
      actionId: 'act-8',
      decision: 'approve',
    })
    expect(res.ok).toBe(true)
    expect(res.status).toBe('executed')
  })

  it('does not post an unauthenticated decision (signed out → no fetch)', async () => {
    mockGetToken.mockResolvedValue(null)
    const res = await postApprovalDecision({
      actionId: 'act-10',
      decision: 'reject',
    })
    expect(res.ok).toBe(false)
    expect(res.status).toBe('signed-out')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
