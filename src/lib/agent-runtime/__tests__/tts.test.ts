import {beforeEach, describe, expect, it, jest} from '@jest/globals'

// Mock expo/fetch so we can observe the TTS request and feed canned responses.
const mockExpoFetch = jest.fn()
jest.mock('expo/fetch', () => ({fetch: mockExpoFetch}))

jest.mock('#/logger', () => ({logger: {error: jest.fn(), warn: jest.fn()}}))

// Stable endpoint/voice id without pulling in #/lib/constants.
jest.mock('../config', () => ({
  TTS_ENDPOINT: 'https://runtime.test/app/tts',
  BOB_VOICE_ID: 'bob-default',
}))

import {setSupabaseTokenProvider} from '../authToken'
import {bytesToBase64, fetchBobAudioBase64} from '../tts'

function audioResponse(bytes: number[], status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {get: () => 'audio/mpeg'},
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  }
}

describe('bytesToBase64', () => {
  it('matches known vectors (incl. padding)', () => {
    expect(bytesToBase64(new Uint8Array([]))).toBe('')
    expect(bytesToBase64(new Uint8Array([102]))).toBe('Zg==') // "f"
    expect(bytesToBase64(new Uint8Array([102, 111]))).toBe('Zm8=') // "fo"
    expect(bytesToBase64(new Uint8Array([102, 111, 111]))).toBe('Zm9v') // "foo"
    expect(bytesToBase64(new Uint8Array([1, 2, 3, 4]))).toBe('AQIDBA==')
  })
})

describe('fetchBobAudioBase64', () => {
  beforeEach(() => {
    mockExpoFetch.mockReset()
    setSupabaseTokenProvider(async () => 'tok-123')
  })

  it('returns null (fallback) when signed out — never calls the proxy', async () => {
    setSupabaseTokenProvider(async () => null)
    const out = await fetchBobAudioBase64('hello')
    expect(out).toBeNull()
    expect(mockExpoFetch).not.toHaveBeenCalled()
  })

  it('returns null for blank text', async () => {
    const out = await fetchBobAudioBase64('   ')
    expect(out).toBeNull()
    expect(mockExpoFetch).not.toHaveBeenCalled()
  })

  it('sends the bearer + text + voiceId and returns base64 on success', async () => {
    mockExpoFetch.mockResolvedValue(audioResponse([1, 2, 3, 4]))
    const out = await fetchBobAudioBase64('speak this')
    expect(out).toBe('AQIDBA==')
    const [url, init] = mockExpoFetch.mock.calls[0] as [string, any]
    expect(url).toBe('https://runtime.test/app/tts')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer tok-123')
    const body = JSON.parse(init.body)
    expect(body.text).toBe('speak this')
    expect(body.voiceId).toBe('bob-default')
  })

  it('honors an explicit voiceId override', async () => {
    mockExpoFetch.mockResolvedValue(audioResponse([9]))
    await fetchBobAudioBase64('hi', {voiceId: 'bob-v5'})
    const init = mockExpoFetch.mock.calls[0][1] as any
    expect(JSON.parse(init.body).voiceId).toBe('bob-v5')
  })

  it('returns null on 503 (proxy unconfigured) → on-device fallback', async () => {
    mockExpoFetch.mockResolvedValue(audioResponse([], 503))
    expect(await fetchBobAudioBase64('hi')).toBeNull()
  })

  it('returns null on a network error → on-device fallback', async () => {
    mockExpoFetch.mockRejectedValue(new Error('offline'))
    expect(await fetchBobAudioBase64('hi')).toBeNull()
  })

  it('returns null on empty audio body', async () => {
    mockExpoFetch.mockResolvedValue(audioResponse([]))
    expect(await fetchBobAudioBase64('hi')).toBeNull()
  })
})
