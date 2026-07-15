import {BlobRef} from '@atproto/api'
import {CID} from 'multiformats/cid'

/**
 * The Authority One AppView has served post records with blob refs in raw
 * dag-json form (`{"ref": {"/": "<cid>"}}`) on some indexing paths, instead
 * of the lexicon JSON form (`{"ref": {"$link": "<cid>"}}`). The XRPC layer
 * only materializes the `$link` form into `BlobRef` instances, so records
 * carrying the raw form fail `AppBskyFeedPost.validateRecord` and the feed
 * silently drops those posts (see FeedViewPostsSlice in feed-manip.ts) even
 * though the post detail view renders them fine.
 *
 * This walks fetched feed data in place and replaces any raw dag-json blob
 * shape with a real `BlobRef`, so lexicon validation passes for records the
 * AppView indexed either way. Server-side, the AppView should also be fixed
 * to serialize lexicon JSON, but already-indexed records keep the raw form
 * until a reindex, so the client must tolerate both.
 */
export function normalizeLegacyBlobRefs<T>(input: T): T {
  walk(input)
  return input
}

function walk(value: unknown): void {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const replaced = asLegacyBlobRef(value[i])
      if (replaced) {
        value[i] = replaced
      } else {
        walk(value[i])
      }
    }
  } else if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      const replaced = asLegacyBlobRef(value[key])
      if (replaced) {
        value[key] = replaced
      } else {
        walk(value[key])
      }
    }
  }
}

function asLegacyBlobRef(value: unknown): BlobRef | undefined {
  if (!isPlainObject(value)) return undefined
  if (value.$type !== 'blob') return undefined
  if (typeof value.mimeType !== 'string') return undefined
  const ref = value.ref
  if (!isPlainObject(ref)) return undefined
  const cid = ref['/']
  if (typeof cid !== 'string') return undefined
  try {
    return new BlobRef(
      CID.parse(cid),
      value.mimeType,
      typeof value.size === 'number' ? value.size : -1,
    )
  } catch {
    // Unparseable CID: leave the value as-is, validation will drop it.
    return undefined
  }
}

// Only descend into plain data. Class instances (BlobRef, CID) must be left
// untouched, and are already in their materialized form anyway.
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}
