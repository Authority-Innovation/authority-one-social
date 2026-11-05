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
  getAgentGrant,
  getCommunity,
  getJoinInfo,
  getThreadRoster,
  getTimeline,
  join,
  launchCommunityAgent,
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
const COMMUNITY = {
  id: 'c1',
  name: 'Club',
  description: null,
  accent: null,
  wording_version: 2,
}
// The real Dev roster payload (src/screens/Community/__tests__/fixtures).
const ROSTER = {
  postId: '0mvtv8lvw-6341f31d509f',
  roster: [
    {id: 'member.example.test', did: null, is_agent: false},
    {
      id: 'community-agent',
      did: 'did:plc:agentagentagentaaaaaaaaa',
      is_agent: true,
    },
  ],
}
const ITEM = {
  id: 'p1',
  parentId: null,
  authorId: 'ada',
  text: 'hi',
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
    response: {communities: [COMMUNITY]},
    data: [COMMUNITY],
  },
  {
    name: 'getCommunity',
    run: () => getCommunity('c1'),
    method: 'GET',
    path: '/app/communities/c1',
    response: {community: COMMUNITY},
    data: COMMUNITY,
  },
  {
    name: 'getJoinInfo',
    run: () => getJoinInfo('c1'),
    method: 'GET',
    path: '/app/communities/c1/join-info',
    response: {wording_version: 2},
    data: {wording_version: 2},
  },
  {
    name: 'join',
    run: () => join('c1', 2),
    method: 'POST',
    path: '/app/communities/c1/join',
    body: {consentVersion: 2},
    response: {community: COMMUNITY, joined: true},
    data: {community: COMMUNITY, joined: true},
  },
  {
    name: 'leave',
    run: () => leave('c1'),
    method: 'POST',
    path: '/app/communities/c1/leave',
    response: {left: true},
    data: null,
  },
  {
    name: 'getTimeline (first page)',
    run: () => getTimeline('c1'),
    method: 'GET',
    path: '/app/communities/c1/timeline',
    response: {items: [ITEM], cursor: 'next'},
    data: {items: [ITEM], cursor: 'next'},
  },
  {
    name: 'getTimeline (with cursor)',
    run: () => getTimeline('c1', 'a b'),
    method: 'GET',
    path: '/app/communities/c1/timeline?cursor=a%20b',
    response: {items: [], cursor: null},
    data: {items: [], cursor: null},
  },
  {
    name: 'post',
    run: () => post('c1', 'hello'),
    method: 'POST',
    path: '/app/communities/c1/posts',
    body: {text: 'hello'},
    response: {item: ITEM},
    data: ITEM,
  },
  {
    name: 'reply',
    run: () => reply('c1', 'p1', 'agreed'),
    method: 'POST',
    path: '/app/communities/c1/posts/p1/replies',
    body: {text: 'agreed'},
    response: {item: {...ITEM, id: 'p2', parentId: 'p1'}},
    data: {...ITEM, id: 'p2', parentId: 'p1'},
  },
  {
    name: 'deleteMine',
    run: () => deleteMine('c1', 'p1'),
    method: 'DELETE',
    path: '/app/communities/c1/posts/p1',
    response: {deleted: true},
    data: null,
  },
  {
    name: 'exportMine',
    run: () => exportMine('c1'),
    method: 'GET',
    path: '/app/communities/c1/export',
    response: {communityId: 'c1', items: [ITEM]},
    data: {communityId: 'c1', items: [ITEM]},
  },
  {
    name: 'getAgentGrant',
    run: () => getAgentGrant('c1'),
    method: 'GET',
    path: '/app/communities/c1/agent-grant',
    response: {communityId: 'c1', on: false},
    data: {communityId: 'c1', on: false},
  },
  {
    name: 'setAgentGrant',
    run: () => setAgentGrant('c1', true),
    method: 'POST',
    path: '/app/communities/c1/agent-grant',
    body: {on: true},
    response: {communityId: 'c1', on: true},
    data: {communityId: 'c1', on: true},
  },
  {
    name: 'getThreadRoster',
    run: () => getThreadRoster('c1', ROSTER.postId),
    method: 'GET',
    path: `/app/communities/c1/posts/${ROSTER.postId}/roster`,
    response: ROSTER,
    data: ROSTER,
  },
  {
    name: 'getThreadRoster (drops malformed entries)',
    run: () => getThreadRoster('c1', 'p1'),
    method: 'GET',
    path: '/app/communities/c1/posts/p1/roster',
    response: {postId: 'p1', roster: [null, {did: 'x'}, ROSTER.roster[0]]},
    data: {postId: 'p1', roster: [ROSTER.roster[0]]},
  },
  {
    name: 'launchCommunityAgent',
    run: () => launchCommunityAgent('c1'),
    method: 'POST',
    path: '/app/communities/c1/agent/launch',
    body: undefined,
    response: {launched: true},
    data: null,
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
    mockFetch.mockResolvedValueOnce(json(200, {deleted: true}))
    await deleteMine('c/../x', 'p?x=1')
    expect(calls()[0].url).toBe(
      'https://runtime.test/app/communities/c%2F..%2Fx/posts/p%3Fx%3D1',
    )
  })

  it('an id that cannot be encoded returns invalid_argument, never throws', async () => {
    // encodeURIComponent throws URIError on a lone surrogate.
    const bad = 'c\uD800'
    const results = await Promise.all([
      getCommunity(bad),
      getJoinInfo(bad),
      join(bad, 1),
      leave(bad),
      getTimeline(bad),
      getTimeline('c1', bad),
      post(bad, 'hi'),
      reply('c1', bad, 'hi'),
      deleteMine('c1', bad),
      exportMine(bad),
      getAgentGrant(bad),
      setAgentGrant(bad, true),
      launchCommunityAgent(bad),
    ])
    for (const r of results) {
      expect(r.ok === false && r.error.kind).toBe('invalid_argument')
    }
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockToken).not.toHaveBeenCalled()
  })

  it('reads viewer_is_admin into viewerIsAdmin, true only for literal true', async () => {
    const read = async (extra: Record<string, unknown>) => {
      mockFetch.mockResolvedValueOnce(
        json(200, {community: {...COMMUNITY, ...extra}}),
      )
      const res = await getCommunity('c1')
      if (!res.ok) throw new Error('expected ok')
      return res.data.viewerIsAdmin
    }
    expect(await read({viewer_is_admin: true})).toBe(true)
    expect(await read({viewer_is_admin: false})).toBe(false)
    expect(await read({viewer_is_admin: 'true'})).toBe(false)
    expect(await read({viewer_is_admin: 1})).toBe(false)
    expect(await read({})).toBeUndefined()
    // Only the runtime's snake_case field counts.
    expect(await read({viewerIsAdmin: true})).toBeUndefined()

    mockFetch.mockResolvedValueOnce(
      json(200, {communities: [{...COMMUNITY, viewer_is_admin: true}]}),
    )
    const list = await listMyCommunities()
    expect(list.ok && list.data[0].viewerIsAdmin).toBe(true)
  })

  it('launch failure comes back typed, never thrown', async () => {
    mockFetch.mockResolvedValueOnce(json(403, {error: 'not an admin'}))
    expect(await launchCommunityAgent('c1')).toEqual({
      ok: false,
      error: {kind: 'http', status: 403, message: 'not an admin'},
    })
    expect(await launchCommunityAgent('  ')).toEqual({
      ok: false,
      error: {kind: 'invalid_argument', message: 'community id is required'},
    })
  })

  it('accepts an empty 2xx body for leave and delete', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, {status: 204}))
    expect(await leave('c1')).toEqual({ok: true, data: null})
  })
})

describe('communitiesClient never sends a tenant id', () => {
  it('post sends only {text}', async () => {
    mockFetch.mockResolvedValueOnce(json(201, {item: ITEM}))
    await post('c1', 'hi')
    expect(calls()[0].body).toEqual({text: 'hi'})
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
      join('c1', '2' as unknown as number),
      join('c1', NaN),
      leave(' '),
      getTimeline(''),
      post('c1', '   '),
      reply('c1', '', 'x'),
      reply('c1', 'p1', ''),
      deleteMine('c1', ''),
      exportMine(''),
      getJoinInfo(''),
      getAgentGrant(''),
      getThreadRoster('', 'p1'),
      getThreadRoster('c1', ''),
      setAgentGrant('c1', 'yes' as unknown as boolean),
    ])
    for (const r of results) {
      expect(r.ok === false && r.error.kind).toBe('invalid_argument')
    }
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
