import {AppBskyFeedPost, moderatePost, type ModerationOpts} from '@atproto/api'
import {describe, expect, it} from '@jest/globals'

import {type CommunityPost} from '#/lib/agent-runtime/communitiesClient'
import {FeedTuner} from '#/lib/api/feed-manip'
import {
  getMembersPostRef,
  isCommunityAgentAuthor,
  isMembersPostUri,
  membersPostToFeedViewPost,
  membersPostUri,
  parseMembersPostUri,
  type ReasonCommunity,
} from '#/features/communities/membersPost'

const BADGE: ReasonCommunity = {
  $type: 'reasonCommunity',
  communityId: 'community-a',
  name: 'A',
  tier: 'members',
}

const POST: CommunityPost = {
  id: 'p1',
  author: {displayName: 'Steve', avatar: null, is_agent: true},
  body: 'Episode 12 is a good start.',
  createdAt: '2026-10-28T10:00:00.000Z',
}

/** Wraps an object so every property read (at any depth) is recorded. */
function tracked<T extends object>(obj: T, reads: string[], path = ''): T {
  return new Proxy(obj, {
    get(target, prop, receiver) {
      const key = `${path}${String(prop)}`
      reads.push(key)
      const v = Reflect.get(target, prop, receiver)
      return v && typeof v === 'object' ? tracked(v, reads, `${key}.`) : v
    },
  })
}

describe('membersPostToFeedViewPost', () => {
  it('maps to a view with the synthetic uri and reads no at:// field', () => {
    const reads: string[] = []
    const view = membersPostToFeedViewPost(
      'community-a',
      tracked({...POST, author: {...POST.author}}, reads),
      BADGE,
    )

    expect(view.post.uri).toBe('ao-community://community-a/p1')
    expect(isMembersPostUri(view.post.uri)).toBe(true)
    expect((view as {__source?: unknown}).__source).toEqual(BADGE)
    expect(view.post.indexedAt).toBe(POST.createdAt)
    expect((view.post.record as AppBskyFeedPost.Record).text).toBe(POST.body)

    // Only the runtime's CommunityPost fields were read.
    const allowed = new Set([
      'id',
      'createdAt',
      'body',
      'author',
      'author.is_agent',
      'author.did',
      'author.displayName',
      'author.avatar',
    ])
    expect(reads.filter(r => !allowed.has(r))).toEqual([])
    expect(reads).not.toContain('uri')
    expect(reads).not.toContain('cid')

    // Nothing in the view points at a PDS.
    expect(JSON.stringify(view)).not.toContain('at://')
    expect(view.post.author.did.startsWith('did:')).toBe(false)
  })

  it('carries the agent flag from is_agent, not the name', () => {
    const view = membersPostToFeedViewPost('community-a', POST, BADGE)
    expect(getMembersPostRef(view.post)).toEqual({
      communityId: 'community-a',
      postId: 'p1',
      isAgent: true,
    })
    const human = membersPostToFeedViewPost(
      'community-a',
      {...POST, author: {displayName: 'Steve Agent', is_agent: false}},
      BADGE,
    )
    expect(getMembersPostRef(human.post)?.isAgent).toBe(false)
  })

  it('requires author.did to match the agent DID when one is known', () => {
    const AGENT = 'did:example:agent'
    const agent = membersPostToFeedViewPost(
      'community-a',
      {...POST, author: {...POST.author, did: AGENT}} as CommunityPost,
      BADGE,
      AGENT,
    )
    expect(getMembersPostRef(agent.post)?.isAgent).toBe(true)
    // The real DID never lands in the view.
    expect(JSON.stringify(agent)).not.toContain(AGENT)

    const spoof = membersPostToFeedViewPost(
      'community-a',
      {
        ...POST,
        author: {...POST.author, did: 'did:example:mallory'},
      } as CommunityPost,
      BADGE,
      AGENT,
    )
    expect(getMembersPostRef(spoof.post)?.isAgent).toBe(false)
  })

  it('treats a missing author as a member, as before', () => {
    const {author: _author, ...noAuthor} = POST
    const view = membersPostToFeedViewPost(
      'community-a',
      noAuthor as CommunityPost,
      BADGE,
      'did:example:agent',
    )
    expect(getMembersPostRef(view.post)?.isAgent).toBe(false)
    expect(view.post.author.displayName).toBe('')
  })

  it('renders through the feed pipeline (valid record, moderation, tuner)', () => {
    const view = membersPostToFeedViewPost('community-a', POST, BADGE)
    expect(AppBskyFeedPost.validateRecord(view.post.record).success).toBe(true)
    expect(view.post.viewer?.embeddingDisabled).toBe(true)

    const opts: ModerationOpts = {
      userDid: undefined,
      prefs: {
        adultContentEnabled: false,
        labels: {},
        labelers: [],
        mutedWords: [],
        hiddenPosts: [],
      },
      labelDefs: {},
    }
    expect(() => moderatePost(view.post, opts)).not.toThrow()

    const slices = new FeedTuner([]).tune([view])
    expect(slices).toHaveLength(1)
    expect(slices[0].items[0].post.uri).toBe(view.post.uri)
    expect(slices[0].reason).toEqual(BADGE)
  })
})

describe('members post uri', () => {
  it('round-trips ids with reserved characters', () => {
    const uri = membersPostUri('a/b c', 'p?1')
    expect(parseMembersPostUri(uri)).toEqual({
      communityId: 'a/b c',
      postId: 'p?1',
    })
  })

  it('rejects at:// and malformed uris', () => {
    expect(parseMembersPostUri('at://did:example:x/app.bsky.feed.post/1')).toBe(
      undefined,
    )
    expect(parseMembersPostUri('ao-community://only-one')).toBe(undefined)
    expect(parseMembersPostUri('ao-community://a/b/c')).toBe(undefined)
  })
})

describe('isCommunityAgentAuthor', () => {
  const AGENT = 'did:example:agent'

  it('matches is_agent plus the agent DID', () => {
    expect(isCommunityAgentAuthor({did: AGENT, is_agent: true}, AGENT)).toBe(
      true,
    )
  })

  it('refuses a member, a different DID or a missing DID', () => {
    expect(isCommunityAgentAuthor({did: AGENT, is_agent: false}, AGENT)).toBe(
      false,
    )
    expect(
      isCommunityAgentAuthor({did: 'did:example:other', is_agent: true}, AGENT),
    ).toBe(false)
    expect(isCommunityAgentAuthor({is_agent: true}, AGENT)).toBe(false)
    expect(isCommunityAgentAuthor({did: AGENT, is_agent: 'true'}, AGENT)).toBe(
      false,
    )
  })

  it('never matches on the display name', () => {
    expect(
      isCommunityAgentAuthor(
        {did: 'did:example:other', displayName: AGENT, is_agent: true},
        AGENT,
      ),
    ).toBe(false)
  })

  it('falls back to is_agent alone when no agent DID is known', () => {
    expect(isCommunityAgentAuthor({is_agent: true}, undefined)).toBe(true)
    expect(isCommunityAgentAuthor({is_agent: true}, '')).toBe(true)
    expect(isCommunityAgentAuthor({is_agent: false}, undefined)).toBe(false)
  })

  it('treats a missing or malformed author as a member', () => {
    expect(isCommunityAgentAuthor(undefined, AGENT)).toBe(false)
    expect(isCommunityAgentAuthor(null, undefined)).toBe(false)
    expect(isCommunityAgentAuthor('agent', undefined)).toBe(false)
  })
})
