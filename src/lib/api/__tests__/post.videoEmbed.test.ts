import {type BskyAgent, RichText} from '@atproto/api'
import {describe, expect, it, jest} from '@jest/globals'

import {type ThreadDraft} from '#/view/com/composer/state/composer'

// apilib/index.ts transitively pulls the native media picker + the bottom-sheet
// component, whose module-level code reads Platform.Version (undefined under
// jest-expo/ios). Stub both leaves so this pure record-shape test can load apilib.
jest.mock('#/state/gallery', () => ({compressImage: jest.fn()}))
jest.mock('../../../../modules/bottom-sheet', () => ({
  BottomSheet: () => null,
  BottomSheetSnapPoint: {Hidden: 0, Partial: 1, Full: 2},
}))
// @ipld/dag-cbor is ESM-only and doesn't resolve under jest-expo/ios (like
// multiformats, which needs a moduleNameMapper entry). It's used only to compute
// inter-post reply CIDs, which is irrelevant to the write shape under test.
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

import {post} from '../index'

/**
 * The identity core of the "human posts video as themselves" fix: apilib.post,
 * given a caller-supplied `videoEmbed`, writes the post to the CALLER's OWN repo
 * (agent.assertDid) with the embed verbatim and validation relaxed for the custom
 * onePlayback field. A normal post is unchanged (strict validation, resolved embed).
 */

function makeThread(text: string): ThreadDraft {
  return {
    posts: [
      {
        id: 'p1',
        richtext: new RichText({text}),
        labels: [],
        embed: {quote: undefined, media: undefined, link: undefined},
        shortenedGraphemeLength: text.length,
      },
    ],
    // everybody + no embedding rules => no threadgate/postgate writes (single write).
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
  const applyWrites = jest.fn((_arg: unknown) => Promise.resolve({}))
  const agent = {
    assertDid: 'did:plc:jimmy',
    com: {atproto: {repo: {applyWrites}}},
  } as unknown as BskyAgent
  return {agent, applyWrites}
}

const videoEmbed = {
  $type: 'app.bsky.embed.video' as const,
  video: {$type: 'blob', ref: {$link: 'bafyvideo'}, mimeType: 'video/mp4', size: 3},
  aspectRatio: {width: 1920, height: 1080},
  onePlayback: {uid: 'u1', playlist: 'https://cf/x.m3u8', thumbnail: null},
} as unknown as Parameters<typeof post>[2]['videoEmbed']

describe('apilib.post videoEmbed (human posts as self)', () => {
  it("writes the video post to the caller's OWN repo, embed verbatim, validate:false", async () => {
    const {agent, applyWrites} = makeAgent()
    const {uris} = await post(agent, {} as never, {
      thread: makeThread('a video post'),
      langs: ['en'],
      videoEmbed,
    })
    expect(applyWrites).toHaveBeenCalledTimes(1)
    const arg = applyWrites.mock.calls[0][0] as {
      repo: string
      validate: boolean
      writes: {value: {embed: {onePlayback?: {uid: string}}}}[]
    }
    // identity: the human's own DID, never an agent's repo
    expect(arg.repo).toBe('did:plc:jimmy')
    // custom onePlayback field would fail strict lexicon validation
    expect(arg.validate).toBe(false)
    const record = arg.writes[0].value
    expect(record.embed).toBe(videoEmbed)
    expect(record.embed.onePlayback?.uid).toBe('u1')
    expect(uris[0]).toContain('at://did:plc:jimmy/app.bsky.feed.post/')
  })

  it('a normal post (no videoEmbed) stays strictly validated with no injected embed', async () => {
    const {agent, applyWrites} = makeAgent()
    await post(agent, {} as never, {thread: makeThread('hello world'), langs: ['en']})
    const arg = applyWrites.mock.calls[0][0] as {
      validate: boolean
      writes: {value: {embed?: unknown}}[]
    }
    expect(arg.validate).toBe(true)
    expect(arg.writes[0].value.embed).toBeUndefined()
  })
})
