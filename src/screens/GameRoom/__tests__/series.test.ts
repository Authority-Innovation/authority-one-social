import {mapWireSeries} from '../liveGameClient'
import {seriesLine} from '../series'
import {type PlayerInfo} from '../types'

const PLAYERS: PlayerInfo[] = [
  {id: '0', name: 'Elliott'},
  {id: '1', name: 'Bob'},
]

describe('mapWireSeries', () => {
  it('maps a well-formed series frame field', () => {
    expect(
      mapWireSeries({round: 3, firstMover: '1', score: {'0': 2, '1': 1}}),
    ).toEqual({round: 3, firstMover: '1', score: {'0': 2, '1': 1}})
  })

  it('returns null for absent or malformed series', () => {
    expect(mapWireSeries(undefined)).toBeNull()
    expect(mapWireSeries('nope')).toBeNull()
    expect(mapWireSeries({score: {}})).toBeNull()
    expect(mapWireSeries({round: 0, score: {}})).toBeNull()
  })

  it('drops non-numeric score entries and tolerates a missing score', () => {
    expect(mapWireSeries({round: 2, score: {'0': 1, '1': 'x'}})).toEqual({
      round: 2,
      score: {'0': 1},
    })
    expect(mapWireSeries({round: 2})).toEqual({round: 2, score: {}})
  })
})

describe('seriesLine', () => {
  it('formats the running score with roster names', () => {
    expect(seriesLine({round: 3, score: {'0': 2, '1': 1}}, PLAYERS)).toBe(
      'Elliott 2 – 1 Bob · game 3',
    )
  })

  it('is silent before any rematch (round 1) or without a series', () => {
    expect(seriesLine({round: 1, score: {'0': 0, '1': 0}}, PLAYERS)).toBeNull()
    expect(seriesLine(null, PLAYERS)).toBeNull()
  })

  it('defaults missing scores to 0 and unnamed seats to Player N', () => {
    expect(seriesLine({round: 2, score: {}}, [])).toBe(
      'Player 1 0 – 0 Player 2 · game 2',
    )
  })
})
