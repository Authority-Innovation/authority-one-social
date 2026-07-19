import {describe, expect, it} from '@jest/globals'

import {
  applyPlace,
  gameoverOf,
  initialG,
  isDraw,
  type TicTacToeG,
  winnerOf,
} from '../tictactoe'

function play(moves: number[]): TicTacToeG {
  let G = initialG()
  for (const cell of moves) {
    const next = applyPlace(G, G.currentPlayer, cell)
    if (!next) throw new Error(`invalid move ${cell}`)
    G = next
  }
  return G
}

describe('initialG', () => {
  it('starts empty with player 0 to move', () => {
    const G = initialG()
    expect(G.board).toHaveLength(9)
    expect(G.board.every(c => c === null)).toBe(true)
    expect(G.currentPlayer).toBe('0')
  })
})

describe('applyPlace', () => {
  it('places for the current player and alternates the turn', () => {
    const G = applyPlace(initialG(), '0', 4)!
    expect(G.board[4]).toBe('0')
    expect(G.currentPlayer).toBe('1')
  })

  it('rejects out-of-turn moves', () => {
    expect(applyPlace(initialG(), '1', 0)).toBeNull()
  })

  it('rejects occupied cells', () => {
    const G = play([4])
    expect(applyPlace(G, '1', 4)).toBeNull()
  })

  it('rejects out-of-range and non-integer cells', () => {
    expect(applyPlace(initialG(), '0', -1)).toBeNull()
    expect(applyPlace(initialG(), '0', 9)).toBeNull()
    expect(applyPlace(initialG(), '0', 1.5)).toBeNull()
    expect(applyPlace(initialG(), '0', NaN)).toBeNull()
  })

  it('rejects moves once the game is over', () => {
    // X: 0,1,2 wins; O: 3,4
    const G = play([0, 3, 1, 4, 2])
    expect(winnerOf(G.board)).toBe('0')
    expect(applyPlace(G, G.currentPlayer, 8)).toBeNull()
  })

  it('does not mutate the input state', () => {
    const G = initialG()
    applyPlace(G, '0', 0)
    expect(G.board[0]).toBeNull()
    expect(G.currentPlayer).toBe('0')
  })
})

describe('winnerOf / isDraw / gameoverOf', () => {
  it('detects a row win', () => {
    const G = play([0, 3, 1, 4, 2])
    expect(winnerOf(G.board)).toBe('0')
    expect(gameoverOf(G.board)).toEqual({winner: '0'})
  })

  it('detects a column win', () => {
    // O wins column 2,5,8 (X wastes 0,1,3)
    const G = play([0, 2, 1, 5, 3, 8])
    expect(winnerOf(G.board)).toBe('1')
  })

  it('detects a diagonal win', () => {
    const G = play([0, 1, 4, 2, 8])
    expect(winnerOf(G.board)).toBe('0')
  })

  it('detects a draw on a full board with no line', () => {
    // X O X / X O O / O X X — no three-in-a-row
    const G = play([0, 1, 2, 4, 3, 5, 7, 6, 8])
    expect(winnerOf(G.board)).toBeNull()
    expect(isDraw(G.board)).toBe(true)
    expect(gameoverOf(G.board)).toEqual({winner: null})
  })

  it('reports no gameover while the game is live', () => {
    expect(gameoverOf(initialG().board)).toBeNull()
    expect(gameoverOf(play([4]).board)).toBeNull()
  })
})
