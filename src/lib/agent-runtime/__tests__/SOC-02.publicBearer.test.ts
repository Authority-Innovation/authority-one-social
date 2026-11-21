import {describe, expect, it, jest} from '@jest/globals'

/**
 * SOC-02 (needs-decision): the user's full-scope atproto access JWT is the bearer for
 * every agent-runtime call, and is also attached best-effort to the unauthenticated
 * /public/chat and /public/tts endpoints so the runtime can key the visitor budget per
 * DID. Removing it changes the visitor budget policy and needs a runtime-side signed
 * visitor id, so the fix is pending a decision. These tests describe the target state
 * and are skipped so the suite stays green; enable them with the fix.
 */

type MockRequestInit = {headers?: Record<string, string>}
const mockExpoFetch =
  jest.fn<
    (
      url: string,
      init?: MockRequestInit,
    ) => Promise<{ok: boolean; status: number; json: () => Promise<unknown>}>
  >()
jest.mock('expo/fetch', () => ({fetch: mockExpoFetch}))
jest.mock('#/logger', () => ({logger: {error: jest.fn(), warn: jest.fn()}}))
jest.mock('../config', () => ({
  PUBLIC_CHAT_ENDPOINT: 'https://runtime.test/public/chat',
  PUBLIC_TTS_ENDPOINT: 'https://runtime.test/public/tts',
}))
jest.mock('../authToken', () => ({
  getSupabaseAccessToken: jest.fn(() => Promise.resolve('synthetic-pds-jwt')),
}))

import {fetchPublicAgentAudioBase64, publicChat} from '../publicChatClient'

describe('SOC-02 public visitor endpoints never carry the PDS session token', () => {
  it.skip('publicChat sends no Authorization header even when signed in', async () => {
    mockExpoFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({message: 'hi', sessionId: 's1'}),
    })
    await publicChat({agent: 'test-agent', message: 'hello'})
    const headers = mockExpoFetch.mock.calls[0]?.[1]?.headers
    expect(headers?.Authorization).toBeUndefined()
  })

  it.skip('public TTS sends no Authorization header even when signed in', async () => {
    mockExpoFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({}),
    })
    await fetchPublicAgentAudioBase64({agent: 'test-agent', text: 'hello'})
    const headers = mockExpoFetch.mock.calls[0]?.[1]?.headers
    expect(headers?.Authorization).toBeUndefined()
  })

  it.todo(
    '/app/* clients send a runtime-scoped (audience-bound, short-lived) token, not the PDS accessJwt',
  )
})
