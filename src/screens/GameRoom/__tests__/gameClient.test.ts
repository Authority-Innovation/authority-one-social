import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals'

import {
  createMockGameClient,
  type GameCallbacks,
  type GameChatMsg,
  type GameClient,
  type GameCtx,
  MOCK_AGENT_ID,
  type PlayerInfo,
} from '../gameClient'
import {type TicTacToeG} from '../tictactoe'

/** Test harness capturing everything the client emits. */
function harness(): {
  callbacks: GameCallbacks
  states: Array<{G: TicTacToeG; ctx: GameCtx}>
  chats: GameChatMsg[]
  rosters: PlayerInfo[][]
  gameovers: Array<string | null>
} {
  const states: Array<{G: TicTacToeG; ctx: GameCtx}> = []
  const chats: GameChatMsg[] = []
  const rosters: PlayerInfo[][] = []
  const gameovers: Array<string | null> = []
  return {
    states,
    chats,
    rosters,
    gameovers,
    callbacks: {
      onState: (G, ctx) => states.push({G, ctx}),
      onChat: m => chats.push(m),
      onPlayers: p => rosters.push(p),
      onGameover: w => gameovers.push(w),
    },
  }
}

describe('createMockGameClient', () => {
  let client: GameClient | null = null

  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    client?.disconnect()
    client = null
    jest.useRealTimers()
  })

  function connect(h = harness()) {
    client = createMockGameClient({
      matchID: 'm1',
      playerID: '0',
      name: 'Elliott',
      callbacks: h.callbacks,
    })
    client.connect()
    return h
  }

  it('emits roster and initial state asynchronously after connect', () => {
    const h = connect()
    // Nothing re-entrant.
    expect(h.states).toHaveLength(0)
    expect(h.rosters).toHaveLength(0)
    jest.runAllTimers()
    expect(h.rosters[0]).toEqual([
      {id: '0', name: 'Elliott'},
      {id: '1', name: 'Guest'},
    ])
    expect(h.states[0].G.board.every(c => c === null)).toBe(true)
    expect(h.states[0].ctx.currentPlayer).toBe('0')
    // The agent opens the room in character.
    expect(h.chats.some(c => c.from === MOCK_AGENT_ID)).toBe(true)
  })

  it('applies valid place moves (hot-seat: acts as the current player)', () => {
    const h = connect()
    jest.runAllTimers()
    client!.sendMove({type: 'place', args: {cell: 4}})
    jest.runAllTimers()
    const last = h.states[h.states.length - 1]
    expect(last.G.board[4]).toBe('0')
    expect(last.ctx.currentPlayer).toBe('1')
    // Next tap places for the OTHER player.
    client!.sendMove({type: 'place', args: {cell: 0}})
    jest.runAllTimers()
    const after = h.states[h.states.length - 1]
    expect(after.G.board[0]).toBe('1')
  })

  it('drops invalid moves without emitting state', () => {
    const h = connect()
    jest.runAllTimers()
    const n = h.states.length
    client!.sendMove({type: 'place', args: {cell: 99}})
    client!.sendMove({type: 'flip', args: {}})
    client!.sendMove({type: 'place', args: {}})
    jest.runAllTimers()
    expect(h.states).toHaveLength(n)
  })

  it('fires gameover exactly once with the winning player id', () => {
    const h = connect()
    jest.runAllTimers()
    // X takes 0,1,2; O takes 3,4.
    for (const cell of [0, 3, 1, 4, 2]) {
      client!.sendMove({type: 'place', args: {cell}})
      jest.runAllTimers()
    }
    expect(h.gameovers).toEqual(['0'])
    const last = h.states[h.states.length - 1]
    expect(last.ctx.gameover).toEqual({winner: '0'})
    // Post-game taps change nothing.
    client!.sendMove({type: 'place', args: {cell: 8}})
    jest.runAllTimers()
    expect(h.gameovers).toEqual(['0'])
  })

  it('reports a draw as winner null', () => {
    const h = connect()
    jest.runAllTimers()
    for (const cell of [0, 1, 2, 4, 3, 5, 7, 6, 8]) {
      client!.sendMove({type: 'place', args: {cell}})
      jest.runAllTimers()
    }
    expect(h.gameovers).toEqual([null])
  })

  it('echoes chat back with the sender identity', () => {
    const h = connect()
    jest.runAllTimers()
    client!.sendChat('  gg  ')
    jest.runAllTimers()
    const mine = h.chats.find(c => c.from === '0')
    expect(mine).toMatchObject({from: '0', name: 'Elliott', text: 'gg'})
  })

  it('ignores empty chat and everything after disconnect', () => {
    const h = connect()
    jest.runAllTimers()
    client!.sendChat('   ')
    jest.runAllTimers()
    expect(h.chats.filter(c => c.from === '0')).toHaveLength(0)
    const n = h.states.length
    client!.disconnect()
    client!.sendMove({type: 'place', args: {cell: 0}})
    client!.sendChat('hello?')
    jest.runAllTimers()
    expect(h.states).toHaveLength(n)
    expect(h.chats.filter(c => c.from === '0')).toHaveLength(0)
  })
})
