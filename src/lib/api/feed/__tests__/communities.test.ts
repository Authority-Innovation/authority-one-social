import {type BskyAgent} from '@atproto/api'
import {beforeEach, describe, expect, it, jest} from '@jest/globals'

jest.mock('#/logger', () => ({logger: {warn: jest.fn(), error: jest.fn()}}))
jest.mock('#/lib/agent-runtime/communitiesClient', () => ({
  getTimeline: jest.fn(),
  listMyCommunities: jest.fn(),
}))
jest.mock('#/state/queries/group', () => ({
  fetchGroupTimeline: jest.fn(),
  fetchGroupMemberships: jest.fn(),
}))

import * as communitiesClient from '#/lib/agent-runtime/communitiesClient'
import {
  CommunitiesMergeFeedAPI,
  createCommunityFeedAPI,
  resolveMyCommunitySources,
} from '#/lib/api/feed/communities'
import {fetchGroupMemberships, fetchGroupTimeline} from '#/state/queries/group'

const mockGetTimeline = jest.mocked(communitiesClient.getTimeline)
const mockListMine = jest.mocked(communitiesClient.listMyCommunities)
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
    await expect(resolveMyCommunitySources(agent)).resolves.toEqual([
      {id: MEMBERS_A, name: 'A', tier: 'members'},
      {id: PUBLIC_G, name: 'G', tier: 'public'},
    ])
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
