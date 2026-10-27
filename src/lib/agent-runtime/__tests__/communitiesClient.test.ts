import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals'

jest.mock('#/logger', () => ({logger: {error: jest.fn(), warn: jest.fn()}}))
jest.mock('../config', () => ({
  AGENT_RUNTIME_BASE_URL: 'https://runtime.test',
}))
jest.mock('../authToken', () => ({getAgentRuntimeAccessToken: jest.fn()}))

import {getAgentRuntimeAccessToken} from '../authToken'
import {
  type CommunitiesResult,
  deleteMine,
  exportMine,
  getCommunity,
  getTimeline,
  join,
  leave,
  listMyCommunities,
  post,
  reply,
  setAgentGrant,
} from '../communitiesClient'

const mockToken = jest.mocked(getAgentRuntimeAccessToken)
const realFetch = globalThis.fetch
const mockFetch = jest.fn<typeof fetch>()

const RUNTIME_HOST = 'runtime.test'
const POST = {
  id: 'p1',
  author: {displayName: 'Ada', is_agent: false},
  body: 'hi',
  createdAt: '2026-10-28T00:00:00.000Z',
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json'},
  })
}

type Call = {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

function calls(): Call[] {
  return mockFetch.mock.calls.map(([url, init]) => ({
    url: url as string,
    method: init?.method ?? 'GET',
    headers: (init?.headers ?? {}) as Record<string, string>,
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }))
}

beforeEach(() => {
  mockToken.mockReset()
  mockToken.mockResolvedValue('tok')
  mockFetch.mockReset()
  globalThis.fetch = mockFetch
})

afterEach(() => {
  // Every request any test made: runtime host only, bearer auth, and no
  // tenant id anywhere in the URL, headers or body.
  for (const c of calls()) {
    const u = new URL(c.url)
    expect(u.host).toBe(RUNTIME_HOST)
    expect(u.pathname.startsWith('/app/communities')).toBe(true)
    expect(c.headers.Authorization).toBe('Bearer tok')
    expect(c.url).not.toMatch(/tenant/i)
    expect(JSON.stringify(c.headers)).not.toMatch(/tenant/i)
    expect(JSON.stringify(c.body ?? null)).not.toMatch(/tenant/i)
  }
  globalThis.fetch = realFetch
})

type Case = {
  name: string
  run: () => Promise<CommunitiesResult<unknown>>
  method: string
  path: string
  body?: unknown
  response: unknown
  data: unknown
}

const CASES: Case[] = [
  {
    name: 'listMyCommunities',
    run: () => listMyCommunities(),
    method: 'GET',
    path: '/app/communities',
    response: {communities: [{id: 'c1', name: 'Club'}]},
    data: [{id: 'c1', name: 'Club'}],
  },
  {
    name: 'getCommunity',
    run: () => getCommunity('c1'),
    method: 'GET',
    path: '/app/communities/c1',
    response: {community: {id: 'c1', name: 'Club'}},
    data: {id: 'c1', name: 'Club'},
  },
  {
    name: 'join',
    run: () => join('c1', 'v2'),
    method: 'POST',
    path: '/app/communities/c1/join',
    body: {consentVersion: 'v2'},
    response: {
      membership: {communityId: 'c1', role: 'member', consentVersion: 'v2'},
    },
    data: {communityId: 'c1', role: 'member', consentVersion: 'v2'},
  },
  {
    name: 'leave',
    run: () => leave('c1'),
    method: 'POST',
    path: '/app/communities/c1/leave',
    response: {ok: true},
    data: null,
  },
  {
    name: 'getTimeline (first page)',
    run: () => getTimeline('c1'),
    method: 'GET',
    path: '/app/communities/c1/timeline',
    response: {posts: [POST], cursor: 'next'},
    data: {posts: [POST], cursor: 'next'},
  },
  {
    name: 'getTimeline (with cursor)',
    run: () => getTimeline('c1', 'a b'),
    method: 'GET',
    path: '/app/communities/c1/timeline?cursor=a%20b',
    response: {posts: []},
    data: {posts: []},
  },
  {
    name: 'post',
    run: () => post('c1', 'hello', [{mediaId: 'm1', alt: 'a cat'}]),
    method: 'POST',
    path: '/app/communities/c1/posts',
    body: {body: 'hello', media: [{mediaId: 'm1', alt: 'a cat'}]},
    response: {post: POST},
    data: POST,
  },
  {
    name: 'reply',
    run: () => reply('c1', 'p1', 'agreed'),
    method: 'POST',
    path: '/app/communities/c1/posts/p1/replies',
    body: {body: 'agreed'},
    response: {post: {...POST, id: 'p2', parentId: 'p1'}},
    data: {...POST, id: 'p2', parentId: 'p1'},
  },
  {
    name: 'deleteMine',
    run: () => deleteMine('c1', 'p1'),
    method: 'DELETE',
    path: '/app/communities/c1/posts/p1',
    response: {ok: true},
    data: null,
  },
  {
    name: 'exportMine',
    run: () => exportMine('c1'),
    method: 'GET',
    path: '/app/communities/c1/export',
    response: {communityId: 'c1', posts: [POST]},
    data: {communityId: 'c1', posts: [POST]},
  },
  {
    name: 'setAgentGrant',
    run: () => setAgentGrant('c1', true),
    method: 'PUT',
    path: '/app/communities/c1/agent-grant',
    body: {on: true},
    response: {agentGrant: true},
    data: {agentGrant: true},
  },
]

describe('communitiesClient requests', () => {
  it.each(CASES)(
    '$name sends the expected method, path and body',
    async ({run, method, path, body, response, data}) => {
      mockFetch.mockResolvedValueOnce(json(200, response))
      const res = await run()
      expect(res).toEqual({ok: true, data})
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [c] = calls()
      expect(c.method).toBe(method)
      expect(c.url).toBe(`https://${RUNTIME_HOST}${path}`)
      expect(c.body).toEqual(body)
      if (body) expect(c.headers['Content-Type']).toBe('application/json')
    },
  )

  it('encodes ids into the path so they cannot change the route', async () => {
    mockFetch.mockResolvedValueOnce(json(200, {ok: true}))
    await deleteMine('c/../x', 'p?x=1')
    expect(calls()[0].url).toBe(
      'https://runtime.test/app/communities/c%2F..%2Fx/posts/p%3Fx%3D1',
    )
  })

  it('accepts an empty 2xx body for leave and delete', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, {status: 204}))
    expect(await leave('c1')).toEqual({ok: true, data: null})
  })
})

describe('communitiesClient never sends a tenant id', () => {
  it('drops unknown keys from media refs', async () => {
    mockFetch.mockResolvedValueOnce(json(200, {post: POST}))
    const smuggled = [
      {mediaId: 'm1', tenantId: 't-1', tenant: 't-1'},
    ] as unknown as Parameters<typeof post>[2]
    await post('c1', 'hi', smuggled)
    expect(calls()[0].body).toEqual({body: 'hi', media: [{mediaId: 'm1'}]})
  })

  it('every method, every request: no tenant field in body or headers', async () => {
    for (const c of CASES) {
      mockFetch.mockResolvedValueOnce(json(200, c.response))
      await c.run()
    }
    const all = calls()
    expect(all).toHaveLength(CASES.length)
    for (const c of all) {
      expect(Object.keys(c.headers).map(k => k.toLowerCase())).toEqual(
        expect.not.arrayContaining([expect.stringMatching(/tenant/)]),
      )
      if (c.body && typeof c.body === 'object') {
        expect(Object.keys(c.body)).toEqual(
          expect.not.arrayContaining([expect.stringMatching(/tenant/i)]),
        )
      }
    }
  })
})

describe('communitiesClient never calls the PDS', () => {
  it('every request goes to the runtime base URL, never a PDS host or XRPC', async () => {
    for (const c of CASES) {
      mockFetch.mockResolvedValueOnce(json(200, c.response))
      await c.run()
    }
    for (const c of calls()) {
      expect(c.url.startsWith('https://runtime.test/app/communities')).toBe(
        true,
      )
      expect(c.url).not.toMatch(/xrpc|com\.atproto|uploadBlob|bsky\.social/)
    }
  })
})

describe('communitiesClient errors never throw', () => {
  it.each(CASES)('$name: non-2xx -> typed http error', async ({run}) => {
    mockFetch.mockResolvedValueOnce(json(500, {error: 'boom'}))
    await expect(run()).resolves.toEqual({
      ok: false,
      error: {kind: 'http', status: 500, message: 'boom'},
    })
  })

  it.each(CASES)(
    '$name: network error -> typed network error',
    async ({run}) => {
      mockFetch.mockRejectedValueOnce(new Error('offline'))
      await expect(run()).resolves.toEqual({
        ok: false,
        error: {kind: 'network', message: 'offline'},
      })
    },
  )

  it.each(CASES)('$name: signed out -> no request', async ({run}) => {
    mockToken.mockResolvedValueOnce(null)
    await expect(run()).resolves.toEqual({
      ok: false,
      error: {kind: 'signed_out'},
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it.each(CASES)('$name: token helper throws -> typed error', async ({run}) => {
    mockToken.mockRejectedValueOnce(new Error('storage'))
    const res = await run()
    expect(res.ok).toBe(false)
  })

  it('401 is reported as signed out', async () => {
    mockFetch.mockResolvedValueOnce(json(401, {}))
    expect(await listMyCommunities()).toEqual({
      ok: false,
      error: {kind: 'signed_out'},
    })
  })

  it('non-JSON error body still yields a typed http error', async () => {
    mockFetch.mockResolvedValueOnce(new Response('nope', {status: 403}))
    expect(await getCommunity('c1')).toEqual({
      ok: false,
      error: {kind: 'http', status: 403, message: undefined},
    })
  })

  it('malformed 2xx body -> bad_response', async () => {
    mockFetch.mockResolvedValueOnce(new Response('<html>', {status: 200}))
    expect((await listMyCommunities()).ok).toBe(false)
    mockFetch.mockResolvedValueOnce(json(200, {communities: 'x'}))
    const res = await listMyCommunities()
    expect(res.ok === false && res.error.kind).toBe('bad_response')
  })

  it('invalid arguments are rejected locally without a request', async () => {
    const results = await Promise.all([
      getCommunity(''),
      join('c1', ''),
      leave(' '),
      getTimeline(''),
      post('c1', '   ', []),
      reply('c1', '', 'x'),
      reply('c1', 'p1', ''),
      deleteMine('c1', ''),
      exportMine(''),
      setAgentGrant('c1', 'yes' as unknown as boolean),
    ])
    for (const r of results) {
      expect(r.ok === false && r.error.kind).toBe('invalid_argument')
    }
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
