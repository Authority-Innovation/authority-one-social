/**
 * Contract test: the client against the community door's own envelopes.
 *
 * Every response body below is copied from a `reply(...)` call in the door,
 * pilot-agent-runtime src/communities/door.js:
 * - wave 1 routes and join-info: the T5 door after fix pass 06041e6d
 *   (b30ba816, coord/independent-fix-pass-w1-t5-commu-06041e6d)
 * - agent-grant GET/POST and the agent fields: W2-T7 (64b2b80a,
 *   coord/communities-w2-t7-community-agen-fb477fb1)
 *
 * The request side is asserted against what the door reads: the method and
 * path in COMMUNITY_ROUTES / AGENT_ROUTES, and the body fields it checks
 * (`text`, `consentVersion` as a number, `on` as a boolean). If the door
 * changes shape, update the envelopes here from the door, not from the client.
 */
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

/** door.js `reply`: JSON body, content-type and no-store headers. */
function doorReply(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {'content-type': 'application/json', 'cache-control': 'no-store'},
  })
}

// door.js publicConfig, communityAgent flag off: no `agent` key at all.
const CONFIG_FLAG_OFF = {
  id: 'riverside',
  name: 'Riverside',
  description: 'Neighbours by the river',
  accent: '#0a7',
  wording_version: 3,
}
// publicConfig, communityAgent flag on, valid slot.
const CONFIG_AGENT_ON = {
  ...CONFIG_FLAG_OFF,
  agent: {did: 'did:plc:agent123', is_agent: true},
}
// publicConfig, flag on, agent without sponsor: agent null + agent_error.
const CONFIG_AGENT_ERROR = {
  ...CONFIG_FLAG_OFF,
  agent: null,
  agent_error: 'agent_sponsor_missing',
}
// door.js publicItem, flag off (the wave-1 shape).
const ITEM = {
  id: 'mh1x2y3z4-0123456789ab',
  parentId: null,
  authorId: 'acct-ada',
  text: 'Hello neighbours',
  createdAt: '2026-10-28T00:00:00.000Z',
}
const REPLY_ITEM = {
  ...ITEM,
  id: 'mh1x2y3z5-0123456789ac',
  parentId: ITEM.id,
  text: 'Hi Ada',
}
// publicItem, flag on: a member item and an agent item.
const MEMBER_ITEM_AGENT_ON = {...ITEM, is_agent: false}
const AGENT_ITEM = {
  ...ITEM,
  id: 'mh1x2y3z6-0123456789ad',
  authorId: 'community-agent',
  text: 'The market opens at 9.',
  is_agent: true,
  sources: [
    {
      title: 'Market notice',
      kind: 'doc',
      ref: 'notice-1',
      at: '2026-10-27T00:00:00.000Z',
    },
  ],
  no_source: false,
}

const ID = 'riverside'

type Contract = {
  name: string
  run: () => Promise<CommunitiesResult<unknown>>
  method: string
  path: string
  body?: unknown
  status: number
  envelope: unknown
}

const CONTRACTS: Contract[] = [
  {
    name: 'GET / -> {communities}',
    run: () => listMyCommunities(),
    method: 'GET',
    path: '/app/communities',
    status: 200,
    envelope: {communities: [CONFIG_FLAG_OFF, CONFIG_AGENT_ON]},
  },
  {
    name: 'GET / -> {communities: []}',
    run: () => listMyCommunities(),
    method: 'GET',
    path: '/app/communities',
    status: 200,
    envelope: {communities: []},
  },
  {
    name: 'GET /:id -> {community} (flag off)',
    run: () => getCommunity(ID),
    method: 'GET',
    path: `/app/communities/${ID}`,
    status: 200,
    envelope: {community: CONFIG_FLAG_OFF},
  },
  {
    name: 'GET /:id -> {community} (agent on)',
    run: () => getCommunity(ID),
    method: 'GET',
    path: `/app/communities/${ID}`,
    status: 200,
    envelope: {community: CONFIG_AGENT_ON},
  },
  {
    name: 'GET /:id -> {community} (agent_error)',
    run: () => getCommunity(ID),
    method: 'GET',
    path: `/app/communities/${ID}`,
    status: 200,
    envelope: {community: CONFIG_AGENT_ERROR},
  },
  {
    name: 'GET /:id/join-info -> {wording_version}',
    run: () => getJoinInfo(ID),
    method: 'GET',
    path: `/app/communities/${ID}/join-info`,
    status: 200,
    envelope: {wording_version: 3},
  },
  {
    name: 'GET /:id/join-info -> {wording_version: null} (unset)',
    run: () => getJoinInfo(ID),
    method: 'GET',
    path: `/app/communities/${ID}/join-info`,
    status: 200,
    envelope: {wording_version: null},
  },
  {
    name: 'POST /:id/join -> 201 {community, joined}',
    run: () => join(ID, 3),
    method: 'POST',
    path: `/app/communities/${ID}/join`,
    body: {consentVersion: 3},
    status: 201,
    envelope: {community: CONFIG_FLAG_OFF, joined: true},
  },
  {
    name: 'POST /:id/join -> 200 {community, joined} (already a member)',
    run: () => join(ID, 3),
    method: 'POST',
    path: `/app/communities/${ID}/join`,
    body: {consentVersion: 3},
    status: 200,
    envelope: {community: CONFIG_FLAG_OFF, joined: true},
  },
  {
    name: 'POST /:id/leave -> {left}',
    run: () => leave(ID),
    method: 'POST',
    path: `/app/communities/${ID}/leave`,
    status: 200,
    envelope: {left: true},
  },
  {
    name: 'GET /:id/timeline -> {items, cursor: null}',
    run: () => getTimeline(ID),
    method: 'GET',
    path: `/app/communities/${ID}/timeline`,
    status: 200,
    envelope: {items: [REPLY_ITEM, ITEM], cursor: null},
  },
  {
    name: 'GET /:id/timeline?cursor= -> {items, cursor} (agent on)',
    run: () => getTimeline(ID, ITEM.id),
    method: 'GET',
    path: `/app/communities/${ID}/timeline?cursor=${ITEM.id}`,
    status: 200,
    envelope: {items: [AGENT_ITEM, MEMBER_ITEM_AGENT_ON], cursor: ITEM.id},
  },
  {
    name: 'POST /:id/posts {text} -> 201 {item}',
    run: () => post(ID, 'Hello neighbours'),
    method: 'POST',
    path: `/app/communities/${ID}/posts`,
    body: {text: 'Hello neighbours'},
    status: 201,
    envelope: {item: ITEM},
  },
  {
    name: 'POST /:id/posts/:postId/replies {text} -> 201 {item}',
    run: () => reply(ID, ITEM.id, 'Hi Ada'),
    method: 'POST',
    path: `/app/communities/${ID}/posts/${ITEM.id}/replies`,
    body: {text: 'Hi Ada'},
    status: 201,
    envelope: {item: REPLY_ITEM},
  },
  {
    name: 'DELETE /:id/posts/:postId -> {deleted}',
    run: () => deleteMine(ID, ITEM.id),
    method: 'DELETE',
    path: `/app/communities/${ID}/posts/${ITEM.id}`,
    status: 200,
    envelope: {deleted: true},
  },
  {
    name: 'GET /:id/export -> {communityId, items}',
    run: () => exportMine(ID),
    method: 'GET',
    path: `/app/communities/${ID}/export`,
    status: 200,
    envelope: {communityId: ID, items: [ITEM]},
  },
  {
    name: 'GET /:id/agent-grant -> {communityId, on}',
    run: () => getAgentGrant(ID),
    method: 'GET',
    path: `/app/communities/${ID}/agent-grant`,
    status: 200,
    envelope: {communityId: ID, on: false},
  },
  {
    name: 'POST /:id/agent-grant {on} -> {communityId, on}',
    run: () => setAgentGrant(ID, true),
    method: 'POST',
    path: `/app/communities/${ID}/agent-grant`,
    body: {on: true},
    status: 200,
    envelope: {communityId: ID, on: true},
  },
]

beforeEach(() => {
  mockToken.mockReset()
  mockToken.mockResolvedValue('tok')
  mockFetch.mockReset()
  globalThis.fetch = mockFetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

function lastCall() {
  const [url, init] = mockFetch.mock.calls[0]
  return {
    url: url as string,
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }
}

describe('communitiesClient against the door contract', () => {
  it.each(CONTRACTS)(
    '$name',
    async ({run, method, path, body, status, envelope}) => {
      mockFetch.mockResolvedValueOnce(doorReply(envelope, status))
      const res = await run()
      expect(res.ok).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const c = lastCall()
      expect(c.method).toBe(method)
      expect(c.url).toBe(`https://runtime.test${path}`)
      expect(c.body).toEqual(body)
    },
  )

  it('passes the door fields through unchanged', async () => {
    mockFetch.mockResolvedValueOnce(
      doorReply({items: [AGENT_ITEM, MEMBER_ITEM_AGENT_ON], cursor: null}),
    )
    expect(await getTimeline(ID)).toEqual({
      ok: true,
      data: {items: [AGENT_ITEM, MEMBER_ITEM_AGENT_ON], cursor: null},
    })
    mockFetch.mockResolvedValueOnce(
      doorReply({community: CONFIG_AGENT_ON, joined: true}, 201),
    )
    expect(await join(ID, 3)).toEqual({
      ok: true,
      data: {community: CONFIG_AGENT_ON, joined: true},
    })
  })

  it('sends wording_version back as a number, the type the door checks', async () => {
    mockFetch.mockResolvedValueOnce(doorReply({wording_version: 3}))
    const info = await getJoinInfo(ID)
    expect(info).toEqual({ok: true, data: {wording_version: 3}})
    if (!info.ok || info.data.wording_version === null) throw new Error()
    mockFetch.mockReset()
    mockFetch.mockResolvedValueOnce(
      doorReply({community: CONFIG_FLAG_OFF, joined: true}, 201),
    )
    await join(ID, info.data.wording_version)
    const sent = lastCall().body as {consentVersion: unknown}
    expect(typeof sent.consentVersion).toBe('number')
  })

  const ERRORS: {
    name: string
    status: number
    envelope: {error: string; hint?: string}
    run: (id: string) => Promise<CommunitiesResult<unknown>>
  }[] = [
    {
      name: '404 not_found',
      status: 404,
      envelope: {error: 'not_found'},
      run: id => getCommunity(id),
    },
    {
      name: '404 join refusal with the join-info hint',
      status: 404,
      envelope: {
        error: 'not_found',
        hint: 'GET /app/communities/:id/join-info',
      },
      run: id => join(id, 1),
    },
    {
      name: '400 bad_text',
      status: 400,
      envelope: {error: 'bad_text'},
      run: id => post(id, 'x'),
    },
    {
      name: '400 bad_cursor',
      status: 400,
      envelope: {error: 'bad_cursor'},
      run: id => getTimeline(id, 'nope'),
    },
    {
      name: '400 bad_grant',
      status: 400,
      envelope: {error: 'bad_grant'},
      run: id => setAgentGrant(id, true),
    },
  ]

  it.each(ERRORS)(
    'door error $name -> typed http error',
    async ({status, envelope, run}) => {
      mockFetch.mockResolvedValueOnce(doorReply(envelope, status))
      expect(await run(ID)).toEqual({
        ok: false,
        error: {kind: 'http', status, message: envelope.error},
      })
    },
  )

  it('door 401 {error: unauthorized} -> signed_out', async () => {
    mockFetch.mockResolvedValueOnce(doorReply({error: 'unauthorized'}, 401))
    expect(await listMyCommunities()).toEqual({
      ok: false,
      error: {kind: 'signed_out'},
    })
  })
})
