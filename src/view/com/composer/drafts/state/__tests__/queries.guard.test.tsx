/**
 * The composer's server-side draft paths (save new, save existing, delete from
 * the drafts list, cleanup after publish) refuse a members/paid community
 * target before any PDS call. These are the hooks the Composer save paths
 * (handleSaveDraft, saveCurrentDraft) and DraftsListDialog actually use, so
 * the assertions hold even if a UI-level early return is removed.
 */
import {type AppBskyDraftDefs} from '@atproto/api'
import {beforeEach, describe, expect, it, jest} from '@jest/globals'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {renderHook} from '@testing-library/react-native'

const mockAgent = {
  uploadBlob: jest.fn(),
  app: {
    bsky: {
      draft: {
        createDraft: jest.fn(() => Promise.resolve({data: {id: 'new-draft'}})),
        updateDraft: jest.fn(() => Promise.resolve({data: {}})),
        deleteDraft: jest.fn(() => Promise.resolve({data: {}})),
        getDrafts: jest.fn(),
      },
      video: {uploadVideo: jest.fn()},
    },
  },
  com: {
    atproto: {
      repo: {
        createRecord: jest.fn(),
        putRecord: jest.fn(),
        applyWrites: jest.fn(),
        uploadBlob: jest.fn(),
      },
    },
  },
}

jest.mock('#/state/session', () => ({
  useAgent: () => mockAgent,
}))
jest.mock('#/analytics', () => ({
  useAnalytics: () => ({metric: jest.fn()}),
}))
jest.mock('#/analytics/identifiers', () => ({
  getDeviceId: () => 'device-1',
}))
jest.mock('#/view/com/composer/drafts/state/api', () => ({
  composerStateToDraft: jest.fn(() =>
    Promise.resolve({
      draft: {posts: [{text: 'hello'}]},
      localRefPaths: new Map([['ref-1', 'file:///tmp/a.jpg']]),
    }),
  ),
  draftViewToSummary: jest.fn(),
}))
jest.mock('#/view/com/composer/drafts/state/storage', () => ({
  ensureMediaCachePopulated: jest.fn(),
  mediaExists: jest.fn(() => false),
  saveMediaToLocal: jest.fn(() => Promise.resolve()),
  deleteMediaFromLocal: jest.fn(() => Promise.resolve()),
  loadMediaFromLocal: jest.fn(),
}))
jest.mock('#/view/com/composer/drafts/state/logger', () => ({
  logger: {debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn()},
}))

import {
  ComposerPdsWriteRefusedError,
  type ComposerTarget,
} from '#/lib/communities/composerTarget'
import {
  useCleanupPublishedDraftMutation,
  useDeleteDraftMutation,
  useSaveDraftMutation,
} from '#/view/com/composer/drafts/state/queries'
import * as storage from '#/view/com/composer/drafts/state/storage'
import {type ComposerState} from '#/view/com/composer/state/composer'

const composerState = {
  originalLocalRefs: new Set(['old-ref']),
} as unknown as ComposerState

const draft = {
  posts: [{text: 'hello', embedImages: [{localRef: {path: 'img-1'}}]}],
} as unknown as AppBskyDraftDefs.Draft

function allPdsWriteMocks() {
  return [
    mockAgent.uploadBlob,
    mockAgent.app.bsky.draft.createDraft,
    mockAgent.app.bsky.draft.updateDraft,
    mockAgent.app.bsky.draft.deleteDraft,
    mockAgent.app.bsky.video.uploadVideo,
    mockAgent.com.atproto.repo.createRecord,
    mockAgent.com.atproto.repo.putRecord,
    mockAgent.com.atproto.repo.applyWrites,
    mockAgent.com.atproto.repo.uploadBlob,
  ]
}

function render<T>(hook: () => T) {
  const qc = new QueryClient({
    defaultOptions: {queries: {retry: false}, mutations: {retry: false}},
  })
  const wrapper = ({children}: {children: React.ReactNode}) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return renderHook(hook, {wrapper}).result
}

// A public target is refused too: the bound applyWrites is the only public
// PDS write, and a draft carries no binding (design doc section 5 item 3 is
// still open on whether public drafts should be allowed).
const REFUSED: [string, ComposerTarget][] = [
  ['members', {kind: 'community', id: 'c1', tier: 'members'}],
  ['paid', {kind: 'community', id: 'c1', tier: 'paid'}],
  ['public community', {kind: 'community', id: 'c1', tier: 'public'}],
]

const ALLOWED: [string, ComposerTarget][] = [['profile', {kind: 'profile'}]]

beforeEach(() => {
  jest.clearAllMocks()
})

describe.each(REFUSED)('a %s target makes zero PDS writes', (_name, target) => {
  async function expectRefused(promise: Promise<unknown>, write: string) {
    await expect(promise).rejects.toBeInstanceOf(ComposerPdsWriteRefusedError)
    await expect(promise).rejects.toMatchObject({write})
    for (const fn of allPdsWriteMocks()) {
      expect(fn).not.toHaveBeenCalled()
    }
    // onSuccess never ran, so no local media was touched either
    expect(storage.saveMediaToLocal).not.toHaveBeenCalled()
    expect(storage.deleteMediaFromLocal).not.toHaveBeenCalled()
  }

  it('save draft (new) -> no createDraft', async () => {
    const result = render(() => useSaveDraftMutation({target}))
    await expectRefused(
      result.current.mutateAsync({composerState}),
      'app.bsky.draft.createDraft',
    )
  })

  it('save draft (existing) -> no updateDraft', async () => {
    const result = render(() => useSaveDraftMutation({target}))
    await expectRefused(
      result.current.mutateAsync({composerState, existingDraftId: 'd1'}),
      'app.bsky.draft.updateDraft',
    )
  })

  it('delete draft from the drafts list -> no deleteDraft', async () => {
    const result = render(() => useDeleteDraftMutation({target}))
    await expectRefused(
      result.current.mutateAsync({draftId: 'd1', draft}),
      'app.bsky.draft.deleteDraft',
    )
  })

  it('cleanup after publish -> no deleteDraft', async () => {
    const result = render(() => useCleanupPublishedDraftMutation({target}))
    await expectRefused(
      result.current.mutateAsync({
        draftId: 'd1',
        originalLocalRefs: new Set(['img-1']),
      }),
      'app.bsky.draft.deleteDraft',
    )
  })
})

describe.each(ALLOWED)('a %s target is unchanged', (_name, target) => {
  it('save draft (new) calls createDraft', async () => {
    const result = render(() => useSaveDraftMutation({target}))
    await expect(result.current.mutateAsync({composerState})).resolves.toEqual(
      expect.objectContaining({draftId: 'new-draft'}),
    )
    expect(mockAgent.app.bsky.draft.createDraft).toHaveBeenCalledTimes(1)
    expect(mockAgent.app.bsky.draft.updateDraft).not.toHaveBeenCalled()
  })

  it('save draft (existing) calls updateDraft', async () => {
    const result = render(() => useSaveDraftMutation({target}))
    await result.current.mutateAsync({composerState, existingDraftId: 'd1'})
    expect(mockAgent.app.bsky.draft.updateDraft).toHaveBeenCalledTimes(1)
    expect(mockAgent.app.bsky.draft.createDraft).not.toHaveBeenCalled()
  })

  it('delete draft calls deleteDraft', async () => {
    const result = render(() => useDeleteDraftMutation({target}))
    await result.current.mutateAsync({draftId: 'd1', draft})
    expect(mockAgent.app.bsky.draft.deleteDraft).toHaveBeenCalledWith({
      id: 'd1',
    })
  })

  it('cleanup after publish calls deleteDraft', async () => {
    const result = render(() => useCleanupPublishedDraftMutation({target}))
    await result.current.mutateAsync({
      draftId: 'd1',
      originalLocalRefs: new Set(['img-1']),
    })
    expect(mockAgent.app.bsky.draft.deleteDraft).toHaveBeenCalledWith({
      id: 'd1',
    })
  })
})
