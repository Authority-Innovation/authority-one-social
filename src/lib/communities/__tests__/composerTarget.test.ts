import {describe, expect, it} from '@jest/globals'

import {
  assertComposerPdsWrite,
  ComposerPdsWriteRefusedError,
  type ComposerTarget,
  DEFAULT_COMPOSER_TARGET,
  guardComposerPdsWrite,
  GUARDED_PDS_WRITES,
  type GuardedPdsWrite,
} from '#/lib/communities/composerTarget'
import {type GroupPostBinding} from '#/lib/communities/groupPostBinding'

describe('guardComposerPdsWrite', () => {
  it('defaults to the profile: no target is allowed', () => {
    expect(DEFAULT_COMPOSER_TARGET).toEqual({kind: 'profile'})
    expect(guardComposerPdsWrite(DEFAULT_COMPOSER_TARGET)).toEqual({
      allowed: true,
    })
    expect(guardComposerPdsWrite(undefined)).toEqual({allowed: true})
    expect(guardComposerPdsWrite()).toEqual({allowed: true})
  })

  it.each<[string, ComposerTarget, boolean, string | undefined]>([
    ['profile', {kind: 'profile'}, true, undefined],
    [
      'community public, no binding',
      {kind: 'community', id: 'c1', tier: 'public'},
      false,
      'public-community-not-available',
    ],
    [
      'community members',
      {kind: 'community', id: 'c1', tier: 'members'},
      false,
      'members-write-not-available',
    ],
    [
      'community paid',
      {kind: 'community', id: 'c1', tier: 'paid'},
      false,
      'members-write-not-available',
    ],
  ])('%s', (_name, target, allowed, reason) => {
    const decision = guardComposerPdsWrite(target)
    expect(decision.allowed).toBe(allowed)
    if (!decision.allowed) {
      expect(decision.reason).toBe(reason)
      expect(decision.refusedWrites).toEqual(GUARDED_PDS_WRITES)
    }
  })

  it.each<[string, unknown]>([
    ['null', null],
    ['a string', 'members'],
    ['an unknown kind', {kind: 'group'}],
    ['an unknown tier', {kind: 'community', id: 'c1', tier: 'vip'}],
    ['a community with no tier', {kind: 'community', id: 'c1'}],
  ])('fails closed on %s, without throwing', (_name, target) => {
    const decision = guardComposerPdsWrite(target as ComposerTarget)
    expect(decision).toEqual({
      allowed: false,
      reason: 'unknown-target',
      refusedWrites: GUARDED_PDS_WRITES,
    })
  })

  it('covers every repo write and blob upload the composer can reach', () => {
    expect(GUARDED_PDS_WRITES).toEqual(
      expect.arrayContaining([
        'com.atproto.repo.createRecord',
        'com.atproto.repo.putRecord',
        'com.atproto.repo.applyWrites',
        'com.atproto.repo.uploadBlob',
      ]),
    )
  })

  it('covers every draft endpoint the composer can reach, including delete', () => {
    // deleteDraft is reachable from the composer via DraftsButton ->
    // DraftsListDialog -> DraftItem, and after publish via draft cleanup.
    expect(GUARDED_PDS_WRITES).toEqual(
      expect.arrayContaining([
        'app.bsky.draft.createDraft',
        'app.bsky.draft.updateDraft',
        'app.bsky.draft.deleteDraft',
        'app.bsky.video.uploadVideo',
      ]),
    )
  })
})

describe('guardComposerPdsWrite: the binding is the only public PDS write', () => {
  const PUBLIC: ComposerTarget = {kind: 'community', id: 'c1', tier: 'public'}
  const GROUP = {
    uri: 'at://did:plc:owner/com.authorityone.group.profile/self',
    cid: 'bafyreie5737gdxlw5i64vzichcalba3z2v5n6icifvx5xytvske7mr3hpm',
  }
  const BINDING: GroupPostBinding = {
    target: {kind: 'community', id: 'c1', tier: 'public'},
    group: GROUP,
  }

  it('allows a public target with a well-formed binding to that community', () => {
    expect(guardComposerPdsWrite(PUBLIC, {binding: BINDING})).toEqual({
      allowed: true,
    })
  })

  it.each<[string, unknown]>([
    ['no binding', undefined],
    [
      'a binding to another community',
      {...BINDING, target: {kind: 'community', id: 'c2', tier: 'public'}},
    ],
    [
      'a members binding',
      {...BINDING, target: {kind: 'community', id: 'c1', tier: 'members'}},
    ],
    ['a binding with no group', {target: BINDING.target}],
    [
      'a binding with no group cid',
      {target: BINDING.target, group: {uri: GROUP.uri}},
    ],
  ])('refuses a public write with %s', (_name, binding) => {
    expect(guardComposerPdsWrite(PUBLIC, {binding})).toEqual({
      allowed: false,
      reason: 'public-community-not-available',
      refusedWrites: GUARDED_PDS_WRITES,
    })
  })

  it.each<GuardedPdsWrite>(GUARDED_PDS_WRITES)(
    'assertComposerPdsWrite refuses %s for a public target (no binding)',
    write => {
      expect(() => assertComposerPdsWrite(PUBLIC, write)).toThrow(
        ComposerPdsWriteRefusedError,
      )
    },
  )

  it('a binding never unlocks members or paid', () => {
    for (const tier of ['members', 'paid'] as const) {
      expect(
        guardComposerPdsWrite(
          {kind: 'community', id: 'c1', tier},
          {binding: BINDING},
        ),
      ).toMatchObject({allowed: false, reason: 'members-write-not-available'})
    }
  })
})

describe('assertComposerPdsWrite', () => {
  it.each<[string, ComposerTarget | undefined]>([
    ['default', undefined],
    ['profile', {kind: 'profile'}],
  ])('allows %s', (_name, target) => {
    expect(() =>
      assertComposerPdsWrite(target, 'app.bsky.draft.deleteDraft'),
    ).not.toThrow()
  })

  it.each<[string, unknown, string]>([
    [
      'community members',
      {kind: 'community', id: 'c1', tier: 'members'},
      'members-write-not-available',
    ],
    [
      'community paid',
      {kind: 'community', id: 'c1', tier: 'paid'},
      'members-write-not-available',
    ],
    ['an unknown kind', {kind: 'group'}, 'unknown-target'],
    [
      'community public (no binding)',
      {kind: 'community', id: 'c1', tier: 'public'},
      'public-community-not-available',
    ],
  ])('throws a typed refusal for %s', (_name, target, reason) => {
    let thrown: unknown
    try {
      assertComposerPdsWrite(
        target as ComposerTarget,
        'app.bsky.draft.deleteDraft',
      )
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(ComposerPdsWriteRefusedError)
    expect(thrown).toMatchObject({
      reason,
      write: 'app.bsky.draft.deleteDraft',
    })
  })
})
