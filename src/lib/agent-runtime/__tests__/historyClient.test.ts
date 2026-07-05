import {beforeEach, describe, expect, it, jest} from '@jest/globals'

// Keep the test off the real logger transport graph.
jest.mock('#/logger', () => ({logger: {error: jest.fn(), warn: jest.fn()}}))

// Stable endpoint so we don't pull in #/lib/constants.
jest.mock('../config', () => ({
  HISTORY_ENDPOINT: 'https://runtime.test/app/history',
}))

// SINGLE-LOGIN: setSupabaseTokenProvider is a no-op, so mock the token reader
// itself (same pattern as agentsClient.test.ts).
jest.mock('../authToken', () => ({getSupabaseAccessToken: jest.fn()}))

import {getSupabaseAccessToken} from '../authToken'
import {fetchHistory} from '../historyClient'

const mockToken = jest.mocked(getSupabaseAccessToken)

// Mock the global fetch the history client uses (plain fetch, not expo/fetch).
const mockFetch = jest.fn()
// @ts-expect-error test shim
global.fetch = mockFetch

function okJson(obj: unknown) {
  return {status: 200, ok: true, json: () => Promise.resolve(obj)}
}

describe('fetchHistory', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockToken.mockResolvedValue('TOKEN_ABC')
  })

  it('attaches the Supabase bearer and GETs the history endpoint', async () => {
    mockFetch.mockResolvedValue(okJson({history: []}) as never)

    await fetchHistory()

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://runtime.test/app/history')
    expect(init.method).toBe('GET')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer TOKEN_ABC',
    )
  })

  it('scopes the read with ?agent= when a specific agent is requested (E6 selector)', async () => {
    mockFetch.mockResolvedValue(okJson({history: []}) as never)

    await fetchHistory({agent: 'bull.pds.test'})

    const [url] = mockFetch.mock.calls[0] as [string]
    expect(url).toBe('https://runtime.test/app/history?agent=bull.pds.test')
  })

  it('maps wire entries to ChatMessage (agent→assistant) carrying channel + mediaUrls', async () => {
    mockFetch.mockResolvedValue(
      okJson({
        history: [
          {
            role: 'user',
            text: 'from my phone',
            channel: 'sms',
            mediaUrls: [],
            at: '2026-06-22T00:00:00.000Z',
          },
          {
            role: 'agent',
            text: 'here you go',
            channel: 'app',
            mediaUrls: ['https://r2/p.png'],
            at: '2026-06-22T00:01:00.000Z',
          },
          {
            role: 'agent',
            text: 'voice reply',
            channel: 'voice',
            mediaUrls: [],
            at: null,
          },
        ],
      }) as never,
    )

    const {messages, signedOut} = await fetchHistory()

    expect(signedOut).toBe(false)
    expect(messages).toHaveLength(3)
    // role mapping: runtime 'agent' → app 'assistant'; 'user' stays 'user'.
    expect(messages[0].role).toBe('user')
    expect(messages[1].role).toBe('assistant')
    // channel + media ride along for the bubble to annotate / render.
    expect(messages[0].channel).toBe('sms')
    expect(messages[1].mediaUrls).toEqual(['https://r2/p.png'])
    expect(messages[2].channel).toBe('voice')
    // timestamps parse; a null `at` falls back to a finite number (now).
    expect(Number.isFinite(messages[0].createdAt)).toBe(true)
    expect(Number.isFinite(messages[2].createdAt)).toBe(true)
  })

  it('signed out → returns empty + signedOut, never calls the runtime', async () => {
    mockToken.mockResolvedValue(null)

    const result = await fetchHistory()

    expect(mockFetch).not.toHaveBeenCalled()
    expect(result.signedOut).toBe(true)
    expect(result.messages).toEqual([])
  })

  it('401/403 → empty (no spurious error on first open), does not throw', async () => {
    mockFetch.mockResolvedValue({status: 401, ok: false} as never)

    const result = await fetchHistory()

    expect(result.messages).toEqual([])
    expect(result.signedOut).toBe(false)
  })

  it('network error → empty + error string, never throws', async () => {
    mockFetch.mockRejectedValue(new Error('boom') as never)

    const result = await fetchHistory()

    expect(result.messages).toEqual([])
    expect(result.error).toBeDefined()
  })

  it('tolerates a missing/garbled `history` field (returns empty)', async () => {
    mockFetch.mockResolvedValue(okJson({not_history: 1}) as never)

    const result = await fetchHistory()

    expect(result.messages).toEqual([])
  })
})
