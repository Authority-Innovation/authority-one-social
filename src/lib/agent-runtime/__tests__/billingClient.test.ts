import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals'

jest.mock('#/logger', () => ({logger: {error: jest.fn(), warn: jest.fn()}}))
jest.mock('../config', () => ({
  BILLING_ENDPOINT: 'https://runtime.test/app/billing',
}))
jest.mock('../authToken', () => ({getSupabaseAccessToken: jest.fn()}))

import {getSupabaseAccessToken} from '../authToken'
import {
  fetchOwnerBilling,
  formatTokenAllowance,
  normalizeOwnerBilling,
} from '../billingClient'

const mockToken = jest.mocked(getSupabaseAccessToken)
const realFetch = globalThis.fetch
const mockFetch = jest.fn<typeof fetch>()

const PAYLOAD = {
  plan: 'pro',
  allowance: 2000000,
  used: 1700000,
  remaining: 300000,
  fraction: 0.85,
  warn: true,
  reached: false,
  billingArmed: false,
  upgradeUrl: 'https://appview.test/billing?owner=did%3Aplc%3Aabc',
  manageUrl: 'https://appview.test/billing/portal?owner=did%3Aplc%3Aabc',
  plans: [
    {id: 'free', allowance: 100000},
    {id: 'pro', allowance: 2000000},
    {id: 'scale', allowance: 10000000},
  ],
}

describe('normalizeOwnerBilling', () => {
  it('maps the runtime payload to the typed shape', () => {
    const b = normalizeOwnerBilling(PAYLOAD)
    expect(b.plan).toBe('pro')
    expect(b.allowance).toBe(2000000)
    expect(b.used).toBe(1700000)
    expect(b.remaining).toBe(300000)
    expect(b.warn).toBe(true)
    expect(b.reached).toBe(false)
    expect(b.billingArmed).toBe(false)
    expect(b.upgradeUrl).toContain('/billing')
    expect(b.manageUrl).toContain('/billing/portal')
  })

  it('derives warn/reached/fraction from allowance + used (recomputed, not trusted)', () => {
    const reached = normalizeOwnerBilling({
      plan: 'free',
      allowance: 100000,
      used: 100000,
    })
    expect(reached.reached).toBe(true)
    expect(reached.remaining).toBe(0)
    expect(reached.fraction).toBe(1)

    const warn = normalizeOwnerBilling({
      plan: 'free',
      allowance: 100000,
      used: 90000,
    })
    expect(warn.warn).toBe(true)
    expect(warn.reached).toBe(false)
  })

  it('tolerates sparse/garbage payloads (never throws, safe defaults)', () => {
    const b = normalizeOwnerBilling({})
    expect(b.plan).toBe('free')
    expect(b.allowance).toBe(0)
    expect(b.used).toBe(0)
    expect(b.remaining).toBeNull()
    expect(b.fraction).toBe(0)
    expect(b.billingArmed).toBe(false)
    expect(b.upgradeUrl).toBeNull()
    expect(b.manageUrl).toBeNull()

    const junk = normalizeOwnerBilling({plan: 'nonsense', allowance: -5})
    expect(junk.plan).toBe('free')
    expect(junk.allowance).toBe(0)
  })
})

describe('fetchOwnerBilling', () => {
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
    const out = await fetchOwnerBilling()
    expect(out.signedOut).toBe(true)
    expect(out.billing).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('happy path: bearer attached, payload normalized', async () => {
    mockToken.mockResolvedValue('tok-1')
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(PAYLOAD),
    } as unknown as Response)
    const out = await fetchOwnerBilling()
    expect(mockFetch).toHaveBeenCalledWith(
      'https://runtime.test/app/billing',
      expect.objectContaining({
        method: 'GET',
        headers: {Authorization: 'Bearer tok-1'},
      }),
    )
    expect(out.signedOut).toBe(false)
    expect(out.billing?.plan).toBe('pro')
  })

  it('401/403 → signedOut; 5xx → error; network throw → error (never throws)', async () => {
    mockToken.mockResolvedValue('tok-1')
    mockFetch.mockResolvedValue({ok: false, status: 403} as unknown as Response)
    expect((await fetchOwnerBilling()).signedOut).toBe(true)
    mockFetch.mockResolvedValue({ok: false, status: 502} as unknown as Response)
    const bad = await fetchOwnerBilling()
    expect(bad.signedOut).toBe(false)
    expect(bad.error).toBe('Runtime error 502')
    mockFetch.mockRejectedValue(new Error('offline'))
    const off = await fetchOwnerBilling()
    expect(off.error).toBe('network error')
  })
})

describe('formatTokenAllowance', () => {
  it('compact and safe', () => {
    expect(formatTokenAllowance(0)).toBe('0')
    expect(formatTokenAllowance(999)).toBe('999')
    expect(formatTokenAllowance(12_345)).toBe('12k')
    expect(formatTokenAllowance(100_000)).toBe('100k')
    expect(formatTokenAllowance(2_000_000)).toBe('2M')
    expect(formatTokenAllowance(1_500_000)).toBe('1.5M')
    expect(formatTokenAllowance(NaN)).toBe('0')
  })
})
