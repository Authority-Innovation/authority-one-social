import {type BskyAgent, RichText} from '@atproto/api'
import {beforeEach, describe, expect, it, jest} from '@jest/globals'

import {type ComposerTarget} from '#/lib/communities/composerTarget'
import {type ThreadDraft} from '#/view/com/composer/state/composer'

// Same leaf stubs as src/lib/api/__tests__/post.videoEmbed.test.ts: apilib
// transitively pulls native modules that do not load under jest-expo.
jest.mock('#/state/gallery', () => ({
  compressImage: jest.fn(() =>
    Promise.resolve({
      path: 'file:///tmp/img.bin',
      width: 10,
      height: 10,
      mime: 'image/jpeg',
    }),
  ),
}))
jest.mock('../../../../../../modules/bottom-sheet', () => ({
  BottomSheet: () => null,
  BottomSheetSnapPoint: {Hidden: 0, Partial: 1, Full: 2},
}))
jest.mock(
  '@ipld/dag-cbor',
  () => ({
    encode: (o: unknown) => new TextEncoder().encode(JSON.stringify(o ?? {})),
  }),
  {virtual: true},
)
jest.mock('multiformats/cid', () => ({
  CID: {createV1: () => ({toString: () => 'bafyfakecid'})},
}))
// Route the file-reading uploadBlob helper straight to the agent, so an image
// upload shows up as a call on the mocked agent's uploadBlob.
jest.mock('#/lib/api/upload-blob', () => ({
  uploadBlob: (
    agent: {uploadBlob: (i: unknown, o: unknown) => unknown},
    input: unknown,
    encoding?: string,
  ) => agent.uploadBlob(input, {encoding}),
}))

import {submitComposerThread} from '../submit'

const DID = 'did:plc:composerguardtest'

function makeThread(
  text: string,
  {withImage = false}: {withImage?: boolean} = {},
): ThreadDraft {
  return {
    posts: [
      {
        id: 'p1',
        richtext: new RichText({text}),
        labels: [],
        embed: {
          quote: undefined,
          media: withImage
            ? {
                type: 'images',
                images: [
                  {
                    alt: 'an image',
                    source: {
                      id: 'img1',
                      path: 'file:///tmp/img.jpg',
                      width: 10,
                      height: 10,
                      mime: 'image/jpeg',
                    },
                  },
                ],
              }
            : undefined,
          link: undefined,
        },
        shortenedGraphemeLength: text.length,
      },
    ],
    postgate: {
      $type: 'app.bsky.feed.postgate',
      createdAt: '',
      post: '',
      embeddingRules: [],
      detachedEmbeddingUris: [],
    },
    threadgate: [{type: 'everybody'}] as ThreadDraft['threadgate'],
  }
}

function makeAgent() {
  const blob = {
    $type: 'blob',
    ref: {$link: 'bafyimage'},
    mimeType: 'image/jpeg',
    size: 1,
  }
  const repo = {
    applyWrites: jest.fn((_arg: unknown) => Promise.resolve({})),
    createRecord: jest.fn((_arg: unknown) =>
      Promise.resolve({data: {uri: '', cid: ''}}),
    ),
    putRecord: jest.fn((_arg: unknown) =>
      Promise.resolve({data: {uri: '', cid: ''}}),
    ),
    uploadBlob: jest.fn((_i: unknown, _o?: unknown) =>
      Promise.resolve({data: {blob}}),
    ),
  }
  const uploadBlob = jest.fn((_i: unknown, _o?: unknown) =>
    Promise.resolve({data: {blob}}),
  )
  const draft = {
    createDraft: jest.fn((_arg: unknown) => Promise.resolve({data: {}})),
    updateDraft: jest.fn((_arg: unknown) => Promise.resolve({data: {}})),
  }
  const agent = {
    assertDid: DID,
    uploadBlob,
    com: {atproto: {repo}},
    app: {bsky: {draft}},
  } as unknown as BskyAgent
  return {agent, repo, uploadBlob, draft}
}

function expectNoPdsWrites(mocks: ReturnType<typeof makeAgent>) {
  expect(mocks.repo.createRecord).not.toHaveBeenCalled()
  expect(mocks.repo.putRecord).not.toHaveBeenCalled()
  expect(mocks.repo.uploadBlob).not.toHaveBeenCalled()
  expect(mocks.uploadBlob).not.toHaveBeenCalled()
  expect(mocks.repo.applyWrites).not.toHaveBeenCalled()
  expect(mocks.draft.createDraft).not.toHaveBeenCalled()
  expect(mocks.draft.updateDraft).not.toHaveBeenCalled()
}

const queryClient = {} as never

describe('submitComposerThread', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('profile target (base behaviour, unchanged)', () => {
    it.each<[string, ComposerTarget | undefined]>([
      ['explicit profile target', {kind: 'profile'}],
      ['no target (default)', undefined],
    ])(
      '%s: writes the post to the session repo exactly as before',
      async (_name, target) => {
        const mocks = makeAgent()
        const res = await submitComposerThread(mocks.agent, queryClient, {
          target,
          thread: makeThread('hello world'),
          langs: ['en'],
        })

        expect(res.ok).toBe(true)
        // The base composer publishes through a single applyWrites batch (it
        // has never used createRecord/putRecord for posts).
        expect(mocks.repo.applyWrites).toHaveBeenCalledTimes(1)
        expect(mocks.repo.createRecord).not.toHaveBeenCalled()
        expect(mocks.repo.putRecord).not.toHaveBeenCalled()
        const arg = mocks.repo.applyWrites.mock.calls[0][0] as {
          repo: string
          validate: boolean
          writes: {
            $type: string
            collection: string
            rkey: string
            value: {$type: string; text: string; langs: string[]}
          }[]
        }
        expect(arg.repo).toBe(DID)
        expect(arg.validate).toBe(true)
        expect(arg.writes).toHaveLength(1)
        expect(arg.writes[0].$type).toBe('com.atproto.repo.applyWrites#create')
        expect(arg.writes[0].collection).toBe('app.bsky.feed.post')
        expect(arg.writes[0].value.$type).toBe('app.bsky.feed.post')
        expect(arg.writes[0].value.text).toBe('hello world')
        expect(arg.writes[0].value.langs).toEqual(['en'])
        if (res.ok) {
          expect(res.uris).toEqual([
            `at://${DID}/app.bsky.feed.post/${arg.writes[0].rkey}`,
          ])
        }
      },
    )

    it('uploads image blobs to the PDS (control for the members tests)', async () => {
      const mocks = makeAgent()
      const res = await submitComposerThread(mocks.agent, queryClient, {
        target: {kind: 'profile'},
        thread: makeThread('with an image', {withImage: true}),
        langs: ['en'],
      })
      expect(res.ok).toBe(true)
      expect(mocks.uploadBlob).toHaveBeenCalledTimes(1)
      expect(mocks.repo.applyWrites).toHaveBeenCalledTimes(1)
    })
  })

  describe.each<['members' | 'paid']>([['members'], ['paid']])(
    '%s community target',
    tier => {
      const target: ComposerTarget = {kind: 'community', id: 'c1', tier}

      it('makes zero createRecord, putRecord and uploadBlob calls', async () => {
        const mocks = makeAgent()
        const res = await submitComposerThread(mocks.agent, queryClient, {
          target,
          thread: makeThread('members only', {withImage: true}),
          langs: ['en'],
        })

        expect(mocks.repo.createRecord).toHaveBeenCalledTimes(0)
        expect(mocks.repo.putRecord).toHaveBeenCalledTimes(0)
        expect(mocks.repo.uploadBlob).toHaveBeenCalledTimes(0)
        expect(mocks.uploadBlob).toHaveBeenCalledTimes(0)
        expectNoPdsWrites(mocks)
        expect(res).toEqual({
          ok: false,
          refusal: expect.objectContaining({
            allowed: false,
            reason: 'members-write-not-available',
          }),
        })
      })

      it('returns a typed refusal rather than throwing', async () => {
        const mocks = makeAgent()
        await expect(
          submitComposerThread(mocks.agent, queryClient, {
            target,
            thread: makeThread('members only'),
          }),
        ).resolves.toMatchObject({ok: false})
        expectNoPdsWrites(mocks)
      })
    },
  )

  it('public community target is unchanged by the guard', async () => {
    const mocks = makeAgent()
    const res = await submitComposerThread(mocks.agent, queryClient, {
      target: {kind: 'community', id: 'c1', tier: 'public'},
      thread: makeThread('public community post'),
      langs: ['en'],
    })
    expect(res.ok).toBe(true)
    expect(mocks.repo.applyWrites).toHaveBeenCalledTimes(1)
  })
})
