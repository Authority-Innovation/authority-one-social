import {describe, expect, it} from '@jest/globals'

import {FOR_YOU_ADAPTERS, loadForYouFeed} from '../sources'
import {
  newsAdapter,
  podcastAdapter,
  redditAdapter,
  youtubeAdapter,
} from '../sources/sampled'
import {type FeedItem, type SourceAdapter} from '../types'

const MEDIA_TYPES = ['video', 'image', 'text', 'link', 'audio']

function expectValidFeedItem(i: FeedItem, adapterId: string) {
  expect(typeof i.id).toBe('string')
  expect(i.id.startsWith(`${adapterId}:`)).toBe(true)
  expect(MEDIA_TYPES).toContain(i.type)
  expect(typeof i.title).toBe('string')
  expect(i.title.length).toBeGreaterThan(0)
  expect(i.source.id).toBe(adapterId)
  expect(typeof i.createdAt).toBe('number')
  expect(Number.isNaN(i.createdAt)).toBe(false)
  expect(i.tags).toBeDefined()
}

describe('registry', () => {
  it('registers every Raleigh demo source', () => {
    const ids = FOR_YOU_ADAPTERS.map(a => a.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        'nhl',
        'mlb',
        'clips',
        'youtube',
        'news',
        'reddit',
        'podcast',
        'college',
        'highschool',
        'venues',
      ]),
    )
  })

  it('flags CORS/RSS/API-key sources as needsBackendProxy (deferred to a server)', () => {
    for (const id of ['news', 'reddit', 'podcast', 'youtube']) {
      expect(FOR_YOU_ADAPTERS.find(a => a.id === id)?.needsBackendProxy).toBe(true)
    }
  })
})

describe('sample adapters emit valid, normalized FeedItems', () => {
  it('every item satisfies the FeedItem contract', async () => {
    for (const a of [newsAdapter, redditAdapter, podcastAdapter, youtubeAdapter]) {
      const items = await a.fetch({})
      expect(items.length).toBeGreaterThan(0)
      for (const i of items) expectValidFeedItem(i, a.id)
    }
  })

  it('the YouTube highlight uses an embed (never re-hosted)', async () => {
    const [item] = await youtubeAdapter.fetch({})
    expect(item.media?.kind).toBe('video')
    if (item.media?.kind === 'video') {
      expect(item.media.embed?.provider).toBe('youtube')
      expect(item.media.url).toBeUndefined() // not re-hosted
    }
  })
})

describe('loadForYouFeed', () => {
  it('blends sample adapters into a deduped feed', async () => {
    const feed = await loadForYouFeed([newsAdapter, redditAdapter])
    expect(feed.length).toBeGreaterThan(0)
    const ids = feed.map(i => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('a single throwing adapter never breaks the blend', async () => {
    const bad: SourceAdapter = {
      id: 'bad',
      name: 'bad',
      origin: 'sample',
      fetch: () => Promise.reject(new Error('boom')),
    }
    const feed = await loadForYouFeed([bad, newsAdapter])
    expect(feed.length).toBeGreaterThan(0)
  })
})
