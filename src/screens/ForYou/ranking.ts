import {type FeedItem, type FeedTags} from './types'

/**
 * Per-tag interest weights from the runtime's engagement profile
 * (GET /app/feed/profile). Higher weight => boost items carrying that tag.
 */
export interface FeedProfileWeights {
  teams: Record<string, number>
  topics: Record<string, number>
  geo: Record<string, number>
}

export const EMPTY_WEIGHTS: FeedProfileWeights = {teams: {}, topics: {}, geo: {}}

/** True when the profile has no learned interests yet. */
export function isProfileEmpty(w: FeedProfileWeights | undefined): boolean {
  if (!w) return true
  return (
    Object.keys(w.teams).length === 0 &&
    Object.keys(w.topics).length === 0 &&
    Object.keys(w.geo).length === 0
  )
}

const RECENCY_SCALE = 0.5
const RECENCY_HALFLIFE_HOURS = 24

/** Additive freshness term in [0, RECENCY_SCALE]; newer => higher. */
export function recencyScore(createdAt: number, now: number): number {
  const ageHours = Math.max(0, (now - createdAt) / 3_600_000)
  return RECENCY_SCALE / (1 + ageHours / RECENCY_HALFLIFE_HOURS)
}

function sumMatched(tags: string[] | undefined, weights: Record<string, number>) {
  if (!tags) return 0
  let s = 0
  for (const tag of tags) s += weights[tag] ?? 0
  return s
}

/** Tag-match score = sum of profile weights for the item's teams/topics/geo tags. */
export function tagMatchScore(
  tags: FeedTags,
  weights: FeedProfileWeights,
): number {
  return (
    sumMatched(tags.teams, weights.teams) +
    sumMatched(tags.topics, weights.topics) +
    sumMatched(tags.geo, weights.geo)
  )
}

/** Total ranking score for one item: interest match + recency. */
export function scoreItem(
  item: FeedItem,
  weights: FeedProfileWeights,
  now: number,
): number {
  return tagMatchScore(item.tags, weights) + recencyScore(item.createdAt, now)
}

/**
 * Rank the blended feed by profile weights + recency (stable: ties keep the input
 * round-robin order). Falls back to the input order unchanged when the profile is
 * empty/unavailable — so an un-personalized user still gets the diversified blend.
 */
export function rankFeed(
  items: FeedItem[],
  weights: FeedProfileWeights | undefined,
  now: number,
): FeedItem[] {
  if (isProfileEmpty(weights) || items.length === 0) return items
  const w = weights as FeedProfileWeights
  return items
    .map((item, index) => ({item, index, score: scoreItem(item, w, now)}))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(d => d.item)
}
