import {describe, expect, it} from '@jest/globals'

import {
  buildSignalEvent,
  completionPct,
  createSignalBatcher,
  isSkip,
  type SignalEvent,
} from '../signals'
import {type FeedItem} from '../types'

function item(id = 'x'): FeedItem {
  return {
    id,
    type: 'video',
    title: 't',
    source: {id: 's', name: 's', origin: 'sample'},
    createdAt: 0,
    tags: {teams: ['Carolina Hurricanes']},
  }
}

describe('completionPct', () => {
  it('rounds and clamps to 0..100', () => {
    expect(completionPct(30, 60)).toBe(50)
    expect(completionPct(90, 60)).toBe(100)
    expect(completionPct(0, 60)).toBe(0)
    expect(completionPct(5, 0)).toBe(0)
  })
})

describe('isSkip', () => {
  it('flags quick views (under the dwell threshold)', () => {
    expect(isSkip(500)).toBe(true)
    expect(isSkip(3000)).toBe(false)
  })
})

describe('buildSignalEvent', () => {
  it('carries itemId, mediaType, tags, action, value, at', () => {
    expect(buildSignalEvent(item('nhl:1'), 'watch', 1000, 75)).toEqual({
      itemId: 'nhl:1',
      mediaType: 'video',
      tags: {teams: ['Carolina Hurricanes']},
      action: 'watch',
      value: 75,
      at: 1000,
    })
  })
})

describe('createSignalBatcher', () => {
  it('auto-flushes at maxBatch and on flushNow', () => {
    const flushed: SignalEvent[][] = []
    const b = createSignalBatcher({flush: e => flushed.push(e), maxBatch: 2})

    b.add(buildSignalEvent(item(), 'like', 1))
    expect(b.pending()).toBe(1)
    expect(flushed).toHaveLength(0)

    b.add(buildSignalEvent(item(), 'like', 2))
    expect(flushed).toHaveLength(1)
    expect(flushed[0]).toHaveLength(2)
    expect(b.pending()).toBe(0)

    b.add(buildSignalEvent(item(), 'like', 3))
    b.flushNow()
    expect(flushed).toHaveLength(2)
    expect(b.pending()).toBe(0)
  })

  it('flushNow on an empty queue is a no-op', () => {
    const flushed: SignalEvent[][] = []
    const b = createSignalBatcher({flush: e => flushed.push(e)})
    b.flushNow()
    expect(flushed).toHaveLength(0)
  })
})
