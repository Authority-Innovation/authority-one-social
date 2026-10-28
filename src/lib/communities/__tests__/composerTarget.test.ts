import {describe, expect, it} from '@jest/globals'

import {
  type ComposerTarget,
  DEFAULT_COMPOSER_TARGET,
  guardComposerPdsWrite,
  GUARDED_PDS_WRITES,
} from '#/lib/communities/composerTarget'

describe('guardComposerPdsWrite', () => {
  it('has no default: a missing target is refused', () => {
    expect(DEFAULT_COMPOSER_TARGET).toEqual({kind: 'profile'})
    expect(guardComposerPdsWrite(DEFAULT_COMPOSER_TARGET)).toEqual({
      allowed: true,
    })
    expect(guardComposerPdsWrite(undefined)).toEqual({
      allowed: false,
      reason: 'unknown-target',
      refusedWrites: GUARDED_PDS_WRITES,
    })
  })

  it.each<[string, ComposerTarget, boolean, string | undefined]>([
    ['profile', {kind: 'profile'}, true, undefined],
    [
      'community public',
      {kind: 'community', id: 'c1', tier: 'public'},
      false,
      'public-community-write-not-available',
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
})
