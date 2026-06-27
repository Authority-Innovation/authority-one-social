import {type FeedItem, type SourceAdapter} from '../types'

/**
 * Durham Bulls — MLB Stats API (Triple-A, sportId 11, teamId 234).
 *
 * LIVE-capable: statsapi.mlb.com is CORS-open; attempts a real fetch with seeded
 * sample fallback. Normalizer is pure + unit-tested.
 */

const MLB_SOURCE = {id: 'mlb', name: 'MiLB', origin: 'live' as const}
const SCHEDULE_URL =
  'https://statsapi.mlb.com/api/v1/schedule?sportId=11&teamId=234'

type MlbGame = {
  gamePk: number
  gameDate: string
  teams?: {
    away?: {team?: {name?: string}; score?: number}
    home?: {team?: {name?: string}; score?: number}
  }
  status?: {abstractGameState?: string}
}

/** Pure: MLB schedule JSON -> FeedItems (most recent first). */
export function normalizeMlbSchedule(
  json: {dates?: {games?: MlbGame[]}[]} | null | undefined,
): FeedItem[] {
  const games = (json?.dates ?? []).flatMap(d => d.games ?? [])
  return games
    .map(g => {
      const when = Date.parse(g.gameDate)
      if (Number.isNaN(when)) return null
      const away = g.teams?.away?.team?.name || 'Away'
      const home = g.teams?.home?.team?.name || 'Home'
      const final = g.status?.abstractGameState === 'Final'
      const title = final
        ? `${away} ${g.teams?.away?.score ?? 0} – ${home} ${g.teams?.home?.score ?? 0}`
        : `${away} @ ${home}`
      const item: FeedItem = {
        id: `mlb:${g.gamePk}`,
        type: 'text',
        title,
        summary: final ? 'Final · Durham Bulls' : 'Upcoming · Durham Bulls',
        source: MLB_SOURCE,
        link: 'https://www.milb.com/durham/schedule',
        createdAt: when,
        tags: {teams: ['Durham Bulls'], geo: ['Durham, NC'], topics: ['MiLB', 'Baseball']},
        score: {
          away,
          home,
          awayScore: g.teams?.away?.score,
          homeScore: g.teams?.home?.score,
          state: final ? 'Final' : 'Upcoming',
          accentColor: '#0C2340', // Durham Bulls navy
        },
      }
      return item
    })
    .filter((x): x is FeedItem => x !== null)
    .sort((a, b) => b.createdAt - a.createdAt)
}

const SAMPLE: FeedItem[] = [
  {
    id: 'mlb:sample-1',
    type: 'text',
    title: 'Bulls 6 – Jumbo Shrimp 3',
    summary: 'Final · Durham clinches the series at the DBAP.',
    source: MLB_SOURCE,
    link: 'https://www.milb.com/durham/schedule',
    createdAt: Date.parse('2026-06-25T23:05:00Z'),
    tags: {teams: ['Durham Bulls'], geo: ['Durham, NC'], topics: ['MiLB', 'Baseball']},
    score: {
      away: 'Jumbo Shrimp',
      home: 'Bulls',
      awayScore: 3,
      homeScore: 6,
      state: 'Final',
      accentColor: '#0C2340',
    },
  },
]

export const mlbAdapter: SourceAdapter = {
  id: 'mlb',
  name: 'MiLB',
  origin: 'live',
  async fetch({signal, limit}) {
    try {
      const res = await fetch(SCHEDULE_URL, {signal})
      if (!res.ok) throw new Error(`MLB ${res.status}`)
      const json = (await res.json()) as {dates?: {games?: MlbGame[]}[]}
      const items = normalizeMlbSchedule(json)
      return (items.length ? items : SAMPLE).slice(0, limit ?? 20)
    } catch {
      return SAMPLE.slice(0, limit ?? 20)
    }
  },
}
