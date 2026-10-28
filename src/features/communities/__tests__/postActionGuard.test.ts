import {describe, expect, it} from '@jest/globals'

import {membersPostUri} from '#/features/communities/membersPost'
import {
  doorHref,
  guardPostAction,
  isPostActionAllowed,
  MEMBERS_POST_ACTIONS,
  type PostAction,
} from '#/features/communities/postActionGuard'

const MEMBERS = {uri: membersPostUri('community-a', 'p1')}
const ATPROTO = {uri: 'at://did:example:author/app.bsky.feed.post/3k'}

// The table the report documents. Keep it in sync with MEMBERS_POST_ACTIONS.
const TABLE: [PostAction, 'disabled' | 'door'][] = [
  ['like', 'disabled'],
  ['repost', 'disabled'],
  ['quote', 'disabled'],
  ['reply', 'door'],
  ['share-link', 'disabled'],
  ['copy-link', 'disabled'],
  ['embed', 'disabled'],
  ['bookmark', 'disabled'],
  ['send-via-dm', 'disabled'],
  ['open-thread', 'door'],
  ['open-author', 'disabled'],
  ['translate', 'disabled'],
  ['mute-thread', 'disabled'],
  ['hide-reply', 'disabled'],
  ['pin', 'disabled'],
  ['report', 'door'],
  ['delete', 'door'],
  ['copy-text', 'disabled'],
]

describe('guardPostAction', () => {
  it('covers every action', () => {
    expect(TABLE.map(([a]) => a).sort()).toEqual(
      Object.keys(MEMBERS_POST_ACTIONS).sort(),
    )
  })

  it.each(TABLE)('members item: %s is %s', (action, expected) => {
    const guard = guardPostAction(MEMBERS, action)
    expect(guard.kind).toBe(expected)
    expect(isPostActionAllowed(MEMBERS, action)).toBe(false)
    if (expected === 'door') {
      expect(guard).toEqual({
        kind: 'door',
        communityId: 'community-a',
        postId: 'p1',
      })
      expect(doorHref(guard)).toBe('/c/community-a')
    } else {
      expect(doorHref(guard)).toBeUndefined()
    }
  })

  it.each(TABLE)('at:// post: %s is allowed (unchanged)', action => {
    expect(guardPostAction(ATPROTO, action)).toEqual({kind: 'allow'})
  })

  it.each(TABLE)('malformed members uri: %s is disabled', action => {
    expect(guardPostAction({uri: 'ao-community://broken'}, action)).toEqual({
      kind: 'disabled',
    })
  })
})
