import {beforeEach, describe, expect, it, jest} from '@jest/globals'

import {type ComposerTarget} from '#/lib/communities/composerTarget'
import {
  type ResolvedComposerTarget,
  resolveTarget,
} from '#/lib/communities/resolveTarget'
import {
  type ComposerWriteAction,
  gateComposerWrite,
  restoreDraftGuarded,
} from '../writeGate'

const members: ComposerTarget = {kind: 'community', id: 'c1', tier: 'members'}
const paid: ComposerTarget = {kind: 'community', id: 'c1', tier: 'paid'}

const membersResolution = resolveTarget({
  communitiesEnabled: true,
  requested: members,
})
const paidResolution = resolveTarget({communitiesEnabled: true, requested: paid})
const profileResolution = resolveTarget({communitiesEnabled: false})
const unresolved = resolveTarget({
  communitiesEnabled: true,
  parent: {uri: 'cpost_unknown'},
})
const publicResolution = resolveTarget({
  communitiesEnabled: true,
  requested: {kind: 'community', id: 'c1', tier: 'public'},
})

/**
 * Every PDS write the composer can reach, as mocks on a fake agent. The
 * harness below calls them exactly where the Composer does, behind the gate.
 */
function makePdsMocks() {
  return {
    uploadBlob: jest.fn(),
    uploadVideo: jest.fn(),
    createRecord: jest.fn(),
    putRecord: jest.fn(),
    applyWrites: jest.fn(),
    createDraft: jest.fn(),
    updateDraft: jest.fn(),
  }
}
type PdsMocks = ReturnType<typeof makePdsMocks>

function expectNoPdsWrites(mocks: PdsMocks) {
  for (const [name, fn] of Object.entries(mocks)) {
    expect([name, fn.mock.calls.length]).toEqual([name, 0])
  }
}

/**
 * The Composer's write paths, reduced to what reaches the PDS. Each one asks
 * the gate first, as Composer.tsx does.
 */
function composerHarness(resolution: ResolvedComposerTarget, pds: PdsMocks) {
  // processVideo -> bsky video service -> blob lands in the PDS.
  const processVideo = jest.fn((_asset: string) => {
    pds.uploadVideo()
  })
  const restoreVideo = jest.fn((_postId: string, video: {uri: string}) => {
    if (!gateComposerWrite(resolution, {kind: 'restore-draft'}).allowed) return
    processVideo(video.uri)
  })
  const dispatchRestore = jest.fn()
  const onRefused = jest.fn()
  return {
    processVideo,
    restoreVideo,
    dispatchRestore,
    onRefused,
    selectDraftWithVideo: () =>
      restoreDraftGuarded({
        resolution,
        onRefused,
        load: () =>
          Promise.resolve({
            posts: [{id: 'p1'}, {id: 'p2'}],
            restoredVideos: new Map([[1, {uri: 'file:///draft-video.mp4'}]]),
          }),
        apply: dispatchRestore,
        restoreVideo,
      }),
    selectVideo: () => {
      if (!gateComposerWrite(resolution, {kind: 'select-video'}).allowed) {
        return false
      }
      processVideo('file:///picked.mp4')
      return true
    },
    saveDraft: () => {
      if (!gateComposerWrite(resolution, {kind: 'save-draft'}).allowed) {
        return false
      }
      pds.createDraft()
      return true
    },
    publish: (opts: {postAs: boolean; authorityVideo: boolean}) => {
      const gate = gateComposerWrite(resolution, {kind: 'publish', ...opts})
      if (!gate.allowed) return gate
      if (gate.route === 'pds') {
        if (opts.authorityVideo) pds.uploadBlob()
        if (!opts.postAs) pds.applyWrites()
      }
      return gate
    },
  }
}

describe('gateComposerWrite', () => {
  const nonPublish: ComposerWriteAction[] = [
    {kind: 'select-video'},
    {kind: 'restore-draft'},
    {kind: 'save-draft'},
  ]
  const publishes: ComposerWriteAction[] = [
    {kind: 'publish', postAs: false, authorityVideo: false},
    {kind: 'publish', postAs: true, authorityVideo: false},
    {kind: 'publish', postAs: false, authorityVideo: true},
    {kind: 'publish', postAs: true, authorityVideo: true},
  ]

  it.each([
    ['members', membersResolution],
    ['paid', paidResolution],
  ])('%s: every PDS write path is refused', (_name, resolution) => {
    for (const action of [...nonPublish, ...publishes.slice(1)]) {
      expect(gateComposerWrite(resolution, action)).toEqual({
        allowed: false,
        refusal: {code: 'members-write-not-available'},
      })
    }
  })

  it.each([
    ['members', membersResolution],
    ['paid', paidResolution],
  ])('%s: a plain publish goes to the communities route', (_n, resolution) => {
    expect(gateComposerWrite(resolution, publishes[0])).toEqual({
      allowed: true,
      route: 'communities',
    })
  })

  it('an unresolved target refuses every action', () => {
    for (const action of [...nonPublish, ...publishes]) {
      expect(gateComposerWrite(unresolved, action)).toEqual({
        allowed: false,
        refusal: {code: 'unresolved-target', error: 'unknown-parent-target'},
      })
    }
  })

  it('a public community target refuses every action', () => {
    for (const action of [...nonPublish, ...publishes]) {
      expect(gateComposerWrite(publicResolution, action)).toEqual({
        allowed: false,
        refusal: {
          code: 'unresolved-target',
          error: 'public-community-not-available',
        },
      })
    }
  })

  it('the PDS guard allows a public community target; resolveTarget is what refuses it', () => {
    // resolveTarget never produces this resolution (it refuses public with
    // public-community-not-available), so this is the guard on its own.
    const forged: ResolvedComposerTarget = {
      ok: true,
      target: {kind: 'community', id: 'c1', tier: 'public'},
      route: 'pds',
      locked: false,
    }
    expect(gateComposerWrite(forged, {kind: 'save-draft'})).toEqual({
      allowed: true,
      route: 'pds',
    })
  })

  it('profile: every action is allowed on the PDS route (control)', () => {
    for (const action of [...nonPublish, ...publishes]) {
      expect(gateComposerWrite(profileResolution, action)).toEqual({
        allowed: true,
        route: 'pds',
      })
    }
  })
})

describe('Composer write paths behind the gate', () => {
  let pds: PdsMocks
  beforeEach(() => {
    pds = makePdsMocks()
  })

  it.each([
    ['members target', membersResolution],
    ['paid target', paidResolution],
    ['unresolved target', unresolved],
  ])(
    '%s: restoring a draft with a video calls neither processVideo nor uploadVideo',
    async (_name, resolution) => {
      const h = composerHarness(resolution, pds)
      await expect(h.selectDraftWithVideo()).resolves.toBe(false)
      expect(h.onRefused).toHaveBeenCalledTimes(1)
      expect(h.dispatchRestore).not.toHaveBeenCalled()
      expect(h.restoreVideo).not.toHaveBeenCalled()
      expect(h.processVideo).not.toHaveBeenCalled()
      expectNoPdsWrites(pds)
    },
  )

  it('restoreVideo stays guarded on its own (members)', () => {
    const h = composerHarness(membersResolution, pds)
    h.restoreVideo('p1', {uri: 'file:///v.mp4'})
    expect(h.processVideo).not.toHaveBeenCalled()
    expectNoPdsWrites(pds)
  })

  it.each([
    ['members target', membersResolution],
    ['unresolved target', unresolved],
  ])(
    '%s: select video, save draft, post-as and authority video reach no PDS write',
    (_name, resolution) => {
      const h = composerHarness(resolution, pds)
      expect(h.selectVideo()).toBe(false)
      expect(h.saveDraft()).toBe(false)
      expect(h.publish({postAs: true, authorityVideo: false}).allowed).toBe(
        false,
      )
      expect(h.publish({postAs: false, authorityVideo: true}).allowed).toBe(
        false,
      )
      expect(h.publish({postAs: true, authorityVideo: true}).allowed).toBe(
        false,
      )
      expect(h.processVideo).not.toHaveBeenCalled()
      expectNoPdsWrites(pds)
    },
  )

  it('profile target: the same paths do reach the PDS (control)', async () => {
    const h = composerHarness(profileResolution, pds)
    await expect(h.selectDraftWithVideo()).resolves.toBe(true)
    expect(h.dispatchRestore).toHaveBeenCalledTimes(1)
    expect(h.restoreVideo).toHaveBeenCalledWith('p2', {
      uri: 'file:///draft-video.mp4',
    })
    expect(h.processVideo).toHaveBeenCalledTimes(1)
    expect(pds.uploadVideo).toHaveBeenCalledTimes(1)
    expect(h.saveDraft()).toBe(true)
    expect(pds.createDraft).toHaveBeenCalledTimes(1)
  })
})
