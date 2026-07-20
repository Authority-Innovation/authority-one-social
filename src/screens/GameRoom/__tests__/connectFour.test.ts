import {describe, expect, it} from '@jest/globals'

import {
  applyConnectFourDrop,
  type ConnectFourG,
  connectFourGameover,
  connectFourLegalMoves,
  findWinningLine,
  initialConnectFourG,
  landingRow,
  legalColSet,
} from '../connectFour'

/** Drop a scripted sequence of columns, asserting every drop is legal. */
function play(cols: number[], G = initialConnectFourG()): ConnectFourG {
  for (const col of cols) {
    const next = applyConnectFourDrop(G, col)
    if (!next) throw new Error(`illegal scripted drop in column ${col}`)
    G = next
  }
  return G
}

describe('connectFour model', () => {
  it('starts empty, player 0 to move, all 7 columns legal', () => {
    const G = initialConnectFourG()
    expect(G.board).toHaveLength(42)
    expect(G.board.every(c => c === null)).toBe(true)
    expect(G.currentPlayer).toBe('0')
    expect(G.lastMove).toBeNull()
    expect(G.winningLine).toBeNull()
    expect(connectFourLegalMoves(G).map(m => m.col)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ])
    expect(connectFourGameover(G)).toBeNull()
  })

  it('discs land in the LOWEST empty row (row 0 is the top) and stack', () => {
    let G = initialConnectFourG()
    expect(landingRow(G.board, 3)).toBe(5)
    G = play([3])
    // Bottom row, column 3 — index row*7+col = 5*7+3.
    expect(G.board[5 * 7 + 3]).toBe(0)
    expect(G.lastMove).toEqual({row: 5, col: 3})
    expect(G.currentPlayer).toBe('1')
    G = play([3], G)
    expect(G.board[4 * 7 + 3]).toBe(1)
    expect(G.lastMove).toEqual({row: 4, col: 3})
    expect(landingRow(G.board, 3)).toBe(3)
  })

  it('rejects drops into a full column and out-of-range columns', () => {
    // Six alternating discs fill column 0.
    const G = play([0, 0, 0, 0, 0, 0])
    expect(landingRow(G.board, 0)).toBeNull()
    expect(applyConnectFourDrop(G, 0)).toBeNull()
    expect(connectFourLegalMoves(G).map(m => m.col)).toEqual([1, 2, 3, 4, 5, 6])
    expect(applyConnectFourDrop(G, -1)).toBeNull()
    expect(applyConnectFourDrop(G, 7)).toBeNull()
    expect(applyConnectFourDrop(G, 2.5)).toBeNull()
  })

  it('detects a horizontal win and reports the four cells', () => {
    // P0 drops 0,1,2,3 along the bottom; P1 stacks elsewhere.
    const G = play([0, 6, 1, 6, 2, 6, 3])
    expect(G.winningLine).toEqual([5 * 7 + 0, 5 * 7 + 1, 5 * 7 + 2, 5 * 7 + 3])
    expect(connectFourGameover(G)).toEqual({winner: '0'})
    // A finished game accepts no more drops and offers no legal moves.
    expect(applyConnectFourDrop(G, 4)).toBeNull()
    expect(connectFourLegalMoves(G)).toEqual([])
  })

  it('detects a vertical win', () => {
    const G = play([2, 3, 2, 3, 2, 3, 2])
    // The scanner reports the line from its topmost cell downward.
    expect(G.winningLine).toEqual([2 * 7 + 2, 3 * 7 + 2, 4 * 7 + 2, 5 * 7 + 2])
    expect(connectFourGameover(G)).toEqual({winner: '0'})
  })

  it('detects a diagonal win (both directions)', () => {
    // Rising-to-the-right staircase for P0 on columns 0-3.
    const up = play([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3])
    expect(up.winningLine).not.toBeNull()
    expect(connectFourGameover(up)).toEqual({winner: '0'})
    // Mirrored staircase falling to the right on columns 3-6.
    const down = play([6, 5, 5, 4, 4, 3, 4, 3, 3, 0, 3])
    expect(down.winningLine).not.toBeNull()
    expect(connectFourGameover(down)).toEqual({winner: '0'})
  })

  it('a second player win is attributed to seat 1', () => {
    // P0 wastes moves in columns 5/6; P1 builds a column-0 tower.
    const G = play([5, 0, 6, 0, 5, 0, 6, 0])
    expect(connectFourGameover(G)).toEqual({winner: '1'})
  })

  it('a full board with no line is a draw', () => {
    // Lineless full board: cell = rowParity XOR t(col) with the column-type
    // vector t = 0010010 — verticals alternate every row, and no 4-window of
    // t is constant (horizontals) or alternating (diagonals).
    const t = [0, 0, 1, 0, 0, 1, 0]
    const board = Array.from({length: 42}, (_, i) => {
      const row = Math.floor(i / 7)
      return ((row % 2) ^ t[i % 7]) as 0 | 1
    })
    expect(findWinningLine(board)).toBeNull()
    const G: ConnectFourG = {
      board,
      currentPlayer: '0',
      lastMove: {row: 0, col: 0},
      winningLine: null,
    }
    expect(connectFourGameover(G)).toEqual({winner: null})
    expect(connectFourLegalMoves(G)).toEqual([])
    expect(applyConnectFourDrop(G, 3)).toBeNull()
  })

  it('findWinningLine is null on a live board', () => {
    expect(findWinningLine(initialConnectFourG().board)).toBeNull()
    expect(findWinningLine(play([0, 1, 0, 1, 0]).board)).toBeNull()
  })

  it('legalColSet derives playable columns defensively from wire moves', () => {
    expect(
      Array.from(legalColSet([{col: 0}, {col: 6}, {col: 3}])).sort(),
    ).toEqual([0, 3, 6])
    // Malformed wire entries are dropped, never thrown.
    expect(
      legalColSet([
        {col: -1},
        {col: 7},
        {col: 2.5},
        {col: 'x'} as unknown as {col: number},
        null as unknown as {col: number},
        {col: 4},
      ]),
    ).toEqual(new Set([4]))
    expect(legalColSet([])).toEqual(new Set())
  })
})
