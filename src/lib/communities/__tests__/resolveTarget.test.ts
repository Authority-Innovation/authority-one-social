import {describe, expect, it} from '@jest/globals'

import {type ComposerTarget} from '#/lib/communities/composerTarget'
import {
  type ComposerTargetErrorCode,
  type ComposerTargetRoute,
  resolveTarget,
  type ResolveTargetContext,
} from '#/lib/communities/resolveTarget'

const PDS_POST = 'at://did:plc:parent/app.bsky.feed.post/3kabc'
const RUNTIME_POST = 'cpost_123'

const profile: ComposerTarget = {kind: 'profile'}
const pub: ComposerTarget = {kind: 'community', id: 'c1', tier: 'public'}
const members: ComposerTarget = {kind: 'community', id: 'c1', tier: 'members'}
const paid: ComposerTarget = {kind: 'community', id: 'c1', tier: 'paid'}

const on = {communitiesEnabled: true}

type Row = [
  string,
  ResolveTargetContext,
  (
    | {target: ComposerTarget; route: ComposerTargetRoute; locked?: boolean}
    | {error: ComposerTargetErrorCode}
  ),
]

describe('resolveTarget', () => {
  it.each<Row>([
    // Top-level posts
    ['nothing requested -> profile', {...on}, {target: profile, route: 'pds'}],
    ['profile', {...on, requested: profile}, {target: profile, route: 'pds'}],
    [
      'public community refused',
      {...on, requested: pub},
      {error: 'public-community-not-available'},
    ],
    [
      'members community',
      {...on, requested: members},
      {target: members, route: 'communities'},
    ],
    [
      'paid community',
      {...on, requested: paid},
      {target: paid, route: 'communities'},
    ],

    // Reply inheritance
    [
      // Could be a public community post; the URI alone cannot tell.
      'flag on: reply to a PDS post with no target is unknown',
      {...on, parent: {uri: PDS_POST}},
      {error: 'unknown-parent-target'},
    ],
    [
      'reply to a PDS post with an explicit profile target',
      {...on, parent: {uri: PDS_POST, target: profile}},
      {target: profile, route: 'pds'},
    ],
    [
      'reply to a public parent refused',
      {...on, parent: {uri: PDS_POST, target: pub}},
      {error: 'public-community-not-available'},
    ],
    [
      'reply inherits a members parent',
      {...on, parent: {uri: RUNTIME_POST, target: members}},
      {target: members, route: 'communities'},
    ],
    [
      'reply inherits a paid parent',
      {...on, parent: {uri: RUNTIME_POST, target: paid}},
      {target: paid, route: 'communities'},
    ],
    [
      'reply with a matching explicit target',
      {...on, requested: members, parent: {uri: RUNTIME_POST, target: members}},
      {target: members, route: 'communities'},
    ],

    // Fail closed
    [
      'unknown parent (runtime id, no target)',
      {...on, parent: {uri: RUNTIME_POST}},
      {error: 'unknown-parent-target'},
    ],
    [
      'unknown parent (empty uri)',
      {...on, parent: {uri: ''}},
      {error: 'unknown-parent-target'},
    ],
    [
      'unknown parent (non-post AT-URI)',
      {...on, parent: {uri: 'at://did:plc:x/app.bsky.graph.list/1'}},
      {error: 'unknown-parent-target'},
    ],
    [
      'unknown parent (malformed target)',
      {
        ...on,
        parent: {
          uri: PDS_POST,
          target: {kind: 'community', id: 'c1', tier: 'vip'} as never,
        },
      },
      {error: 'unknown-parent-target'},
    ],
    [
      'unknown parent (null parent)',
      {...on, parent: null as never},
      {error: 'unknown-parent-target'},
    ],
    [
      'explicit profile on a members parent',
      {...on, requested: profile, parent: {uri: RUNTIME_POST, target: members}},
      {error: 'reply-target-mismatch'},
    ],
    [
      'explicit members on a profile parent',
      {...on, requested: members, parent: {uri: PDS_POST, target: profile}},
      {error: 'reply-target-mismatch'},
    ],
    [
      'malformed requested target',
      {...on, requested: {kind: 'group'} as never},
      {error: 'unknown-target'},
    ],
    [
      'community with an empty id',
      {...on, requested: {kind: 'community', id: ' ', tier: 'members'}},
      {error: 'unknown-target'},
    ],

    // Flag off (the default)
    [
      'flag off: profile unchanged',
      {communitiesEnabled: false},
      {target: profile, route: 'pds'},
    ],
    [
      'flag off: reply to a PDS post unchanged',
      {communitiesEnabled: false, parent: {uri: PDS_POST}},
      {target: profile, route: 'pds'},
    ],
    [
      'flag off: members refused',
      {communitiesEnabled: false, requested: members},
      {error: 'communities-disabled'},
    ],
    [
      'flag off: public community refused',
      {communitiesEnabled: false, requested: pub},
      {error: 'communities-disabled'},
    ],
    [
      'flag off: locked refused',
      {
        communitiesEnabled: false,
        lockedCommunityId: 'c1',
        lockedCommunityTier: 'members',
      },
      {error: 'communities-disabled'},
    ],

    // Locked community
    [
      'locked: nothing requested -> the locked community',
      {...on, lockedCommunityId: 'c1', lockedCommunityTier: 'members'},
      {target: members, route: 'communities', locked: true},
    ],
    [
      'locked: profile request is overridden',
      {
        ...on,
        requested: profile,
        lockedCommunityId: 'c1',
        lockedCommunityTier: 'members',
      },
      {target: members, route: 'communities', locked: true},
    ],
    [
      'locked: a public locked community is refused',
      {...on, lockedCommunityId: 'c1', lockedCommunityTier: 'public'},
      {error: 'public-community-not-available'},
    ],
    [
      'locked: tier taken from a matching request',
      {...on, requested: paid, lockedCommunityId: 'c1'},
      {target: paid, route: 'communities', locked: true},
    ],
    [
      'locked: reply inside the locked community',
      {
        ...on,
        parent: {uri: RUNTIME_POST, target: members},
        lockedCommunityId: 'c1',
      },
      {target: members, route: 'communities', locked: true},
    ],
    [
      'locked: another community refused',
      {
        ...on,
        requested: {kind: 'community', id: 'c2', tier: 'public'},
        lockedCommunityId: 'c1',
        lockedCommunityTier: 'public',
      },
      {error: 'locked-community-mismatch'},
    ],
    [
      'locked: reply to a profile post refused',
      {
        ...on,
        parent: {uri: PDS_POST, target: profile},
        lockedCommunityId: 'c1',
        lockedCommunityTier: 'members',
      },
      {error: 'locked-community-mismatch'},
    ],
    [
      'locked: tier unknown',
      {...on, lockedCommunityId: 'c1'},
      {error: 'locked-community-tier-unknown'},
    ],
    [
      'locked: request tier disagrees with config tier',
      {
        ...on,
        requested: pub,
        lockedCommunityId: 'c1',
        lockedCommunityTier: 'members',
      },
      {error: 'unknown-target'},
    ],
    [
      'locked: blank id means not locked',
      {...on, lockedCommunityId: '   '},
      {target: profile, route: 'pds'},
    ],
  ])('%s', (_name, context, expected) => {
    const res = resolveTarget(context)
    if ('error' in expected) {
      expect(res).toEqual({ok: false, error: {code: expected.error}})
    } else {
      expect(res).toEqual({
        ok: true,
        target: expected.target,
        route: expected.route,
        locked: expected.locked ?? false,
      })
    }
  })

  it('returns a canonical target without extra keys', () => {
    const res = resolveTarget({
      ...on,
      requested: {...members, extra: 'smuggled'} as never,
    })
    expect(res).toEqual({
      ok: true,
      target: members,
      route: 'communities',
      locked: false,
    })
  })

  it('never throws on garbage input', () => {
    expect(resolveTarget(undefined as never)).toEqual({
      ok: false,
      error: {code: 'unknown-target'},
    })
    expect(() =>
      resolveTarget({communitiesEnabled: 'yes' as never, requested: members}),
    ).not.toThrow()
    expect(
      resolveTarget({communitiesEnabled: 'yes' as never, requested: members}),
    ).toEqual({ok: false, error: {code: 'communities-disabled'}})
  })
})
