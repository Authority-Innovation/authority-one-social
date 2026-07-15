// The repo-level manual mock (__mocks__/multiformats/cid.js) stubs CID out;
// this suite exercises real CID parsing and lexicon validation.
jest.unmock('multiformats/cid')

import {AppBskyFeedPost, BlobRef} from '@atproto/api'
import {CID} from 'multiformats/cid'

import * as bsky from '#/types/bsky'
import {normalizeLegacyBlobRefs} from '../normalize-blob-refs'

const CID_STR = 'bafkreid5dk7dfukr6iulfn5nyre5wvrpsmjghmnyxg2w77dhz4p2xxfrmm'

function legacyExternalRecord() {
  // As served by the Authority One AppView for some indexed posts: the blob
  // ref is raw dag-json ({"/": cid}) instead of lexicon JSON ({$link: cid}).
  return {
    $type: 'app.bsky.feed.post',
    text: 'youtu.be/example',
    createdAt: '2026-07-06T11:22:11.476Z',
    embed: {
      $type: 'app.bsky.embed.external',
      external: {
        uri: 'https://youtu.be/example',
        title: 'A video',
        description: 'A description',
        thumb: {
          $type: 'blob',
          ref: {'/': CID_STR},
          mimeType: 'image/jpeg',
          size: 140637,
        },
      },
    },
  }
}

function legacyImagesRecord() {
  return {
    $type: 'app.bsky.feed.post',
    text: 'a photo',
    createdAt: '2026-07-06T11:22:11.476Z',
    embed: {
      $type: 'app.bsky.embed.images',
      images: [
        {
          alt: '',
          image: {
            $type: 'blob',
            ref: {'/': CID_STR},
            mimeType: 'image/jpeg',
            size: 12345,
          },
        },
      ],
    },
  }
}

describe('normalizeLegacyBlobRefs', () => {
  it('records with raw dag-json blob refs fail lexicon validation (the bug)', () => {
    expect(
      bsky.validate(legacyExternalRecord(), AppBskyFeedPost.validateRecord),
    ).toBe(false)
    expect(
      bsky.validate(legacyImagesRecord(), AppBskyFeedPost.validateRecord),
    ).toBe(false)
  })

  it('normalizes raw dag-json blob refs so validation passes', () => {
    const external = normalizeLegacyBlobRefs(legacyExternalRecord())
    expect(external.embed.external.thumb).toBeInstanceOf(BlobRef)
    expect((external.embed.external.thumb as unknown as BlobRef).size).toBe(
      140637,
    )
    expect(bsky.validate(external, AppBskyFeedPost.validateRecord)).toBe(true)

    const images = normalizeLegacyBlobRefs(legacyImagesRecord())
    expect(images.embed.images[0].image).toBeInstanceOf(BlobRef)
    expect(bsky.validate(images, AppBskyFeedPost.validateRecord)).toBe(true)
  })

  it('walks nested feed pages and arrays in place', () => {
    const feed = [{post: {record: legacyImagesRecord()}}]
    normalizeLegacyBlobRefs(feed)
    expect(feed[0].post.record.embed.images[0].image).toBeInstanceOf(BlobRef)
  })

  it('leaves valid records, plain data and existing BlobRefs untouched', () => {
    const blob = new BlobRef(CID.parse(CID_STR), 'image/jpeg', 140637)
    const input = {
      a: 1,
      b: 'text',
      c: null,
      d: [1, 2, {nested: true}],
      existing: blob,
      notABlob: {ref: {'/': CID_STR}}, // no $type/mimeType: untouched
    }
    const out = normalizeLegacyBlobRefs(input)
    expect(out.existing).toBe(blob)
    expect(out.notABlob).toEqual({ref: {'/': CID_STR}})
    expect(out.d).toEqual([1, 2, {nested: true}])
  })

  it('leaves unparseable CIDs as-is instead of throwing', () => {
    const rec = legacyExternalRecord()
    rec.embed.external.thumb.ref['/'] = 'not-a-cid'
    const out = normalizeLegacyBlobRefs(rec)
    expect(out.embed.external.thumb).not.toBeInstanceOf(BlobRef)
    expect(bsky.validate(out, AppBskyFeedPost.validateRecord)).toBe(false)
  })
})
