import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals'

jest.mock('#/logger', () => ({logger: {error: jest.fn(), warn: jest.fn()}}))
jest.mock('../config', () => ({
  USAGE_ENDPOINT: 'https://runtime.test/app/usage',
}))
jest.mock('../authToken', () => ({getSupabaseAccessToken: jest.fn()}))

import {getSupabaseAccessToken} from '../authToken'
import {
  fetchOwnerUsage,
  formatCostUsd,
  formatTokens,
  normalizeOwnerUsage,
} from '../usageClient'

const mockToken = jest.mocked(getSupabaseAccessToken)
const realFetch = globalThis.fetch
const mockFetch = jest.fn<typeof fetch>()

const PAYLOAD = {
  window: '7d',
  since: '2026-06-29T00:00:00.000Z',
  agents: [
    {
      agent: 'bob-agent.pds.authority-one.com',
      name: 'Bob',
      turns: 3,
      inputTokens: 3000,
      outputTokens: 300,
      totalTokens: 3300,
      costUsd: 0.0135,
      bySource: [
        {
          source: 'whatsapp',
          turns: 2,
          inputTokens: 2000,
          outputTokens: 200,
          totalTokens: 2200,
          costUsd: 0.009,
        },
        {
          source: 'imessage',
          turns: 1,
          inputTokens: 1000,
          outputTokens: 100,
          totalTokens: 1100,
          costUsd: 0.0045,
        },
      ],
    },
  ],
  total: {
    turns: 3,
    inputTokens: 3000,
    outputTokens: 300,
    totalTokens: 3300,
    costUsd: 0.0135,
  },
  cost: {estimated: true, source: 'published-api-prices'},
}

describe('normalizeOwnerUsage', () => {
  it('maps the runtime payload to the typed shape', () => {
    const u = normalizeOwnerUsage(PAYLOAD)
    expect(u.window).toBe('7d')
    expect(u.agents).toHaveLength(1)
    expect(u.agents[0].agent).toBe('bob-agent.pds.authority-one.com')
    expect(u.agents[0].name).toBe('Bob')
    expect(u.agents[0].totalTokens).toBe(3300)
    expect(u.agents[0].bySource[0]).toEqual({
      source: 'whatsapp',
      turns: 2,
      inputTokens: 2000,
      outputTokens: 200,
      totalTokens: 2200,
      costUsd: 0.009,
    })
    expect(u.total.costUsd).toBe(0.0135)
    expect(u.estimated).toBe(true)
  })

  it('tolerates sparse/garbage payloads (never throws, zeros out)', () => {
    const u = normalizeOwnerUsage({})
    expect(u.window).toBe('7d')
    expect(u.agents).toEqual([])
    expect(u.total.totalTokens).toBe(0)
    const junk = normalizeOwnerUsage({
      window: 'x',
      agents: [null, {bySource: 'nope'}],
    })
    expect(junk.window).toBe('7d')
    expect(junk.agents[1].agent).toBe('unknown')
    expect(junk.agents[1].bySource).toEqual([])
  })
})

describe('fetchOwnerUsage', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockToken.mockReset()
    globalThis.fetch = mockFetch
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('signedOut when there is no session token (no network hit)', async () => {
    mockToken.mockResolvedValue(null)
    const out = await fetchOwnerUsage('7d')
    expect(out.signedOut).toBe(true)
    expect(out.usage).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('happy path: bearer attached, window in the query, payload normalized', async () => {
    mockToken.mockResolvedValue('tok-1')
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(PAYLOAD),
    } as unknown as Response)
    const out = await fetchOwnerUsage('today')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://runtime.test/app/usage?window=today',
      expect.objectContaining({
        method: 'GET',
        headers: {Authorization: 'Bearer tok-1'},
      }),
    )
    expect(out.signedOut).toBe(false)
    expect(out.usage?.agents[0].name).toBe('Bob')
  })

  it('401/403 → signedOut; 5xx → error; network throw → error (never throws)', async () => {
    mockToken.mockResolvedValue('tok-1')
    mockFetch.mockResolvedValue({ok: false, status: 401} as unknown as Response)
    expect((await fetchOwnerUsage()).signedOut).toBe(true)
    mockFetch.mockResolvedValue({ok: false, status: 502} as unknown as Response)
    const bad = await fetchOwnerUsage()
    expect(bad.signedOut).toBe(false)
    expect(bad.error).toBe('Runtime error 502')
    mockFetch.mockRejectedValue(new Error('offline'))
    const off = await fetchOwnerUsage()
    expect(off.error).toBe('network error')
  })
})

describe('formatters', () => {
  it('formatTokens: compact and safe', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(999)).toBe('999')
    expect(formatTokens(12_345)).toBe('12k')
    expect(formatTokens(1_234_567)).toBe('1.2M')
    expect(formatTokens(NaN)).toBe('0')
  })
  it('formatCostUsd: sub-cent precision, dollars above', () => {
    expect(formatCostUsd(0)).toBe('$0.00')
    expect(formatCostUsd(0.0042)).toBe('$0.0042')
    expect(formatCostUsd(1.238)).toBe('$1.24')
  })
})
