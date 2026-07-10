import {beforeEach, describe, expect, it, jest} from '@jest/globals'

// Mock expo/fetch so we can observe the request and feed canned responses.
type MockRequestInit = {
  method?: string
  headers?: Record<string, string>
  body?: string
}
type MockResponse = {
  ok: boolean
  status: number
  json?: () => Promise<unknown>
  arrayBuffer?: () => Promise<ArrayBuffer>
}
const mockExpoFetch =
  jest.fn<(url: string, init?: MockRequestInit) => Promise<MockResponse>>()
jest.mock('expo/fetch', () => ({fetch: mockExpoFetch}))

jest.mock('#/logger', () => ({logger: {error: jest.fn(), warn: jest.fn()}}))

// Stable endpoints without pulling in #/lib/constants / expo env.
jest.mock('../config', () => ({
  PUBLIC_CHAT_ENDPOINT: 'https://runtime.test/public/chat',
  PUBLIC_TTS_ENDPOINT: 'https://runtime.test/public/tts',
}))

// Control the viewer bearer directly (the token now comes from the persisted atproto
// session; setSupabaseTokenProvider is a no-op, so mock the reader instead).
jest.mock('../authToken', () => ({getSupabaseAccessToken: jest.fn()}))

import {getSupabaseAccessToken} from '../authToken'
import {fetchPublicAgentAudioBase64, publicChat} from '../publicChatClient'

const mockToken = jest.mocked(getSupabaseAccessToken)

function jsonResponse(body: unknown, status = 200): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }
}
function audioResponse(bytes: number[], status = 200): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer),
  }
}

describe('publicChat', () => {
  beforeEach(() => {
    mockExpoFetch.mockReset()
    mockToken.mockResolvedValue(null) // anonymous visitor by default
  })

  it('maps a live turn → {ok, message, remaining, hasVoice}', async () => {
    mockExpoFetch.mockResolvedValue(
      jsonResponse({
        message: 'Markets never sleep, kid.',
        sessionId: 'pub_1',
        agent: 'bull.pds.authority-one.com',
        remaining: {unit: 'tokens', amount: 79, resetsAt: '2026-07-07T00:00:00.000Z'},
        exhausted: false,
        hasVoice: true,
      }),
    )
    const out = await publicChat({agent: 'bull.pds.authority-one.com', message: 'hi'})
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.message).toBe('Markets never sleep, kid.')
      expect(out.sessionId).toBe('pub_1')
      expect(out.remaining?.amount).toBe(79)
      expect(out.hasVoice).toBe(true)
    }
  })

  it('works WITHOUT a bearer (anonymous) and sends one when signed in', async () => {
    mockExpoFetch.mockResolvedValue(jsonResponse({message: 'hey', sessionId: 's', hasVoice: false}))
    await publicChat({agent: 'bull', message: 'hi'})
    let headers = mockExpoFetch.mock.calls[0][1]?.headers
    expect(headers?.Authorization).toBeUndefined() // anonymous: no bearer

    mockExpoFetch.mockClear()
    mockToken.mockResolvedValue("viewer-tok")
    await publicChat({agent: 'bull', message: 'hi'})
    headers = mockExpoFetch.mock.calls[0][1]?.headers
    expect(headers?.Authorization).toBe('Bearer viewer-tok') // signed-in: budget keyed per-DID
  })

  it('429 budget-exhausted → conversion card, not an error', async () => {
    mockExpoFetch.mockResolvedValue(
      jsonResponse(
        {error: 'budget exhausted', code: 'budget-exhausted', exhausted: true, resetsAt: '2026-07-07T00:00:00.000Z', cta: {kind: 'follow-subscribe', title: 't', body: 'b', resetsAt: '2026-07-07T00:00:00.000Z', actions: [{type: 'follow', handle: 'bull', label: 'Follow'}, {type: 'subscribe', url: null, label: 'Subscribe'}]}},
        429,
      ),
    )
    const out = await publicChat({agent: 'bull', message: 'hi'})
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.kind).toBe('exhausted')
      if (out.kind === 'exhausted') {
        expect(out.code).toBe('budget-exhausted')
        expect(out.cta?.actions[0].type).toBe('follow')
      }
    }
  })

  it('404 disabled surface → error code public-chat-disabled', async () => {
    mockExpoFetch.mockResolvedValue(jsonResponse({error: 'public chat not enabled', code: 'public-chat-disabled'}, 404))
    const out = await publicChat({agent: 'bull', message: 'hi'})
    expect(out.ok).toBe(false)
    if (!out.ok && out.kind === 'error') expect(out.code).toBe('public-chat-disabled')
  })

  it('unknown agent → error code unknown-agent', async () => {
    mockExpoFetch.mockResolvedValue(jsonResponse({error: 'unknown agent', code: 'unknown-agent'}, 404))
    const out = await publicChat({agent: 'ghost', message: 'hi'})
    expect(out.ok).toBe(false)
    if (!out.ok && out.kind === 'error') expect(out.code).toBe('unknown-agent')
  })

  it('network throw → soft error, never throws', async () => {
    mockExpoFetch.mockRejectedValue(new Error('offline'))
    const out = await publicChat({agent: 'bull', message: 'hi'})
    expect(out.ok).toBe(false)
    if (!out.ok && out.kind === 'error') expect(out.code).toBe('network')
  })
})

describe('fetchPublicAgentAudioBase64 (fail-open)', () => {
  beforeEach(() => {
    mockExpoFetch.mockReset()
    mockToken.mockResolvedValue(null)
  })

  it('returns base64 for a 200 audio response', async () => {
    mockExpoFetch.mockResolvedValue(audioResponse([102, 111, 111])) // "foo"
    const b64 = await fetchPublicAgentAudioBase64({agent: 'bull', text: 'hello'})
    expect(b64).toBe('Zm9v')
  })

  it('returns null (text only) when the proxy is unconfigured (503)', async () => {
    mockExpoFetch.mockResolvedValue(audioResponse([], 503))
    const b64 = await fetchPublicAgentAudioBase64({agent: 'bull', text: 'hello'})
    expect(b64).toBeNull()
  })

  it('returns null for blank text without calling the proxy', async () => {
    const b64 = await fetchPublicAgentAudioBase64({agent: 'bull', text: '  '})
    expect(b64).toBeNull()
    expect(mockExpoFetch).not.toHaveBeenCalled()
  })

  it('never trusts a client voiceId — body carries only agent/text/sessionId', async () => {
    mockExpoFetch.mockResolvedValue(audioResponse([1, 2, 3]))
    await fetchPublicAgentAudioBase64({agent: 'bull', text: 'hi', sessionId: 's1'})
    const body = JSON.parse(
      mockExpoFetch.mock.calls[0][1]?.body ?? '{}',
    ) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['agent', 'sessionId', 'text'])
  })
})
