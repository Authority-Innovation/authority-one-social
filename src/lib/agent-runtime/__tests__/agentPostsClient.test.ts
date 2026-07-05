import {beforeEach, describe, expect, it, jest} from '@jest/globals'

// Keep the test off the real logger transport graph.
jest.mock('#/logger', () => ({logger: {error: jest.fn(), warn: jest.fn()}}))

// Stable endpoints so we don't pull in #/lib/constants.
jest.mock('../config', () => ({
  AGENTS_POSTS_ENDPOINT: 'https://runtime.test/app/agents/posts',
  AGENTS_POSTS_DELETE_ENDPOINT: 'https://runtime.test/app/agents/posts/delete',
}))

// SINGLE-LOGIN: setSupabaseTokenProvider is a no-op, so mock the token reader
// itself (same pattern as agentsClient.test.ts).
jest.mock('../authToken', () => ({getSupabaseAccessToken: jest.fn()}))

import {deleteAgentPost, postAsAgent} from '../agentPostsClient'
import {getSupabaseAccessToken} from '../authToken'

const mockToken = jest.mocked(getSupabaseAccessToken)
const mockFetch = jest.fn()
// @ts-expect-error test shim
global.fetch = mockFetch

function jsonRes(status: number, obj: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(obj),
  }
}

describe('deleteAgentPost', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockToken.mockResolvedValue('TOKEN_ABC')
  })

  it('POSTs {agent, uri} with the owner bearer and echoes the success payload', async () => {
    mockFetch.mockResolvedValue(
      jsonRes(200, {
        ok: true,
        uri: 'at://did:plc:bull/app.bsky.feed.post/3k1',
        agent: 'bull.pds.test',
      }) as never,
    )

    const res = await deleteAgentPost({
      agent: 'bull.pds.test',
      uri: 'at://did:plc:bull/app.bsky.feed.post/3k1',
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://runtime.test/app/agents/posts/delete')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer TOKEN_ABC',
    )
    expect(JSON.parse(init.body as string)).toEqual({
      agent: 'bull.pds.test',
      uri: 'at://did:plc:bull/app.bsky.feed.post/3k1',
    })
    expect(res.ok).toBe(true)
    expect(res.uri).toBe('at://did:plc:bull/app.bsky.feed.post/3k1')
  })

  it('surfaces a 403 not-your-agent as an ownership error, NOT a dead session', async () => {
    mockFetch.mockResolvedValue(
      jsonRes(403, {error: 'forbidden', code: 'not-your-agent'}) as never,
    )

    const res = await deleteAgentPost({agent: 'x', uri: 'at://y/p/1'})

    expect(res.ok).toBe(false)
    expect(res.signedOut).toBe(false)
    expect(res.code).toBe('not-your-agent')
  })

  it('treats a bare 401 (no code) as signed out', async () => {
    mockFetch.mockResolvedValue(jsonRes(401, {}) as never)

    const res = await deleteAgentPost({agent: 'x', uri: 'at://y/p/1'})

    expect(res.ok).toBe(false)
    expect(res.signedOut).toBe(true)
  })

  it('reports signed out without a network round-trip when there is no token', async () => {
    mockToken.mockResolvedValue(null)

    const res = await deleteAgentPost({agent: 'x', uri: 'at://y/p/1'})

    expect(res.ok).toBe(false)
    expect(res.signedOut).toBe(true)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('never throws on a network failure', async () => {
    mockFetch.mockRejectedValue(new Error('boom') as never)

    const res = await deleteAgentPost({agent: 'x', uri: 'at://y/p/1'})

    expect(res.ok).toBe(false)
    expect(res.signedOut).toBe(false)
    expect(res.error).toBe('boom')
  })
})

describe('postAsAgent', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockToken.mockResolvedValue('TOKEN_ABC')
  })

  it('POSTs the verbatim record fields and echoes uri/cid on success', async () => {
    mockFetch.mockResolvedValue(
      jsonRes(200, {
        ok: true,
        uri: 'at://did:plc:bull/app.bsky.feed.post/3k2',
        cid: 'bafy123',
        agent: 'bull.pds.test',
      }) as never,
    )

    const res = await postAsAgent({
      agent: 'bull.pds.test',
      text: 'hello from the owner',
      imageUrls: ['https://r2.test/a.png'],
      langs: ['en'],
    })

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://runtime.test/app/agents/posts')
    expect(JSON.parse(init.body as string)).toEqual({
      agent: 'bull.pds.test',
      text: 'hello from the owner',
      imageUrls: ['https://r2.test/a.png'],
      langs: ['en'],
    })
    expect(res.ok).toBe(true)
    expect(res.uri).toBe('at://did:plc:bull/app.bsky.feed.post/3k2')
    expect(res.cid).toBe('bafy123')
  })

  it('omits empty optional fields from the wire body', async () => {
    mockFetch.mockResolvedValue(jsonRes(200, {ok: true}) as never)

    await postAsAgent({agent: 'a', text: 't', facets: [], imageUrls: []})

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body).toEqual({agent: 'a', text: 't'})
    expect('facets' in body).toBe(false)
    expect('imageUrls' in body).toBe(false)
  })

  it('surfaces 400 validation codes (too-long / bad-image)', async () => {
    mockFetch.mockResolvedValue(
      jsonRes(400, {error: 'too long', code: 'too-long'}) as never,
    )

    const res = await postAsAgent({agent: 'a', text: 'x'.repeat(400)})

    expect(res.ok).toBe(false)
    expect(res.signedOut).toBe(false)
    expect(res.code).toBe('too-long')
  })
})
