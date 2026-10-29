import {AppBskyFeedPost, moderatePost, type ModerationOpts} from '@atproto/api'
import {describe, expect, it} from '@jest/globals'

import {FeedTuner} from '#/lib/api/feed-manip'
import {doorItem} from '#/lib/communities/__fixtures__/door'
import {type DoorItem} from '#/lib/communities/doorContract'
import {
  getMembersPostRef,
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

// Placeholder DIDs only.
const AGENT_DID = 'did:plc:communityagent'
const OTHER_DID = 'did:plc:someonelse'

/** door.json's agent item, re-keyed to this test's id and agent DID. */
const POST: DoorItem = {
  ...doorItem('agent'),
  id: 'p1',
  author: {did: AGENT_DID, is_agent: true},
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
      tracked({...POST, author: {...POST.author!}}, reads),
      BADGE,
    )

    expect(view.post.uri).toBe('ao-community://community-a/p1')
    expect(isMembersPostUri(view.post.uri)).toBe(true)
    expect((view as {__source?: unknown}).__source).toEqual(BADGE)
    expect(view.post.indexedAt).toBe(POST.createdAt)
    expect((view.post.record as AppBskyFeedPost.Record).text).toBe(POST.text)
    expect(view.post.author.displayName).toBe(POST.authorId)

    // Only the door item's fields were read.
    const allowed = new Set([
      'id',
      'createdAt',
      'text',
      'authorId',
      'author',
      'author.is_agent',
      'author.did',
    ])
    expect(reads.filter(r => !allowed.has(r))).toEqual([])
    expect(reads).not.toContain('uri')
    expect(reads).not.toContain('cid')

    // Nothing in the view points at a PDS.
    expect(JSON.stringify(view)).not.toContain('at://')
    expect(view.post.author.did.startsWith('did:')).toBe(false)
  })

  it('marks the agent only when is_agent and the DID match the config', () => {
    const view = membersPostToFeedViewPost(
      'community-a',
      POST,
      BADGE,
      AGENT_DID,
    )
    expect(getMembersPostRef(view.post)).toEqual({
      communityId: 'community-a',
      postId: 'p1',
      isAgent: true,
    })
    const human = membersPostToFeedViewPost(
      'community-a',
      {...POST, author: {is_agent: false, did: AGENT_DID}},
      BADGE,
      AGENT_DID,
    )
    expect(getMembersPostRef(human.post)?.isAgent).toBe(false)
  })

  it('is_agent true with a non-matching DID is not the agent', () => {
    const view = membersPostToFeedViewPost(
      'community-a',
      {...POST, author: {is_agent: true, did: OTHER_DID}},
      BADGE,
      AGENT_DID,
    )
    expect(getMembersPostRef(view.post)?.isAgent).toBe(false)
  })

  it('is_agent true with did null, or no config agent DID, is not the agent', () => {
    const nullDid = membersPostToFeedViewPost(
      'community-a',
      {...POST, author: {is_agent: true, did: null}},
      BADGE,
      AGENT_DID,
    )
    expect(getMembersPostRef(nullDid.post)?.isAgent).toBe(false)
    const noConfig = membersPostToFeedViewPost('community-a', POST, BADGE)
    expect(getMembersPostRef(noConfig.post)?.isAgent).toBe(false)
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
