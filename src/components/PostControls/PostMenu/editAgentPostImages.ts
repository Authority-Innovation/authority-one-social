/**
 * Resolve an existing image's blob-ref CID — the `keep` identifier the runtime
 * edit contract requires (NEVER the CDN url). Sources, most authoritative
 * first: the post RECORD's blob ref (JSON `{ref: {$link}}`, or a lex BlobRef
 * whose ref stringifies to the CID, or a legacy `{cid}` blob), then the view's
 * fullsize url (PDS getBlob `?cid=` param, or a CDN `/<cid>@ext` path
 * segment). PURE + tested.
 */
export function extractImageBlobCid(
  recordImageBlob: unknown,
  fullsizeUrl: string,
): string | undefined {
  const blob = recordImageBlob as
    | {ref?: {$link?: unknown; toString?: () => string}; cid?: unknown}
    | undefined
  if (blob?.ref) {
    if (typeof blob.ref.$link === 'string' && blob.ref.$link) {
      return blob.ref.$link
    }
    const s = String(blob.ref)
    if (s && s !== '[object Object]') return s
  }
  if (typeof blob?.cid === 'string' && blob.cid) return blob.cid
  try {
    const u = new URL(fullsizeUrl)
    const cidParam = u.searchParams.get('cid')
    if (cidParam) return cidParam
    const m = u.pathname.match(/\/([a-z2-7][a-z0-9]{20,})@\w+$/i)
    if (m) return m[1]
  } catch {
    // not a parseable url — fall through
  }
  return undefined
}
