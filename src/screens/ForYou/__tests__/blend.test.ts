import {describe, expect, it} from '@jest/globals'

import {blendFeeds, dedupeById} from '../blend'
import {type FeedItem} from '../types'

function item(id: string, sourceId: string): FeedItem {
  return {
    id,
    type: 'text',
    title: id,
    source: {id: sourceId, name: sourceId, origin: 'sample'},
    createdAt: 0,
    tags: {},
  }
}

describe('dedupeById', () => {
  it('keeps the first occurrence of each id', () => {
    const out = dedupeById([item('a', 's'), item('b', 's'), item('a', 's')])
    expect(out.map(i => i.id)).toEqual(['a', 'b'])
  })
})

describe('blendFeeds', () => {
  it('round-robin interleaves across sources (diversifies, never clusters)', () => {
    const nhl = [item('n1', 'nhl'), item('n2', 'nhl'), item('n3', 'nhl')]
    const news = [item('w1', 'news'), item('w2', 'news')]
    const out = blendFeeds([nhl, news])
    // first item from each source before second item from any source
    expect(out.map(i => i.id)).toEqual(['n1', 'w1', 'n2', 'w2', 'n3'])
  })

  it('skips empty groups and preserves intra-source order', () => {
    const out = blendFeeds([[], [item('a', 's'), item('b', 's')], []])
    expect(out.map(i => i.id)).toEqual(['a', 'b'])
  })

  it('dedupes across groups', () => {
    const out = blendFeeds([[item('x', 's1')], [item('x', 's2'), item('y', 's2')]])
    expect(out.map(i => i.id)).toEqual(['x', 'y'])
  })

  it('returns [] for no items', () => {
    expect(blendFeeds([[], []])).toEqual([])
  })
})
