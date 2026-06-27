import {type FeedItem, type SourceAdapter} from '../types'

/**
 * Carolina Hurricanes — NHL schedule/score cards.
 *
 * LIVE-capable: the public NHL web API (api-web.nhle.com) is generally CORS-open,
 * so this attempts a real fetch and falls back to seeded sample data on any error
 * (offline, CORS, shape change). The normalizer is pure + unit-tested.
 */

const NHL_SOURCE = {id: 'nhl', name: 'NHL', origin: 'live' as const}
const SCHEDULE_URL = 'https://api-web.nhle.com/v1/club-schedule-season/CAR/now'

type NhlGame = {
  id: number
  gameDate: string
  startTimeUTC?: string
  gameState?: string
  awayTeam?: {abbrev?: string; placeName?: {default?: string}; score?: number}
  homeTeam?: {abbrev?: string; placeName?: {default?: string}; score?: number}
}

function teamLabel(t?: NhlGame['awayTeam']): string {
  return t?.placeName?.default || t?.abbrev || 'TBD'
}

/** Pure: NHL club-schedule JSON -> FeedItems (most recent first). */
export function normalizeNhlSchedule(
  json: {games?: NhlGame[]} | null | undefined,
): FeedItem[] {
  const games = json?.games ?? []
  return games
    .map(g => {
      const when = Date.parse(g.startTimeUTC || g.gameDate)
      if (Number.isNaN(when)) return null
      const away = teamLabel(g.awayTeam)
      const home = teamLabel(g.homeTeam)
      const final =
        typeof g.awayTeam?.score === 'number' &&
        typeof g.homeTeam?.score === 'number'
      const title = final
        ? `${away} ${g.awayTeam?.score} – ${home} ${g.homeTeam?.score}`
        : `${away} @ ${home}`
      const item: FeedItem = {
        id: `nhl:${g.id}`,
        type: 'text',
        title,
        summary: final
          ? `Final · Carolina Hurricanes`
          : `Upcoming · Carolina Hurricanes`,
        source: NHL_SOURCE,
        link: `https://www.nhl.com/hurricanes/schedule`,
        createdAt: when,
        tags: {teams: ['Carolina Hurricanes'], geo: ['Raleigh, NC'], topics: ['NHL']},
        score: {
          away,
          home,
          awayScore: g.awayTeam?.score,
          homeScore: g.homeTeam?.score,
          state: final ? 'Final' : 'Upcoming',
          accentColor: '#CE1126', // Hurricanes red
        },
      }
      return item
    })
    .filter((x): x is FeedItem => x !== null)
    .sort((a, b) => b.createdAt - a.createdAt)
}

const SAMPLE: FeedItem[] = [
  {
    id: 'nhl:sample-1',
    type: 'text',
    title: 'Hurricanes 4 – Capitals 2',
    summary: 'Final · Aho and Svechnikov each tally as Canes take it at Lenovo Center.',
    source: NHL_SOURCE,
    link: 'https://www.nhl.com/hurricanes/schedule',
    createdAt: Date.parse('2026-06-24T23:00:00Z'),
    tags: {teams: ['Carolina Hurricanes'], geo: ['Raleigh, NC'], topics: ['NHL']},
    score: {
      away: 'Capitals',
      home: 'Hurricanes',
      awayScore: 2,
      homeScore: 4,
      state: 'Final',
      accentColor: '#CE1126',
    },
  },
  {
    id: 'nhl:sample-2',
    type: 'text',
    title: 'Hurricanes @ Panthers',
    summary: 'Upcoming · Puck drop 7:00 PM ET.',
    source: NHL_SOURCE,
    link: 'https://www.nhl.com/hurricanes/schedule',
    createdAt: Date.parse('2026-06-27T23:00:00Z'),
    tags: {teams: ['Carolina Hurricanes'], geo: ['Raleigh, NC'], topics: ['NHL']},
    score: {
      away: 'Hurricanes',
      home: 'Panthers',
      state: 'Upcoming',
      accentColor: '#CE1126',
    },
  },
]

export const nhlAdapter: SourceAdapter = {
  id: 'nhl',
  name: 'NHL',
  origin: 'live',
  async fetch({signal, limit}) {
    try {
      const res = await fetch(SCHEDULE_URL, {signal})
      if (!res.ok) throw new Error(`NHL ${res.status}`)
      const json = (await res.json()) as {games?: NhlGame[]}
      const items = normalizeNhlSchedule(json)
      return (items.length ? items : SAMPLE).slice(0, limit ?? 20)
    } catch {
      return SAMPLE.slice(0, limit ?? 20)
    }
  },
}
