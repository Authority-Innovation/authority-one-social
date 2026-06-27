import {describe, expect, it} from '@jest/globals'

import {
  EMPTY_WEIGHTS,
  type FeedProfileWeights,
  isProfileEmpty,
  rankFeed,
  recencyScore,
  tagMatchScore,
} from '../ranking'
import {type FeedItem, type FeedTags} from '../types'

function mk(id: string, tags: FeedTags, createdAt = 0): FeedItem {
  return {
    id,
    type: 'text',
    title: id,
    source: {id: 's', name: 's', origin: 'sample'},
    createdAt,
    tags,
  }
}

describe('isProfileEmpty', () => {
  it('true for undefined and all-empty weights', () => {
    expect(isProfileEmpty(undefined)).toBe(true)
    expect(isProfileEmpty(EMPTY_WEIGHTS)).toBe(true)
    expect(isProfileEmpty({teams: {x: 1}, topics: {}, geo: {}})).toBe(false)
  })
})

describe('tagMatchScore', () => {
  it('sums matched profile weights across teams/topics/geo', () => {
    const w: FeedProfileWeights = {
      teams: {'Carolina Hurricanes': 3},
      topics: {NHL: 2},
      geo: {},
    }
    expect(
      tagMatchScore({teams: ['Carolina Hurricanes'], topics: ['NHL']}, w),
    ).toBe(5)
    expect(tagMatchScore({teams: ['Other']}, w)).toBe(0)
  })
})

describe('recencyScore', () => {
  it('is higher for newer items and bounded', () => {
    const now = 10_000_000_000
    const fresh = recencyScore(now, now)
    const old = recencyScore(now - 48 * 3_600_000, now)
    expect(fresh).toBeGreaterThan(old)
    expect(fresh).toBeLessThanOrEqual(0.5)
    expect(old).toBeGreaterThan(0)
  })
})

describe('rankFeed', () => {
  it('falls back to the input (round-robin) order when the profile is empty/unavailable', () => {
    const items = [mk('a', {}), mk('b', {})]
    expect(rankFeed(items, EMPTY_WEIGHTS, 0)).toBe(items)
    expect(rankFeed(items, undefined, 0)).toBe(items)
  })

  it('boosts items whose tags match high-weight profile entries', () => {
    const canes = mk('canes', {teams: ['Carolina Hurricanes']})
    const other = mk('other', {teams: ['Other Team']})
    const w: FeedProfileWeights = {
      teams: {'Carolina Hurricanes': 5},
      topics: {},
      geo: {},
    }
    expect(rankFeed([other, canes], w, 0).map(i => i.id)).toEqual([
      'canes',
      'other',
    ])
  })

  it('uses recency to order items with equal tag score', () => {
    const now = 100 * 3_600_000
    const old = mk('old', {}, now - 50 * 3_600_000)
    const fresh = mk('fresh', {}, now - 1 * 3_600_000)
    // non-empty profile triggers ranking; neither item matches, so recency decides
    const w: FeedProfileWeights = {teams: {}, topics: {Unrelated: 1}, geo: {}}
    expect(rankFeed([old, fresh], w, now).map(i => i.id)).toEqual(['fresh', 'old'])
  })
})
