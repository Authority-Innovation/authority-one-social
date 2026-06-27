import {type FeedItem} from './types'

/**
 * Blend = how registered sources are merged into one feed. This is deliberately
 * NOT ranking (out of M1 scope): it is a deterministic round-robin interleave that
 * (a) diversifies sources so you never see 10 NHL cards in a row, and (b) dedupes
 * by stable id. Each group keeps its own internal order (adapters return their
 * items newest-first), so swapping in a real ranker later only replaces this fn.
 */

/** Drop duplicate items by `id`, keeping the first occurrence. */
export function dedupeById(items: FeedItem[]): FeedItem[] {
  const seen = new Set<string>()
  const out: FeedItem[] = []
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

/**
 * Round-robin interleave across source groups, then dedupe. Empty groups are
 * skipped; order within a group is preserved.
 */
export function blendFeeds(groups: FeedItem[][]): FeedItem[] {
  const nonEmpty = groups.filter(g => g.length > 0)
  const interleaved: FeedItem[] = []
  const maxLen = nonEmpty.reduce((m, g) => Math.max(m, g.length), 0)
  for (let i = 0; i < maxLen; i++) {
    for (const group of nonEmpty) {
      if (i < group.length) interleaved.push(group[i])
    }
  }
  return dedupeById(interleaved)
}
