import {describe, expect, it} from '@jest/globals'

import {
  assertComposerPdsWrite,
  ComposerPdsWriteRefusedError,
  type ComposerTarget,
  DEFAULT_COMPOSER_TARGET,
  guardComposerPdsWrite,
  GUARDED_PDS_WRITES,
} from '#/lib/communities/composerTarget'

describe('guardComposerPdsWrite', () => {
  it('defaults to the profile target', () => {
    expect(DEFAULT_COMPOSER_TARGET).toEqual({kind: 'profile'})
    expect(guardComposerPdsWrite()).toEqual({allowed: true})
    expect(guardComposerPdsWrite(undefined)).toEqual({allowed: true})
  })

  it.each<[string, ComposerTarget, boolean, string | undefined]>([
    ['profile', {kind: 'profile'}, true, undefined],
    [
      'community public',
      {kind: 'community', id: 'c1', tier: 'public'},
      true,
      undefined,
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

describe('assertComposerPdsWrite', () => {
  it.each<[string, ComposerTarget | undefined]>([
    ['default', undefined],
    ['profile', {kind: 'profile'}],
    ['community public', {kind: 'community', id: 'c1', tier: 'public'}],
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
