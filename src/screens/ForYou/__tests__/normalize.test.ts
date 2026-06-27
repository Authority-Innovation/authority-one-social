import {afterEach, describe, expect, it, jest} from '@jest/globals'

import {mlbAdapter, normalizeMlbSchedule} from '../sources/mlb'
import {nhlAdapter, normalizeNhlSchedule} from '../sources/nhl'

describe('normalizeNhlSchedule', () => {
  it('maps games to FeedItems (final shows score, newest first, nhl-prefixed)', () => {
    const items = normalizeNhlSchedule({
      games: [
        {
          id: 1,
          gameDate: '2026-01-01',
          startTimeUTC: '2026-01-01T00:00:00Z',
          awayTeam: {placeName: {default: 'Washington'}, score: 2},
          homeTeam: {placeName: {default: 'Carolina'}, score: 4},
        },
        {
          id: 2,
          gameDate: '2026-02-01',
          startTimeUTC: '2026-02-01T00:00:00Z',
          awayTeam: {placeName: {default: 'Carolina'}},
          homeTeam: {placeName: {default: 'Florida'}},
        },
      ],
    })
    expect(items).toHaveLength(2)
    expect(items[0].id).toBe('nhl:2') // newest first
    expect(items[1].title).toContain('4') // final score rendered
    expect(items.every(i => i.source.id === 'nhl')).toBe(true)
    expect(items.every(i => i.tags.teams?.includes('Carolina Hurricanes'))).toBe(true)
  })

  it('returns [] for empty/missing input', () => {
    expect(normalizeNhlSchedule(null)).toEqual([])
    expect(normalizeNhlSchedule({})).toEqual([])
  })
})

describe('normalizeMlbSchedule', () => {
  it('flattens dates[].games[] into FeedItems', () => {
    const items = normalizeMlbSchedule({
      dates: [
        {
          games: [
            {
              gamePk: 99,
              gameDate: '2026-06-25T23:05:00Z',
              status: {abstractGameState: 'Final'},
              teams: {
                away: {team: {name: 'Jacksonville'}, score: 3},
                home: {team: {name: 'Durham Bulls'}, score: 6},
              },
            },
          ],
        },
      ],
    })
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('mlb:99')
    expect(items[0].title).toContain('6')
    expect(items[0].source.id).toBe('mlb')
  })

  it('returns [] for empty/missing input', () => {
    expect(normalizeMlbSchedule(null)).toEqual([])
    expect(normalizeMlbSchedule({dates: []})).toEqual([])
  })
})

describe('live adapters are resilient', () => {
  const realFetch = global.fetch
  afterEach(() => {
    global.fetch = realFetch
  })

  it('nhlAdapter returns normalized items on a successful fetch', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            games: [
              {
                id: 7,
                gameDate: '2026-01-01',
                startTimeUTC: '2026-01-01T00:00:00Z',
                awayTeam: {placeName: {default: 'W'}, score: 2},
                homeTeam: {placeName: {default: 'C'}, score: 4},
              },
            ],
          }),
      }),
    ) as unknown as typeof fetch
    const items = await nhlAdapter.fetch({})
    expect(items[0].id).toBe('nhl:7')
  })

  it('nhlAdapter falls back to sample on network error (never throws)', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('offline')))
    const items = await nhlAdapter.fetch({})
    expect(items.length).toBeGreaterThan(0)
    expect(items.every(i => i.id.startsWith('nhl:'))).toBe(true)
  })

  it('mlbAdapter falls back to sample on a non-ok response', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ok: false, status: 500}),
    ) as unknown as typeof fetch
    const items = await mlbAdapter.fetch({})
    expect(items.length).toBeGreaterThan(0)
    expect(items.every(i => i.id.startsWith('mlb:'))).toBe(true)
  })
})
