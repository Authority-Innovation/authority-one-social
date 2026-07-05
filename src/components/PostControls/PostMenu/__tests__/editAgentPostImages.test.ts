import {describe, expect, it} from '@jest/globals'

import {extractImageBlobCid} from '../editAgentPostImages'

const CID = 'bafkreib3l6mcgh4mebyjy4ptrogxaipzu7wxdt6sfjyqaeeafmdge5zbqe'

describe('extractImageBlobCid', () => {
  it('prefers the record blob ref in JSON form ({ref: {$link}})', () => {
    expect(
      extractImageBlobCid(
        {ref: {$link: CID}, mimeType: 'image/jpeg', size: 12345},
        'https://cdn.test/whatever.jpg',
      ),
    ).toBe(CID)
  })

  it('handles a lex BlobRef whose ref stringifies to the CID', () => {
    const lexLike = {ref: {toString: () => CID}}
    expect(extractImageBlobCid(lexLike, 'https://cdn.test/x.jpg')).toBe(CID)
  })

  it('handles a legacy {cid} blob', () => {
    expect(extractImageBlobCid({cid: CID}, 'https://cdn.test/x.jpg')).toBe(CID)
  })

  it('falls back to the PDS getBlob ?cid= param', () => {
    expect(
      extractImageBlobCid(
        undefined,
        `https://pds.test/xrpc/com.atproto.sync.getBlob?did=did%3Aplc%3Aabc&cid=${CID}`,
      ),
    ).toBe(CID)
  })

  it('falls back to a CDN /<cid>@ext path segment', () => {
    expect(
      extractImageBlobCid(
        undefined,
        `https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:abc/${CID}@jpeg`,
      ),
    ).toBe(CID)
  })

  it('returns undefined when nothing resolves (caller fails closed)', () => {
    expect(
      extractImageBlobCid({}, 'https://cdn.test/no-cid-here.jpg'),
    ).toBeUndefined()
    expect(extractImageBlobCid(undefined, 'not a url')).toBeUndefined()
  })
})
