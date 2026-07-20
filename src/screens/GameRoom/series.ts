/**
 * Running rematch-series score line. After a successful {t:'rematch'} the
 * server's fresh state frame carries `series: {round, firstMover, score}`;
 * the screen shows a small "Elliott 2 – 1 Bob · game 3" line so repeated
 * casual games read as a rivalry, not isolated matches.
 */
import {type GameSeries, type PlayerInfo} from './types'

/** The score line, or null when there is nothing worth saying: no series
 *  yet, or round 1 (a first game is just a match, not a series). PURE. */
export function seriesLine(
  series: GameSeries | null,
  players: PlayerInfo[],
): string | null {
  if (!series || series.round < 2) return null
  const nameOf = (id: string) =>
    players.find(p => p.id === id)?.name ?? `Player ${Number(id) + 1}`
  const s0 = series.score['0'] ?? 0
  const s1 = series.score['1'] ?? 0
  return `${nameOf('0')} ${s0} – ${s1} ${nameOf('1')} · game ${series.round}`
}
