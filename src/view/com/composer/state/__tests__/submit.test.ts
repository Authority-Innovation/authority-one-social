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
// The communities runtime client is the only members/paid write path. Mocked
// so the tests can see exactly what reaches it (and that nothing else does).
jest.mock('#/lib/agent-runtime/communitiesClient', () => ({
  post: jest.fn(),
  reply: jest.fn(),
}))

import * as communitiesClient from '#/lib/agent-runtime/communitiesClient'
import {resolveTarget} from '#/lib/communities/resolveTarget'
import {submitComposerThread} from '../submit'

const mockPost = communitiesClient.post as jest.MockedFunction<
  typeof communitiesClient.post
>
const mockReply = communitiesClient.reply as jest.MockedFunction<
  typeof communitiesClient.reply
>

const DID = 'did:plc:composerguardtest'

function communityPost(id: string, body: string, parentId?: string) {
  return {
    ok: true as const,
    data: {
      id,
      author: {displayName: 'Me', is_agent: false},
      body,
      parentId: parentId ?? null,
      createdAt: '2026-10-28T00:00:00.000Z',
    },
  }
}

function makeThread(
  text: string,
  {
    withImage = false,
    extraPosts = [],
  }: {withImage?: boolean; extraPosts?: string[]} = {},
): ThreadDraft {
  return {
    posts: [text, ...extraPosts].map((t, i) => ({
      id: `p${i + 1}`,
      richtext: new RichText({text: t}),
      labels: [],
      embed: {
        quote: undefined,
        media:
          withImage && i === 0
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
      shortenedGraphemeLength: t.length,
    })),
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
    app: {
      bsky: {
        draft,
        feed: {
          getPosts: jest.fn(({uris}: {uris: string[]}) =>
            Promise.resolve({
              data: {posts: uris.map(uri => ({uri, cid: 'bafyparent'}))},
            }),
          ),
        },
      },
    },
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
    mockPost.mockImplementation((_id, body) =>
      Promise.resolve(communityPost('cpost_new', body)),
    )
    mockReply.mockImplementation((_id, parent, body) =>
      Promise.resolve(communityPost(`reply_to_${parent}`, body, parent)),
    )
  })

  describe('profile target (base behaviour, unchanged)', () => {
    it.each<[string, ComposerTarget | undefined]>([
      ['explicit profile target', {kind: 'profile'}],
      ['no target (the default profile)', undefined],
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
        expect(res).toEqual({
          ok: true,
          route: 'pds',
          uris: [`at://${DID}/app.bsky.feed.post/${arg.writes[0].rkey}`],
        })
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

    it('never touches the communities client', async () => {
      const mocks = makeAgent()
      await submitComposerThread(mocks.agent, queryClient, {
        target: {kind: 'profile'},
        thread: makeThread('hello'),
      })
      expect(mockPost).not.toHaveBeenCalled()
      expect(mockReply).not.toHaveBeenCalled()
    })
  })

  describe.each<['members' | 'paid']>([['members'], ['paid']])(
    '%s community target',
    tier => {
      const target: ComposerTarget = {kind: 'community', id: 'c1', tier}

      it('goes through communitiesClient.post with zero PDS writes', async () => {
        const mocks = makeAgent()
        const res = await submitComposerThread(mocks.agent, queryClient, {
          target,
          thread: makeThread('members only'),
          langs: ['en'],
        })

        expect(mockPost).toHaveBeenCalledTimes(1)
        expect(mockPost).toHaveBeenCalledWith('c1', 'members only')
        expect(mockReply).not.toHaveBeenCalled()
        expect(mocks.repo.createRecord).toHaveBeenCalledTimes(0)
        expect(mocks.repo.putRecord).toHaveBeenCalledTimes(0)
        expect(mocks.repo.uploadBlob).toHaveBeenCalledTimes(0)
        expect(mocks.uploadBlob).toHaveBeenCalledTimes(0)
        expectNoPdsWrites(mocks)
        expect(res).toMatchObject({
          ok: true,
          route: 'communities',
          posts: [{id: 'cpost_new', body: 'members only'}],
        })
      })

      it('refuses media up front: no client call, no upload', async () => {
        const mocks = makeAgent()
        const res = await submitComposerThread(mocks.agent, queryClient, {
          target,
          thread: makeThread('members only', {withImage: true}),
          langs: ['en'],
        })
        expect(res).toEqual({
          ok: false,
          communityError: {kind: 'unsupported-content'},
        })
        expect(mockPost).not.toHaveBeenCalled()
        expectNoPdsWrites(mocks)
      })

      it('posts a thread as a reply chain through the client', async () => {
        const mocks = makeAgent()
        const res = await submitComposerThread(mocks.agent, queryClient, {
          target,
          thread: makeThread('one', {extraPosts: ['two']}),
        })
        expect(res.ok).toBe(true)
        expect(mockPost).toHaveBeenCalledWith('c1', 'one')
        expect(mockReply).toHaveBeenCalledWith('c1', 'cpost_new', 'two')
        expectNoPdsWrites(mocks)
      })

      it('returns a typed client error rather than throwing', async () => {
        const mocks = makeAgent()
        mockPost.mockResolvedValueOnce({
          ok: false,
          error: {kind: 'http', status: 403},
        })
        await expect(
          submitComposerThread(mocks.agent, queryClient, {
            target,
            thread: makeThread('members only'),
          }),
        ).resolves.toEqual({
          ok: false,
          communityError: {kind: 'client', error: {kind: 'http', status: 403}},
        })
        expectNoPdsWrites(mocks)
      })
    },
  )

  it('an unrecognised target is refused by the guard, nothing sent', async () => {
    const mocks = makeAgent()
    const res = await submitComposerThread(mocks.agent, queryClient, {
      target: {kind: 'community', id: 'c1', tier: 'vip'} as never,
      thread: makeThread('nope'),
    })
    expect(res).toMatchObject({
      ok: false,
      refusal: {allowed: false, reason: 'unknown-target'},
    })
    expect(mockPost).not.toHaveBeenCalled()
    expect(mockReply).not.toHaveBeenCalled()
    expectNoPdsWrites(mocks)
  })

  it('an unresolved (null) target is refused, never treated as the profile', async () => {
    const mocks = makeAgent()
    const res = await submitComposerThread(mocks.agent, queryClient, {
      target: null,
      thread: makeThread('unresolved', {withImage: true}),
      langs: ['en'],
    })
    expect(res).toMatchObject({
      ok: false,
      refusal: {allowed: false, reason: 'unknown-target'},
    })
    expect(mockPost).not.toHaveBeenCalled()
    expect(mockReply).not.toHaveBeenCalled()
    expectNoPdsWrites(mocks)
  })

  describe('resolveTarget + submit', () => {
    // The PDS guard allows a public target, but the only PDS publish path
    // writes a plain profile post with no community binding. The resolver is
    // what keeps a public post off the profile: it never resolves a public
    // target, and the composer only submits a resolved target.
    it.each<[string, Parameters<typeof resolveTarget>[0]]>([
      [
        'flag on, explicit public target',
        {
          communitiesEnabled: true,
          requested: {kind: 'community', id: 'c1', tier: 'public'},
        },
      ],
      [
        'flag off, explicit public target',
        {
          communitiesEnabled: false,
          requested: {kind: 'community', id: 'c1', tier: 'public'},
        },
      ],
      [
        'locked build, public tier',
        {
          communitiesEnabled: true,
          lockedCommunityId: 'c1',
          lockedCommunityTier: 'public',
        },
      ],
    ])(
      '%s: never resolves (not to the profile either), so nothing is sent',
      async (_name, context) => {
        const mocks = makeAgent()
        const resolved = resolveTarget(context)
        expect(resolved.ok).toBe(false)
        if (resolved.ok) {
          // Mirrors the composer: only a resolved target is submitted.
          await submitComposerThread(mocks.agent, queryClient, {
            target: resolved.target,
            thread: makeThread('public community post', {withImage: true}),
            langs: ['en'],
          })
        }
        expect(mockPost).not.toHaveBeenCalled()
        expect(mockReply).not.toHaveBeenCalled()
        expectNoPdsWrites(mocks)
      },
    )

    it('a reply inherits a members parent and goes to communitiesClient.reply', async () => {
      const mocks = makeAgent()
      const resolved = resolveTarget({
        communitiesEnabled: true,
        parent: {
          uri: 'cpost_parent',
          target: {kind: 'community', id: 'c1', tier: 'members'},
        },
      })
      expect(resolved).toMatchObject({ok: true, route: 'communities'})
      if (!resolved.ok) return
      const res = await submitComposerThread(mocks.agent, queryClient, {
        target: resolved.target,
        thread: makeThread('a members reply'),
        replyTo: 'cpost_parent',
      })
      expect(res.ok).toBe(true)
      expect(mockReply).toHaveBeenCalledWith(
        'c1',
        'cpost_parent',
        'a members reply',
      )
      expect(mockPost).not.toHaveBeenCalled()
      expectNoPdsWrites(mocks)
    })

    it('flag on: a reply to a PDS post with no known target is refused', () => {
      expect(
        resolveTarget({
          communitiesEnabled: true,
          parent: {uri: 'at://did:plc:parent/app.bsky.feed.post/3kabc'},
        }),
      ).toEqual({ok: false, error: {code: 'unknown-parent-target'}})
    })

    it('a reply to a public community post is refused', () => {
      expect(
        resolveTarget({
          communitiesEnabled: true,
          parent: {
            uri: 'at://did:plc:parent/app.bsky.feed.post/3kabc',
            target: {kind: 'community', id: 'c1', tier: 'public'},
          },
        }),
      ).toEqual({ok: false, error: {code: 'public-community-not-available'}})
    })

    it.each<[string, Parameters<typeof resolveTarget>[0]]>([
      [
        'flag off, no parent target',
        {
          communitiesEnabled: false,
          parent: {uri: 'at://did:plc:parent/app.bsky.feed.post/3kabc'},
        },
      ],
      [
        'flag on, explicit profile parent',
        {
          communitiesEnabled: true,
          parent: {
            uri: 'at://did:plc:parent/app.bsky.feed.post/3kabc',
            target: {kind: 'profile'},
          },
        },
      ],
    ])('a reply to a profile post (%s) stays a profile reply', async (_n, ctx) => {
      const mocks = makeAgent()
      const parentUri = 'at://did:plc:parent/app.bsky.feed.post/3kabc'
      const resolved = resolveTarget(ctx)
      expect(resolved).toMatchObject({ok: true, target: {kind: 'profile'}})
      if (!resolved.ok) return
      const res = await submitComposerThread(mocks.agent, queryClient, {
        target: resolved.target,
        thread: makeThread('a public reply'),
        replyTo: parentUri,
      })
      expect(res).toMatchObject({ok: true, route: 'pds'})
      expect(mocks.repo.applyWrites).toHaveBeenCalledTimes(1)
      const arg = mocks.repo.applyWrites.mock.calls[0][0] as {
        writes: {value: {reply?: {parent: {uri: string}}}}[]
      }
      expect(arg.writes[0].value.reply?.parent.uri).toBe(parentUri)
      expect(mockReply).not.toHaveBeenCalled()
    })

    it('an unknown parent is refused before submit is ever reached', () => {
      expect(
        resolveTarget({communitiesEnabled: true, parent: {uri: 'cpost_x'}}),
      ).toEqual({ok: false, error: {code: 'unknown-parent-target'}})
    })

    it('a locked build posts to the locked community whatever was asked', async () => {
      const mocks = makeAgent()
      const resolved = resolveTarget({
        communitiesEnabled: true,
        requested: {kind: 'profile'},
        lockedCommunityId: 'locked1',
        lockedCommunityTier: 'members',
      })
      expect(resolved).toEqual({
        ok: true,
        target: {kind: 'community', id: 'locked1', tier: 'members'},
        route: 'communities',
        locked: true,
      })
      if (!resolved.ok) return
      await submitComposerThread(mocks.agent, queryClient, {
        target: resolved.target,
        thread: makeThread('pinned'),
      })
      expect(mockPost).toHaveBeenCalledWith('locked1', 'pinned')
      expectNoPdsWrites(mocks)
    })
  })
})
