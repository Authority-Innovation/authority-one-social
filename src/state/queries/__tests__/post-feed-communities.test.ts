import {type BskyAgent} from '@atproto/api'
import {describe, expect, it, jest} from '@jest/globals'

jest.mock('#/lib/agent-runtime/communitiesClient', () => ({
  getTimeline: jest.fn(),
  listMyCommunities: jest.fn(),
}))
// post-feed.ts and group.ts pull in the session, dialog and media stack,
// which the iOS jest project cannot load. None of it is under test here.
jest.mock('#/state/queries/group', () => ({
  fetchGroupTimeline: jest.fn(),
  fetchGroupMemberships: jest.fn(),
}))
jest.mock('#/state/session', () => ({
  useAgent: jest.fn(),
  useSession: jest.fn(),
}))
jest.mock('#/state/queries/preferences', () => ({
  usePreferencesQuery: jest.fn(),
}))
jest.mock('#/state/preferences/feed-tuners', () => ({
  useFeedTuners: jest.fn(),
}))
jest.mock('#/state/preferences/moderation-opts', () => ({
  useModerationOpts: jest.fn(),
}))
jest.mock('#/view/com/posts/PostFeedErrorMessage', () => ({
  KnownError: {},
}))

import * as communitiesClient from '#/lib/agent-runtime/communitiesClient'
import {AuthorFeedAPI} from '#/lib/api/feed/author'
import {CommunitiesMergeFeedAPI, EmptyFeedAPI} from '#/lib/api/feed/communities'
import {CustomFeedAPI} from '#/lib/api/feed/custom'
import {DemoFeedAPI} from '#/lib/api/feed/demo'
import {FollowingFeedAPI} from '#/lib/api/feed/following'
import {LikesFeedAPI} from '#/lib/api/feed/likes'
import {ListFeedAPI} from '#/lib/api/feed/list'
import {MergeFeedAPI} from '#/lib/api/feed/merge'
import {PostListFeedAPI} from '#/lib/api/feed/posts'
import {
  createApi,
  type FeedDescriptor,
  type FeedParams,
  feedQueryKey,
  RQKEY,
  RQKEY_ROOT,
} from '#/state/queries/post-feed'
import * as env from '#/env'
import {COMMUNITY_FEED_RQKEY_ROOT} from '#/features/communities/cache'
import {getOfferedCommunityFeedDescriptors} from '#/features/communities/feedDescriptors'

function makeAgent() {
  const touched: string[] = []
  const agent = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === 'string') touched.push(prop)
        return jest.fn()
      },
    },
  ) as unknown as BskyAgent
  return {agent, touched}
}

function api(
  feedDesc: FeedDescriptor,
  communitiesEnabled: boolean,
  feedParams: FeedParams = {},
) {
  const {agent} = makeAgent()
  return createApi({
    feedDesc,
    feedParams,
    feedTuners: [],
    agent,
    enableFollowingToDiscoverFallback: false,
    communitiesEnabled,
  })
}

// The pre-existing descriptors and the API each one produced on the base.
const EXISTING: [FeedDescriptor, FeedParams, unknown][] = [
  ['following', {}, FollowingFeedAPI],
  ['following', {mergeFeedEnabled: true}, MergeFeedAPI],
  ['author|did:example:a|posts_with_replies', {}, AuthorFeedAPI],
  ['likes|did:example:a', {}, LikesFeedAPI],
  ['feedgen|at://did:example:a/app.bsky.feed.generator/x', {}, CustomFeedAPI],
  ['list|at://did:example:a/app.bsky.graph.list/x', {}, ListFeedAPI],
  ['posts|at://did:example:a/app.bsky.feed.post/x', {}, PostListFeedAPI],
  ['demo', {}, DemoFeedAPI],
]

describe('feed descriptors with the communities flag off', () => {
  it('the flag defaults off in this build', () => {
    expect(env.COMMUNITIES_ENABLED).toBe(false)
  })

  it('offers no community descriptor', () => {
    expect(getOfferedCommunityFeedDescriptors(['community-a'])).toEqual([])
    expect(getOfferedCommunityFeedDescriptors(['community-a'], false)).toEqual(
      [],
    )
  })

  it.each(['communities', 'community|community-a'] as FeedDescriptor[])(
    'a stray %s descriptor fetches nothing',
    async desc => {
      const {agent, touched} = makeAgent()
      const feedApi = createApi({
        feedDesc: desc,
        feedParams: {},
        feedTuners: [],
        agent,
        enableFollowingToDiscoverFallback: false,
      })
      expect(feedApi).toBeInstanceOf(EmptyFeedAPI)
      await expect(
        feedApi.fetch({cursor: undefined, limit: 30}),
      ).resolves.toEqual({feed: []})
      expect(touched).toEqual([])
      expect(communitiesClient.getTimeline).not.toHaveBeenCalled()
      expect(communitiesClient.listMyCommunities).not.toHaveBeenCalled()
    },
  )

  it.each(EXISTING)(
    '%s dispatches as before (flag off and on)',
    (desc, params, Expected) => {
      expect(api(desc, false, params)).toBeInstanceOf(Expected)
      expect(api(desc, true, params)).toBeInstanceOf(Expected)
    },
  )

  it.each(EXISTING)('%s keeps its query key', (desc, params) => {
    expect(RQKEY(desc, params)).toEqual([RQKEY_ROOT, desc, params])
    expect(feedQueryKey(desc, params, 'did:example:a')).toEqual([
      RQKEY_ROOT,
      desc,
      params,
    ])
  })
})

describe('feed descriptors with the communities flag on', () => {
  it('offers the combined feed and one per community', () => {
    expect(
      getOfferedCommunityFeedDescriptors(['community-a', 'community-b'], true),
    ).toEqual(['communities', 'community|community-a', 'community|community-b'])
  })

  it('dispatches communities to the merge API', () => {
    const feedApi = api('communities', true)
    expect(feedApi).toBeInstanceOf(CommunitiesMergeFeedAPI)
    expect((feedApi as CommunitiesMergeFeedAPI).includeFollowing).toBe(true)
  })

  it('dispatches community|<id> to that one community', () => {
    const members = api('community|community-a', true)
    expect(members).toBeInstanceOf(CommunitiesMergeFeedAPI)
    expect((members as CommunitiesMergeFeedAPI).includeFollowing).toBe(false)
    expect((members as CommunitiesMergeFeedAPI).fixedSources).toEqual([
      {id: 'community-a', tier: 'members'},
    ])
    const pub = api(
      'community|at://did:example:o/com.authorityone.group.profile/g',
      true,
    )
    expect((pub as CommunitiesMergeFeedAPI).fixedSources).toEqual([
      {
        id: 'at://did:example:o/com.authorityone.group.profile/g',
        tier: 'public',
      },
    ])
  })

  it('keys community feeds under their own root with the account DID', () => {
    expect(feedQueryKey('communities', undefined, 'did:example:a')).toEqual([
      COMMUNITY_FEED_RQKEY_ROOT,
      'communities',
      {},
      {accountDid: 'did:example:a'},
    ])
    expect(feedQueryKey('communities', undefined, 'did:example:a')).not.toEqual(
      feedQueryKey('communities', undefined, 'did:example:b'),
    )
  })
})
