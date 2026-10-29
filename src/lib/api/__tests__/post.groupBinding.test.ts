import {type BskyAgent, RichText} from '@atproto/api'
import {describe, expect, it, jest} from '@jest/globals'
import {sha256} from 'js-sha256'
import {CID} from 'multiformats/cid'
import {create as createDigest} from 'multiformats/hashes/digest'

import {
  type GroupPostBinding,
  GroupPostBindingRefusedError,
  GroupPostCidMismatchError,
} from '#/lib/communities/groupPostBinding'
import {resolveTarget} from '#/lib/communities/resolveTarget'
import {type ThreadDraft} from '#/view/com/composer/state/composer'

// Same leaf stubs as post.videoEmbed.test.ts: apilib/index.ts pulls native
// modules that do not load under jest-expo/ios.
jest.mock('#/state/gallery', () => ({compressImage: jest.fn()}))
jest.mock('../../../../modules/bottom-sheet', () => ({
  BottomSheet: () => null,
  BottomSheetSnapPoint: {Hidden: 0, Partial: 1, Full: 2},
}))
// @ipld/dag-cbor is ESM-only and does not resolve under jest. Encode as JSON
// instead; the CID is still a real CIDv1 over a sha256 of those bytes, so the
// test can recompute it independently (see expectedCid). The real DAG-CBOR
// equality against a PDS is the integration test this file does not cover.
jest.mock(
  '@ipld/dag-cbor',
  () => ({
    encode: (o: unknown) => new TextEncoder().encode(JSON.stringify(o ?? {})),
  }),
  {virtual: true},
)
// The repo-wide __mocks__ stub these out; the CID check needs real CIDs.
jest.mock('multiformats/cid', () => jest.requireActual('multiformats/cid'))
jest.mock('multiformats/hashes/hasher', () =>
  jest.requireActual(
    '../../../../node_modules/multiformats/dist/src/hashes/hasher.js',
  ),
)

import {post} from '../index'

const DID = 'did:plc:author'
const GROUP = {
  uri: 'at://did:plc:owner/com.authorityone.group.profile/self',
  cid: 'bafyreie5737gdxlw5i64vzichcalba3z2v5n6icifvx5xytvske7mr3hpm',
}
const BINDING: GroupPostBinding = {
  target: {kind: 'community', id: 'btb', tier: 'public'},
  group: GROUP,
}

function expectedCid(record: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(record))
  const digest = createDigest(0x12, new Uint8Array(sha256.arrayBuffer(bytes)))
  return CID.createV1(0x71, digest).toString()
}

function makeThread(
  texts: string[],
  threadgate: ThreadDraft['threadgate'] = [{type: 'everybody'}],
): ThreadDraft {
  return {
    posts: texts.map((text, i) => ({
      id: `p${i}`,
      richtext: new RichText({text}),
      labels: [],
      embed: {quote: undefined, media: undefined, link: undefined},
      shortenedGraphemeLength: text.length,
    })),
    postgate: {
      $type: 'app.bsky.feed.postgate',
      createdAt: '',
      post: '',
      embeddingRules: [],
      detachedEmbeddingUris: [],
    },
    threadgate,
  }
}

type Write = {
  $type: string
  collection: string
  rkey: string
  value: Record<string, unknown>
}
type ApplyWritesArg = {repo: string; validate: boolean; writes: Write[]}

/**
 * A PDS stand-in. By default it returns, for each create, the URI and the CID
 * it "stored": for a post that is the CID of the record bytes, computed the
 * same way the client does. `tamper` lets a test make it return another CID.
 */
function makeAgent({
  results = 'echo',
}: {results?: 'echo' | 'tamper' | 'none'} = {}) {
  const applyWrites = jest.fn((arg: ApplyWritesArg) => {
    if (results === 'none') return Promise.resolve({data: {}})
    const out = arg.writes.map(w => ({
      $type: 'com.atproto.repo.applyWrites#createResult',
      uri: `at://${DID}/${w.collection}/${w.rkey}`,
      cid:
        results === 'tamper' && w.collection === 'app.bsky.feed.post'
          ? GROUP.cid
          : expectedCid(w.value),
    }))
    return Promise.resolve({data: {results: out}})
  })
  const createRecord = jest.fn()
  const deleteRecord = jest.fn()
  const getPosts = jest.fn()
  const agent = {
    assertDid: DID,
    com: {atproto: {repo: {applyWrites, createRecord, deleteRecord}}},
    app: {bsky: {feed: {getPosts}}},
  } as unknown as BskyAgent
  return {agent, applyWrites, createRecord, deleteRecord, getPosts}
}

function callArg(applyWrites: ReturnType<typeof makeAgent>['applyWrites']) {
  return applyWrites.mock.calls[0][0]
}

describe('apilib.post with a group binding (public community)', () => {
  it('writes the binding in the same applyWrites as the post: same rkey, computed CID', async () => {
    const {agent, applyWrites, createRecord} = makeAgent()
    const {uris} = await post(agent, {} as never, {
      thread: makeThread(['hello community']),
      binding: BINDING,
    })

    expect(applyWrites).toHaveBeenCalledTimes(1)
    expect(createRecord).not.toHaveBeenCalled()
    const arg = callArg(applyWrites)
    expect(arg.repo).toBe(DID)
    // OPEN Q7 default (a): validate:false, client-side validation instead.
    expect(arg.validate).toBe(false)

    expect(arg.writes.map(w => w.collection)).toEqual([
      'app.bsky.feed.post',
      'com.authorityone.group.post',
    ])
    const [postWrite, bindingWrite] = arg.writes
    expect(bindingWrite.rkey).toBe(postWrite.rkey)
    expect(bindingWrite.value).toEqual({
      $type: 'com.authorityone.group.post',
      subject: {uri: uris[0], cid: expectedCid(postWrite.value)},
      group: GROUP,
      createdAt: postWrite.value.createdAt,
    })
    expect(uris[0]).toBe(`at://${DID}/app.bsky.feed.post/${postWrite.rkey}`)
  })

  it('binds every post of a thread in the one batch, alongside the threadgate', async () => {
    const {agent, applyWrites} = makeAgent()
    const {uris} = await post(agent, {} as never, {
      thread: makeThread(['one', 'two', 'three'], [{type: 'mention'}]),
      binding: BINDING,
    })

    expect(applyWrites).toHaveBeenCalledTimes(1)
    const {writes} = callArg(applyWrites)
    const posts = writes.filter(w => w.collection === 'app.bsky.feed.post')
    const bindings = writes.filter(
      w => w.collection === 'com.authorityone.group.post',
    )
    expect(writes.some(w => w.collection === 'app.bsky.feed.threadgate')).toBe(
      true,
    )
    expect(posts).toHaveLength(3)
    expect(bindings).toHaveLength(3)
    for (let i = 0; i < posts.length; i++) {
      const cid = expectedCid(posts[i].value)
      expect(bindings[i].rkey).toBe(posts[i].rkey)
      expect(bindings[i].value.subject).toEqual({uri: uris[i], cid})
      expect(bindings[i].value.group).toEqual(GROUP)
      // The CID pinned in the binding is the one the next post replies to.
      if (i + 1 < posts.length) {
        expect((posts[i + 1].value.reply as {parent: unknown}).parent).toEqual({
          uri: uris[i],
          cid,
        })
      }
    }
  })

  it('fails the post when the PDS returns a different CID than the computed one', async () => {
    const {agent, applyWrites, deleteRecord, createRecord} = makeAgent({
      results: 'tamper',
    })
    let thrown: unknown
    try {
      await post(agent, {} as never, {
        thread: makeThread(['mismatch']),
        binding: BINDING,
      })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(GroupPostCidMismatchError)
    const {writes} = callArg(applyWrites)
    expect((thrown as GroupPostCidMismatchError).mismatches).toEqual([
      {
        uri: `at://${DID}/app.bsky.feed.post/${writes[0].rkey}`,
        computed: expectedCid(writes[0].value),
        returned: GROUP.cid,
      },
    ])
    // OPEN Q6 / D3: no compensating action is built.
    expect(applyWrites).toHaveBeenCalledTimes(1)
    expect(deleteRecord).not.toHaveBeenCalled()
    expect(createRecord).not.toHaveBeenCalled()
  })

  it('fails the post when the PDS returns no results to check the CID against', async () => {
    const {agent} = makeAgent({results: 'none'})
    await expect(
      post(agent, {} as never, {
        thread: makeThread(['no results']),
        binding: BINDING,
      }),
    ).rejects.toBeInstanceOf(GroupPostCidMismatchError)
  })

  it.each<[string, unknown]>([
    [
      'members',
      {target: {kind: 'community', id: 'btb', tier: 'members'}, group: GROUP},
    ],
    [
      'paid',
      {target: {kind: 'community', id: 'btb', tier: 'paid'}, group: GROUP},
    ],
    ['profile', {target: {kind: 'profile'}, group: GROUP}],
    ['no group', {target: BINDING.target}],
    [
      'group that is not a group profile',
      {target: BINDING.target, group: {uri: `at://${DID}/x.y/z`, cid: 'x'}},
    ],
    [
      'group with no cid',
      {target: BINDING.target, group: {uri: GROUP.uri, cid: ''}},
    ],
    ['null', null],
  ])(
    '%s binding: refused before any network call or PDS write',
    async (_name, binding) => {
      const {agent, applyWrites, createRecord, getPosts} = makeAgent()
      await expect(
        post(agent, {} as never, {
          thread: makeThread(['should not be written']),
          replyTo: `at://${DID}/app.bsky.feed.post/parent`,
          binding: binding as GroupPostBinding,
        }),
      ).rejects.toBeInstanceOf(GroupPostBindingRefusedError)
      expect(getPosts).not.toHaveBeenCalled()
      expect(applyWrites).not.toHaveBeenCalled()
      expect(createRecord).not.toHaveBeenCalled()
    },
  )

  it('refuses a bound post with the runtime video embed, before any write', async () => {
    const {agent, applyWrites} = makeAgent()
    await expect(
      post(agent, {} as never, {
        thread: makeThread(['video']),
        binding: BINDING,
        videoEmbed: {
          $type: 'app.bsky.embed.video',
        } as unknown as Parameters<typeof post>[2]['videoEmbed'],
      }),
    ).rejects.toThrow()
    expect(applyWrites).not.toHaveBeenCalled()
  })

  it('refuses to send a batch that fails client-side lexicon validation', async () => {
    const {agent, applyWrites} = makeAgent()
    await expect(
      post(agent, {} as never, {
        // app.bsky.feed.post text maxLength is 3000 bytes.
        thread: makeThread(['x'.repeat(3001)]),
        binding: BINDING,
      }),
    ).rejects.toThrow(/failed validation \(app\.bsky\.feed\.post\)/)
    expect(applyWrites).not.toHaveBeenCalled()
  })

  it('an unbound post is unchanged: no binding write, strict validation', async () => {
    const {agent, applyWrites} = makeAgent()
    await post(agent, {} as never, {thread: makeThread(['plain'])})
    const arg = callArg(applyWrites)
    expect(arg.validate).toBe(true)
    expect(arg.writes.map(w => w.collection)).toEqual(['app.bsky.feed.post'])
  })

  it('the resolver still refuses public, so the composer cannot reach this path', () => {
    for (const requested of [
      BINDING.target,
      {kind: 'community', id: 'other', tier: 'public'} as const,
    ]) {
      expect(resolveTarget({communitiesEnabled: true, requested})).toEqual({
        ok: false,
        error: {code: 'public-community-not-available'},
      })
    }
    expect(
      resolveTarget({
        communitiesEnabled: true,
        lockedCommunityId: 'btb',
        lockedCommunityTier: 'public',
      }),
    ).toEqual({ok: false, error: {code: 'public-community-not-available'}})
  })
})
