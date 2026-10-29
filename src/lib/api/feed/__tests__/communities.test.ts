import {type BskyAgent} from '@atproto/api'
import {beforeEach, describe, expect, it, jest} from '@jest/globals'

jest.mock('#/logger', () => ({logger: {warn: jest.fn(), error: jest.fn()}}))
jest.mock('#/lib/agent-runtime/communitiesClient', () => ({
  getTimeline: jest.fn(),
  getCommunity: jest.fn(),
  listMyCommunities: jest.fn(),
}))
jest.mock('#/state/queries/group', () => {
  class GroupAppViewUnavailableError extends Error {}
  return {
    fetchGroupTimeline: jest.fn(),
    fetchGroupMemberships: jest.fn(),
    GroupAppViewUnavailableError,
    isGroupAppViewUnavailableError: (e: unknown) =>
      e instanceof GroupAppViewUnavailableError,
  }
})

import * as communitiesClient from '#/lib/agent-runtime/communitiesClient'
import {
  CommunitiesMergeFeedAPI,
  type CommunityFeedSource,
  createCommunityFeedAPI,
  resolveMyCommunitySources,
} from '#/lib/api/feed/communities'
import {
  fetchGroupMemberships,
  fetchGroupTimeline,
  GroupAppViewUnavailableError,
} from '#/state/queries/group'
import {getMembersPostRef} from '#/features/communities/membersPost'

const mockGetTimeline = jest.mocked(communitiesClient.getTimeline)
const mockListMine = jest.mocked(communitiesClient.listMyCommunities)
const mockGetCommunity = jest.mocked(communitiesClient.getCommunity)
const mockGroupTimeline = jest.mocked(fetchGroupTimeline)
const mockGroupMemberships = jest.mocked(fetchGroupMemberships)

// Placeholder ids only - none of these are real accounts or communities.
const MEMBERS_A = 'community-a'
const MEMBERS_B = 'community-b'
const PUBLIC_G = 'at://did:example:owner/com.authorityone.group.profile/g1'

function feedPost(uri: string, indexedAt: string) {
  return {
    post: {
      uri,
      cid: 'bafyexample',
      author: {did: 'did:example:author', handle: 'author.test'},
      record: {$type: 'app.bsky.feed.post', text: uri, createdAt: indexedAt},
      indexedAt,
    },
  }
}

function membersPost(id: string, createdAt: string) {
  return {
    id,
    author: {displayName: `Author ${id}`, is_agent: false},
    body: `body ${id}`,
    createdAt,
  }
}

/**
 * A fake agent that records every property read. `getTimeline` serves the
 * Following source; anything else counts as an unexpected agent (PDS or
 * AppView) call.
 */
function makeAgent(following: ReturnType<typeof feedPost>[] = []) {
  const touched: string[] = []
  const getTimeline = jest.fn(() =>
    Promise.resolve({
      success: true,
      headers: {},
      data: {feed: following, cursor: undefined},
    }),
  )
  const agent = new Proxy(
    {getTimeline},
    {
      get(target, prop) {
        if (typeof prop === 'string') touched.push(prop)
        return (target as Record<string | symbol, unknown>)[prop]
      },
    },
  ) as unknown as BskyAgent
  return {agent, touched, getTimeline}
}

const t = (minute: number) =>
  `2026-10-28T10:${String(minute).padStart(2, '0')}:00.000Z`

beforeEach(() => {
  jest.clearAllMocks()
})

describe('CommunitiesMergeFeedAPI', () => {
  it('interleaves following and two communities reverse-chron, each with its badge', async () => {
    const {agent} = makeAgent([
      feedPost('at://did:example:f/app.bsky.feed.post/f1', t(9)),
      feedPost('at://did:example:f/app.bsky.feed.post/f2', t(3)),
    ])
    mockGetTimeline.mockImplementation(id =>
      Promise.resolve({
        ok: true,
        data: {
          posts:
            id === MEMBERS_A
              ? [membersPost('a1', t(8)), membersPost('a2', t(2))]
              : [membersPost('b1', t(5))],
        },
      }),
    )
    mockGroupTimeline.mockResolvedValue({
      feed: [feedPost('at://did:example:g/app.bsky.feed.post/g1', t(6))],
    })

    const api = new CommunitiesMergeFeedAPI({
      agent,
      sources: [
        {id: MEMBERS_A, name: 'A', tier: 'members'},
        {id: MEMBERS_B, name: 'B', tier: 'members'},
        {id: PUBLIC_G, name: 'G', tier: 'public'},
      ],
    })
    const res = await api.fetch({cursor: undefined, limit: 30})

    expect(res.feed.map(i => i.post.uri)).toEqual([
      'at://did:example:f/app.bsky.feed.post/f1',
      'ao-community://community-a/a1',
      'at://did:example:g/app.bsky.feed.post/g1',
      'ao-community://community-b/b1',
      'at://did:example:f/app.bsky.feed.post/f2',
      'ao-community://community-a/a2',
    ])
    const badges = res.feed.map(i => (i as {__source?: unknown}).__source)
    expect(badges).toEqual([
      undefined,
      {
        $type: 'reasonCommunity',
        communityId: MEMBERS_A,
        name: 'A',
        tier: 'members',
      },
      {
        $type: 'reasonCommunity',
        communityId: PUBLIC_G,
        name: 'G',
        tier: 'public',
      },
      {
        $type: 'reasonCommunity',
        communityId: MEMBERS_B,
        name: 'B',
        tier: 'members',
      },
      undefined,
      {
        $type: 'reasonCommunity',
        communityId: MEMBERS_A,
        name: 'A',
        tier: 'members',
      },
    ])
    // Everything was served in one page; nothing more to fetch.
    expect(res.cursor).toBeUndefined()
  })

  it('fetches each community with only its own id', async () => {
    const {agent} = makeAgent()
    mockGetTimeline.mockResolvedValue({ok: true, data: {posts: []}})
    mockGroupTimeline.mockResolvedValue({feed: []})

    const api = new CommunitiesMergeFeedAPI({
      agent,
      sources: [
        {id: MEMBERS_A, tier: 'members'},
        {id: MEMBERS_B, tier: 'members'},
        {id: PUBLIC_G, tier: 'public'},
      ],
    })
    await api.fetch({cursor: undefined, limit: 30})

    expect(mockGetTimeline.mock.calls).toEqual([
      [MEMBERS_A, undefined],
      [MEMBERS_B, undefined],
    ])
    expect(mockGroupTimeline).toHaveBeenCalledTimes(1)
    expect(mockGroupTimeline.mock.calls[0][1]).toEqual({
      group: PUBLIC_G,
      cursor: undefined,
      limit: 30,
    })
    // No call mentions any other community.
    const all = [MEMBERS_A, MEMBERS_B, PUBLIC_G]
    for (const call of mockGetTimeline.mock.calls) {
      const others = all.filter(id => id !== call[0])
      for (const other of others) {
        expect(JSON.stringify(call)).not.toContain(other)
      }
    }
    const groupCall = JSON.stringify(mockGroupTimeline.mock.calls[0][1])
    expect(groupCall).not.toContain(MEMBERS_A)
    expect(groupCall).not.toContain(MEMBERS_B)
  })

  it('pages each source with its own cursor and keeps order across pages', async () => {
    const {agent} = makeAgent()
    mockGetTimeline.mockImplementation((id, cursor) => {
      if (id === MEMBERS_A) {
        return Promise.resolve(
          cursor
            ? {ok: true, data: {posts: [membersPost('a3', t(1))]}}
            : {
                ok: true,
                data: {
                  posts: [membersPost('a1', t(9)), membersPost('a2', t(7))],
                  cursor: 'a-next',
                },
              },
        )
      }
      return Promise.resolve({
        ok: true,
        data: {posts: [membersPost('b1', t(4))]},
      })
    })

    const api = new CommunitiesMergeFeedAPI({
      agent,
      includeFollowing: false,
      sources: [
        {id: MEMBERS_A, tier: 'members'},
        {id: MEMBERS_B, tier: 'members'},
      ],
    })
    const first = await api.fetch({cursor: undefined, limit: 30})
    // a3 may be newer than b1, so the merge stops before b1 until A is
    // topped up.
    expect(first.feed.map(i => i.post.uri)).toEqual([
      'ao-community://community-a/a1',
      'ao-community://community-a/a2',
    ])
    expect(first.cursor).toBeDefined()

    const second = await api.fetch({cursor: first.cursor, limit: 30})
    expect(second.feed.map(i => i.post.uri)).toEqual([
      'ao-community://community-b/b1',
      'ao-community://community-a/a3',
    ])
    expect(mockGetTimeline.mock.calls).toEqual([
      [MEMBERS_A, undefined],
      [MEMBERS_B, undefined],
      [MEMBERS_A, 'a-next'],
    ])
  })

  it('drops a failing community without failing the feed', async () => {
    const {agent} = makeAgent([
      feedPost('at://did:example:f/app.bsky.feed.post/f1', t(9)),
    ])
    mockGetTimeline.mockResolvedValue({
      ok: false,
      error: {kind: 'http', status: 403},
    })
    const api = new CommunitiesMergeFeedAPI({
      agent,
      sources: [{id: MEMBERS_A, tier: 'members'}],
    })
    const res = await api.fetch({cursor: undefined, limit: 30})
    expect(res.feed.map(i => i.post.uri)).toEqual([
      'at://did:example:f/app.bsky.feed.post/f1',
    ])
  })

  it('resolves the person’s communities when no sources are given', async () => {
    const {agent} = makeAgent()
    ;(agent as {session?: {did: string}}).session = {did: 'did:example:viewer'}
    mockListMine.mockResolvedValue({
      ok: true,
      data: [{id: MEMBERS_A, name: 'A'}],
    })
    mockGroupMemberships.mockResolvedValue({
      memberships: [
        {
          group: {uri: PUBLIC_G, cid: 'c', creator: 'did:example:o', name: 'G'},
          role: 'com.authorityone.group.defs#member',
          status: 'com.authorityone.group.defs#active',
        },
        {
          group: {
            uri: 'at://did:example:o/com.authorityone.group.profile/pending',
            cid: 'c',
            creator: 'did:example:o',
            name: 'P',
          },
          role: 'com.authorityone.group.defs#member',
          status: 'com.authorityone.group.defs#pending',
        },
      ],
    })
    await expect(resolveMyCommunitySources(agent)).resolves.toEqual({
      sources: [
        {id: MEMBERS_A, name: 'A', tier: 'members'},
        {id: PUBLIC_G, name: 'G', tier: 'public'},
      ],
      publicTier: {kind: 'ok'},
    })
  })
})

describe('public tier failures are visible, not silent (M1)', () => {
  function viewerAgent(following: ReturnType<typeof feedPost>[] = []) {
    const made = makeAgent(following)
    ;(made.agent as {session?: {did: string}}).session = {
      did: 'did:example:viewer',
    }
    return made
  }

  it('memberships with no group AppView configured: publicTier is unavailable', async () => {
    const {agent} = viewerAgent()
    mockListMine.mockResolvedValue({
      ok: true,
      data: [{id: MEMBERS_A, name: 'A'}],
    })
    mockGroupMemberships.mockRejectedValue(
      new GroupAppViewUnavailableError('not configured'),
    )
    const res = await resolveMyCommunitySources(agent)
    expect(res.sources).toEqual([{id: MEMBERS_A, name: 'A', tier: 'members'}])
    expect(res.publicTier).toEqual({
      kind: 'unavailable',
      reason: 'not configured',
    })
  })

  it('memberships failing at the AppView: publicTier is error', async () => {
    const {agent} = viewerAgent()
    mockListMine.mockResolvedValue({ok: true, data: []})
    mockGroupMemberships.mockRejectedValue(new Error('XRPC 502'))
    await expect(resolveMyCommunitySources(agent)).resolves.toEqual({
      sources: [],
      publicTier: {kind: 'error', reason: 'XRPC 502'},
    })
  })

  it('the combined feed carries the resolved publicTier state', async () => {
    const {agent} = viewerAgent([
      feedPost('at://did:example:f/app.bsky.feed.post/f1', t(9)),
    ])
    mockListMine.mockResolvedValue({ok: true, data: []})
    mockGroupMemberships.mockRejectedValue(
      new GroupAppViewUnavailableError('not configured'),
    )
    const api = new CommunitiesMergeFeedAPI({agent})
    const res = await api.fetch({cursor: undefined, limit: 30})
    expect(res.feed).toHaveLength(1)
    expect(api.publicTier.kind).toBe('unavailable')
  })

  it('a public timeline error keeps Following but sets publicTier', async () => {
    const {agent} = makeAgent([
      feedPost('at://did:example:f/app.bsky.feed.post/f1', t(9)),
    ])
    mockGroupTimeline.mockRejectedValue(new Error('XRPC 500'))
    const api = new CommunitiesMergeFeedAPI({
      agent,
      sources: [{id: PUBLIC_G, tier: 'public'}],
    })
    expect(api.publicTier).toEqual({kind: 'ok'})
    const res = await api.fetch({cursor: undefined, limit: 30})
    expect(res.feed.map(i => i.post.uri)).toEqual([
      'at://did:example:f/app.bsky.feed.post/f1',
    ])
    expect(api.publicTier).toEqual({kind: 'error', reason: 'XRPC 500'})
  })

  it('a single public community that cannot be fetched fails the feed', async () => {
    const {agent} = makeAgent()
    mockGroupTimeline.mockRejectedValue(
      new GroupAppViewUnavailableError('not configured'),
    )
    const api = createCommunityFeedAPI({agent, communityId: PUBLIC_G})
    await expect(api.fetch({cursor: undefined, limit: 30})).rejects.toThrow(
      'not configured',
    )
    expect(api.publicTier.kind).toBe('unavailable')
  })

  it('publicTier resets to ok when a refresh succeeds', async () => {
    const {agent} = makeAgent()
    mockGroupTimeline.mockRejectedValueOnce(new Error('XRPC 500'))
    mockGroupTimeline.mockResolvedValueOnce({
      feed: [feedPost('at://did:example:g/app.bsky.feed.post/g1', t(6))],
    })
    const api = new CommunitiesMergeFeedAPI({
      agent,
      sources: [{id: PUBLIC_G, tier: 'public'}],
    })
    await api.fetch({cursor: undefined, limit: 30})
    expect(api.publicTier.kind).toBe('error')
    await api.fetch({cursor: undefined, limit: 30})
    expect(api.publicTier.kind).toBe('ok')
  })
})

describe('members-tier items never reach the agent', () => {
  it('a members-only community feed makes zero agent calls', async () => {
    const {agent, touched, getTimeline} = makeAgent()
    mockGetTimeline.mockResolvedValue({
      ok: true,
      data: {posts: [membersPost('a1', t(9))], cursor: 'next'},
    })
    const api = createCommunityFeedAPI({agent, communityId: MEMBERS_A})
    const res = await api.fetch({cursor: undefined, limit: 30})
    await api.fetch({cursor: res.cursor, limit: 30})
    await api.peekLatest()

    expect(res.feed).toHaveLength(1)
    expect(getTimeline).not.toHaveBeenCalled()
    expect(mockGroupTimeline).not.toHaveBeenCalled()
    expect(touched).toEqual([])
  })

  it('in the combined feed, the agent only serves Following', async () => {
    const {agent, touched} = makeAgent()
    mockGetTimeline.mockResolvedValue({
      ok: true,
      data: {posts: [membersPost('a1', t(9))]},
    })
    const api = new CommunitiesMergeFeedAPI({
      agent,
      sources: [{id: MEMBERS_A, tier: 'members'}],
    })
    await api.fetch({cursor: undefined, limit: 30})
    expect(new Set(touched)).toEqual(new Set(['getTimeline']))
  })
})

describe('members-tier feed marks the config agent (N1, R3)', () => {
  // Placeholder DIDs only.
  const AGENT_DID = 'did:example:communityagent'
  const OTHER_DID = 'did:example:someoneelse'

  function agentPost(id: string, did: string | null) {
    return {
      id,
      author: {displayName: 'Steve', is_agent: true, did},
      body: `body ${id}`,
      createdAt: t(9),
    }
  }

  function serve(posts: ReturnType<typeof agentPost>[]) {
    mockGetTimeline.mockResolvedValue({ok: true, data: {posts}})
  }

  async function isAgentFlags(api: CommunitiesMergeFeedAPI) {
    const res = await api.fetch({cursor: undefined, limit: 30})
    return res.feed.map(i => getMembersPostRef(i.post)?.isAgent)
  }

  function viaSources(sources: CommunityFeedSource[]) {
    return new CommunitiesMergeFeedAPI({
      agent: makeAgent().agent,
      includeFollowing: false,
      sources,
    })
  }

  async function viaResolved(community: Record<string, unknown>) {
    const {agent} = makeAgent()
    mockListMine.mockResolvedValue({
      ok: true,
      data: [{id: MEMBERS_A, name: 'A', ...community}],
    } as never)
    const {sources} = await resolveMyCommunitySources(agent)
    return viaSources(sources)
  }

  it('a matching DID shows the agent label', async () => {
    serve([agentPost('a1', AGENT_DID)])
    const api = await viaResolved({config: {agent: AGENT_DID}})
    expect(await isAgentFlags(api)).toEqual([true])
  })

  it('reads the DID in the community home order: config.agent, agentDid, agent.did', async () => {
    serve([agentPost('a1', AGENT_DID)])
    expect(
      await isAgentFlags(await viaResolved({agentDid: AGENT_DID})),
    ).toEqual([true])
    expect(
      await isAgentFlags(
        await viaResolved({agent: {did: AGENT_DID, is_agent: true}}),
      ),
    ).toEqual([true])
    // config.agent wins over the fallbacks.
    expect(
      await isAgentFlags(
        await viaResolved({config: {agent: OTHER_DID}, agentDid: AGENT_DID}),
      ),
    ).toEqual([false])
  })

  it('a non-matching DID shows no label', async () => {
    serve([agentPost('a1', OTHER_DID), agentPost('a2', null)])
    const api = await viaResolved({config: {agent: AGENT_DID}})
    expect(await isAgentFlags(api)).toEqual([false, false])
  })

  it('a missing config DID shows no label', async () => {
    serve([agentPost('a1', AGENT_DID)])
    expect(await isAgentFlags(await viaResolved({}))).toEqual([false])
    expect(
      await isAgentFlags(await viaResolved({agent: null, agentDid: '  '})),
    ).toEqual([false])
    expect(
      await isAgentFlags(
        viaSources([{id: MEMBERS_A, tier: 'members', agentDid: undefined}]),
      ),
    ).toEqual([false])
    // A source that already carries its DID never looks it up again.
    expect(mockGetCommunity).not.toHaveBeenCalled()
  })

  it('one community’s feed looks the DID up once via getCommunity', async () => {
    const {agent, touched} = makeAgent()
    mockGetTimeline.mockResolvedValue({
      ok: true,
      data: {posts: [agentPost('a1', AGENT_DID)], cursor: 'next'},
    })
    mockGetCommunity.mockResolvedValue({
      ok: true,
      data: {id: MEMBERS_A, name: 'A', config: {agent: AGENT_DID}},
    } as never)
    const api = createCommunityFeedAPI({agent, communityId: MEMBERS_A})
    const first = await api.fetch({cursor: undefined, limit: 30})
    const second = await api.fetch({cursor: first.cursor, limit: 30})

    expect(
      [...first.feed, ...second.feed].map(
        i => getMembersPostRef(i.post)?.isAgent,
      ),
    ).toEqual([true, true])
    expect(mockGetCommunity.mock.calls).toEqual([[MEMBERS_A]])
    expect(touched).toEqual([])
  })

  it('one community’s feed fails closed when getCommunity fails', async () => {
    serve([agentPost('a1', AGENT_DID)])
    const {agent} = makeAgent()

    mockGetCommunity.mockResolvedValue({
      ok: false,
      error: {kind: 'network', message: 'down'},
    } as never)
    const notOk = createCommunityFeedAPI({agent, communityId: MEMBERS_A})
    expect(await isAgentFlags(notOk)).toEqual([false])

    mockGetCommunity.mockRejectedValue(new Error('boom'))
    const thrown = createCommunityFeedAPI({agent, communityId: MEMBERS_A})
    expect(await isAgentFlags(thrown)).toEqual([false])

    mockGetCommunity.mockResolvedValue({
      ok: true,
      data: {id: MEMBERS_A, name: 'A'},
    } as never)
    const noDid = createCommunityFeedAPI({agent, communityId: MEMBERS_A})
    expect(await isAgentFlags(noDid)).toEqual([false])
  })
})
