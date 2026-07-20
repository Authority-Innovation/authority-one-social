import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals'

import {createMockCheckersClient} from '../mockCheckersClient'
import {createMockChessClient} from '../mockChessClient'
import {createMockConnectFourClient} from '../mockConnectFourClient'
import {
  type GameCallbacks,
  type GameClient,
  type GameCtx,
  type GameG,
} from '../types'

function harness() {
  const states: Array<{G: GameG; ctx: GameCtx}> = []
  const gameovers: Array<string | null> = []
  const callbacks: GameCallbacks = {
    onState: (G, ctx) => states.push({G, ctx}),
    onChat: () => {},
    onPlayers: () => {},
    onGameover: w => gameovers.push(w),
  }
  return {callbacks, states, gameovers}
}

describe('createMockCheckersClient', () => {
  let client: GameClient | null = null

  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    client?.disconnect()
    client = null
    jest.useRealTimers()
  })

  it('emits a checkers state with legalMoves and applies valid hops', () => {
    const h = harness()
    client = createMockCheckersClient({
      matchID: 'm1',
      playerID: '0',
      name: 'Elliott',
      callbacks: h.callbacks,
    })
    client.connect()
    jest.runAllTimers()
    const first = h.states[0]
    if (first.G.kind !== 'checkers') throw new Error('expected checkers G')
    expect(first.G.board.filter(Boolean)).toHaveLength(24)
    expect(first.G.legalMoves.length).toBeGreaterThan(0)
    expect(first.ctx.currentPlayer).toBe('0')

    const hop = first.G.legalMoves[0]
    client.sendMove({type: 'move', args: {from: hop.from, to: hop.to}})
    jest.runAllTimers()
    const next = h.states[h.states.length - 1]
    if (next.G.kind !== 'checkers') throw new Error('expected checkers G')
    expect(next.G.board[hop.from]).toBeNull()
    expect(next.G.board[hop.to]).toEqual({player: 0, king: false})
    expect(next.ctx.currentPlayer).toBe('1')

    // Invalid hops (wrong shape / illegal) change nothing.
    const n = h.states.length
    client.sendMove({type: 'move', args: {from: 0, to: 63}})
    client.sendMove({type: 'place', args: {cell: 4}})
    jest.runAllTimers()
    expect(h.states).toHaveLength(n)
  })
})

describe('createMockConnectFourClient', () => {
  let client: GameClient | null = null

  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    client?.disconnect()
    client = null
    jest.useRealTimers()
  })

  it('emits a connect-four state with legalMoves and applies drops', () => {
    const h = harness()
    client = createMockConnectFourClient({
      matchID: 'm1',
      playerID: '0',
      name: 'Elliott',
      callbacks: h.callbacks,
    })
    client.connect()
    jest.runAllTimers()
    const first = h.states[0]
    if (first.G.kind !== 'connect-four') throw new Error('expected c4 G')
    expect(first.G.board).toHaveLength(42)
    expect(first.G.legalMoves).toHaveLength(7)
    expect(first.ctx.currentPlayer).toBe('0')

    client.sendMove({type: 'drop', args: {col: 3}})
    jest.runAllTimers()
    const next = h.states[h.states.length - 1]
    if (next.G.kind !== 'connect-four') throw new Error('expected c4 G')
    // Lands in the bottom row of column 3 (row 5, row 0 is the top).
    expect(next.G.board[5 * 7 + 3]).toBe(0)
    expect(next.G.lastMove).toEqual({row: 5, col: 3})
    expect(next.ctx.currentPlayer).toBe('1')

    // Invalid drops (bad column / wrong move type) change nothing.
    const n = h.states.length
    client.sendMove({type: 'drop', args: {col: 9}})
    client.sendMove({type: 'place', args: {cell: 4}})
    jest.runAllTimers()
    expect(h.states).toHaveLength(n)
  })

  it('fires gameover once on a four-in-a-row', () => {
    const h = harness()
    client = createMockConnectFourClient({
      matchID: 'm1',
      playerID: '0',
      name: 'Elliott',
      callbacks: h.callbacks,
    })
    client.connect()
    jest.runAllTimers()
    // Hot-seat: P0 builds a column-2 tower while P1 wastes moves.
    for (const col of [2, 5, 2, 5, 2, 6, 2]) {
      client.sendMove({type: 'drop', args: {col}})
      jest.runAllTimers()
    }
    const last = h.states[h.states.length - 1]
    if (last.G.kind !== 'connect-four') throw new Error('expected c4 G')
    expect(last.G.winningLine).toHaveLength(4)
    expect(last.G.legalMoves).toEqual([])
    expect(last.ctx.gameover).toEqual({winner: '0'})
    expect(h.gameovers).toEqual(['0'])
    // Drops after the game is over are ignored.
    const n = h.states.length
    client.sendMove({type: 'drop', args: {col: 0}})
    jest.runAllTimers()
    expect(h.states).toHaveLength(n)
  })
})

describe('createMockChessClient', () => {
  let client: GameClient | null = null

  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    client?.disconnect()
    client = null
    jest.useRealTimers()
  })

  it('emits a FEN state with legalMoves and applies a legal move', () => {
    const h = harness()
    client = createMockChessClient({
      matchID: 'm1',
      playerID: '0',
      name: 'Elliott',
      callbacks: h.callbacks,
    })
    client.connect()
    jest.runAllTimers()
    const first = h.states[0]
    if (first.G.kind !== 'chess') throw new Error('expected chess G')
    expect(first.G.fen.startsWith('rnbqkbnr/pppppppp/')).toBe(true)
    expect(first.G.legalMoves).toHaveLength(20)
    expect(first.ctx.currentPlayer).toBe('0')

    client.sendMove({type: 'move', args: {from: 'e2', to: 'e4'}})
    jest.runAllTimers()
    const next = h.states[h.states.length - 1]
    if (next.G.kind !== 'chess') throw new Error('expected chess G')
    expect(next.G.fen.split(' ')[1]).toBe('b')
    expect(next.G.lastMove).toEqual({from: 'e2', to: 'e4'})
    expect(next.ctx.currentPlayer).toBe('1')

    // Illegal move: white piece while black to move.
    const n = h.states.length
    client.sendMove({type: 'move', args: {from: 'd2', to: 'd4'}})
    jest.runAllTimers()
    expect(h.states).toHaveLength(n)
  })
})
