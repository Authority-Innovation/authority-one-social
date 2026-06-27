import {afterEach, describe, expect, it, jest} from '@jest/globals'

import {getSupabaseAccessToken} from '../authToken'
import {
  type FeedSignalEvent,
  fetchFeedProfile,
  normalizeFeedProfile,
  postFeedSignals,
} from '../feedClient'

jest.mock('../authToken', () => ({getSupabaseAccessToken: jest.fn()}))

const mockToken = jest.mocked(getSupabaseAccessToken)
const realFetch = global.fetch
afterEach(() => {
  global.fetch = realFetch
  mockToken.mockReset()
})

const sampleEvent: FeedSignalEvent = {
  itemId: 'nhl:1',
  mediaType: 'text',
  tags: {teams: ['Carolina Hurricanes']},
  action: 'watch',
  value: 80,
  at: 1,
}

describe('normalizeFeedProfile', () => {
  it('extracts numeric weight maps defensively', () => {
    expect(
      normalizeFeedProfile({
        weights: {teams: {Canes: 3, bad: 'x'}, topics: {NHL: 2}, geo: {}},
      }),
    ).toEqual({teams: {Canes: 3}, topics: {NHL: 2}, geo: {}})
    expect(normalizeFeedProfile(null)).toEqual({teams: {}, topics: {}, geo: {}})
  })
})

describe('postFeedSignals', () => {
  it('no-ops (no fetch) with no token or empty events; never throws', async () => {
    mockToken.mockResolvedValue(null)
    global.fetch = jest.fn(() =>
      Promise.resolve({ok: true, status: 200}),
    ) as unknown as typeof fetch
    await expect(postFeedSignals([sampleEvent])).resolves.toBeUndefined()
    expect((global.fetch as unknown as jest.Mock).mock.calls).toHaveLength(0)

    mockToken.mockResolvedValue('tok')
    await expect(postFeedSignals([])).resolves.toBeUndefined()
    expect((global.fetch as unknown as jest.Mock).mock.calls).toHaveLength(0)
  })

  it('POSTs { events } to /app/feed/signals when signed in', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() =>
      Promise.resolve({ok: true, status: 200}),
    ) as unknown as typeof fetch
    await postFeedSignals([sampleEvent])
    const call = (global.fetch as unknown as jest.Mock).mock.calls[0]
    expect(String(call[0])).toContain('/app/feed/signals')
    expect(JSON.parse(String((call[1] as {body: string}).body))).toEqual({
      events: [sampleEvent],
    })
  })

  it('never throws on network error', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() =>
      Promise.reject(new Error('offline')),
    )
    await expect(postFeedSignals([sampleEvent])).resolves.toBeUndefined()
  })
})

describe('fetchFeedProfile', () => {
  it('returns undefined when signed out', async () => {
    mockToken.mockResolvedValue(null)
    expect(await fetchFeedProfile()).toBeUndefined()
  })

  it('returns normalized weights on success', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({weights: {teams: {Canes: 1}, topics: {}, geo: {}}}),
      }),
    ) as unknown as typeof fetch
    expect(await fetchFeedProfile()).toEqual({
      teams: {Canes: 1},
      topics: {},
      geo: {},
    })
  })

  it('returns undefined on a non-ok response', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() =>
      Promise.resolve({ok: false, status: 500}),
    ) as unknown as typeof fetch
    expect(await fetchFeedProfile()).toBeUndefined()
  })
})
