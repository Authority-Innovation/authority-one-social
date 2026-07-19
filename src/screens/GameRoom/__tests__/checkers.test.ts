import {describe, expect, it} from '@jest/globals'

import {
  applyCheckersMove,
  capturesAreForced,
  type CheckersCell,
  type CheckersG,
  checkersGameover,
  checkersLegalMoves,
  initialCheckersG,
  isDarkSquare,
  movableFroms,
} from '../checkers'

const empty = (): CheckersCell[] => Array(64).fill(null)
const man = (player: 0 | 1) => ({player, king: false})
const king = (player: 0 | 1) => ({player, king: true})
const g = (
  board: CheckersCell[],
  overrides?: Partial<CheckersG>,
): CheckersG => ({
  board,
  currentPlayer: '0',
  mustContinueFrom: null,
  ...overrides,
})

describe('initialCheckersG', () => {
  it('sets up 12 pieces a side on dark squares only', () => {
    const {board, currentPlayer, mustContinueFrom} = initialCheckersG()
    const p0 = board.filter(c => c?.player === 0)
    const p1 = board.filter(c => c?.player === 1)
    expect(p0).toHaveLength(12)
    expect(p1).toHaveLength(12)
    expect(board.every((c, i) => c === null || isDarkSquare(i))).toBe(true)
    // Player 1 fills the top rows, player 0 the bottom.
    expect(board.slice(0, 24).every(c => c === null || c.player === 1)).toBe(
      true,
    )
    expect(board.slice(40).every(c => c === null || c.player === 0)).toBe(true)
    expect(currentPlayer).toBe('0')
    expect(mustContinueFrom).toBeNull()
  })
})

describe('checkersLegalMoves', () => {
  it('men move one diagonal step forward only', () => {
    const board = empty()
    board[4 * 8 + 3] = man(0) // row 4 col 3
    const moves = checkersLegalMoves(g(board))
    // Player 0 advances up (toward row 0): (3,2) and (3,4).
    expect(moves.map(m => m.to).sort()).toEqual([3 * 8 + 2, 3 * 8 + 4].sort())
    expect(moves.every(m => !m.captures)).toBe(true)
  })

  it('kings move both directions', () => {
    const board = empty()
    board[4 * 8 + 3] = king(0)
    const moves = checkersLegalMoves(g(board))
    expect(moves).toHaveLength(4)
  })

  it('captures are forced when available', () => {
    const board = empty()
    board[4 * 8 + 3] = man(0)
    board[3 * 8 + 4] = man(1) // adjacent enemy, landing square (2,5) empty
    const moves = checkersLegalMoves(g(board))
    expect(moves).toEqual([
      {from: 4 * 8 + 3, to: 2 * 8 + 5, captures: [3 * 8 + 4]},
    ])
  })

  it('mid multi-jump only the continuing piece may move', () => {
    const board = empty()
    board[6 * 8 + 1] = man(0)
    board[5 * 8 + 2] = man(1)
    board[3 * 8 + 4] = man(1)
    board[2 * 8 + 7] = man(0) // another piece with a plain move
    const moves = checkersLegalMoves(g(board, {mustContinueFrom: 6 * 8 + 1}))
    expect(moves.every(m => m.from === 6 * 8 + 1)).toBe(true)
    expect(moves.every(m => m.captures?.length === 1)).toBe(true)
  })
})

describe('movableFroms', () => {
  it('is empty for no moves', () => {
    expect(movableFroms([])).toEqual([])
  })

  it('deduplicates squares with several destinations', () => {
    const moves = checkersLegalMoves(
      g(
        (() => {
          const board = empty()
          board[4 * 8 + 3] = man(0) // two forward steps → one distinct from
          return board
        })(),
      ),
    )
    expect(moves).toHaveLength(2)
    expect(movableFroms(moves)).toEqual([4 * 8 + 3])
  })

  it('in the opening, only the front row can move', () => {
    const G = initialCheckersG()
    const froms = movableFroms(checkersLegalMoves(G))
    // Player 0's front row is row 5 (dark squares 40/42/44/46).
    expect(froms.sort((x, y) => x - y)).toEqual([40, 42, 44, 46])
  })

  it('narrows to the capturing piece when a capture is forced', () => {
    const board = empty()
    board[4 * 8 + 3] = man(0) // can capture
    board[3 * 8 + 4] = man(1) // the victim; landing (2,5) empty
    board[6 * 8 + 1] = man(0) // has plain steps, but captures are forced
    const moves = checkersLegalMoves(g(board))
    expect(movableFroms(moves)).toEqual([4 * 8 + 3])
  })

  it('mid multi-jump only the continuing piece is movable', () => {
    const board = empty()
    board[6 * 8 + 1] = man(0)
    board[5 * 8 + 2] = man(1)
    board[3 * 8 + 4] = man(1)
    const moves = checkersLegalMoves(g(board, {mustContinueFrom: 6 * 8 + 1}))
    expect(movableFroms(moves)).toEqual([6 * 8 + 1])
  })
})

describe('capturesAreForced', () => {
  it('is false for no moves and for plain-step positions', () => {
    expect(capturesAreForced([])).toBe(false)
    expect(capturesAreForced(checkersLegalMoves(initialCheckersG()))).toBe(
      false,
    )
  })

  it('is true when the rules return only captures', () => {
    const board = empty()
    board[4 * 8 + 3] = man(0)
    board[3 * 8 + 4] = man(1)
    board[6 * 8 + 1] = man(0) // its plain steps are suppressed by the rule
    expect(capturesAreForced(checkersLegalMoves(g(board)))).toBe(true)
  })

  it('is true mid multi-jump (continuation hops are captures)', () => {
    const board = empty()
    board[6 * 8 + 1] = man(0)
    board[5 * 8 + 2] = man(1)
    board[3 * 8 + 4] = man(1)
    const moves = checkersLegalMoves(g(board, {mustContinueFrom: 6 * 8 + 1}))
    expect(capturesAreForced(moves)).toBe(true)
  })

  it('treats an empty captures array as not a capture', () => {
    expect(capturesAreForced([{from: 40, to: 33, captures: []}])).toBe(false)
  })
})

describe('applyCheckersMove', () => {
  it('rejects hops that are not in the legal set', () => {
    const G = initialCheckersG()
    expect(applyCheckersMove(G, 0, 9)).toBeNull() // empty square
    expect(applyCheckersMove(G, 41, 41)).toBeNull() // no-op
    // Player 1 piece while it is player 0's turn:
    expect(applyCheckersMove(G, 17, 24)).toBeNull()
  })

  it('applies a step and passes the turn', () => {
    const G = initialCheckersG()
    const from = 5 * 8 + 2 // a player-0 front man
    const to = 4 * 8 + 3
    const next = applyCheckersMove(G, from, to)!
    expect(next.board[from]).toBeNull()
    expect(next.board[to]).toEqual(man(0))
    expect(next.currentPlayer).toBe('1')
    expect(next.mustContinueFrom).toBeNull()
  })

  it('removes the jumped piece and continues a multi-jump with the SAME player', () => {
    const board = empty()
    board[6 * 8 + 1] = man(0)
    board[5 * 8 + 2] = man(1)
    board[3 * 8 + 4] = man(1)
    const next = applyCheckersMove(g(board), 6 * 8 + 1, 4 * 8 + 3)!
    expect(next.board[5 * 8 + 2]).toBeNull()
    expect(next.board[4 * 8 + 3]).toEqual(man(0))
    // Second jump over (3,4) is available → same player must continue.
    expect(next.currentPlayer).toBe('0')
    expect(next.mustContinueFrom).toBe(4 * 8 + 3)
    const done = applyCheckersMove(next, 4 * 8 + 3, 2 * 8 + 5)!
    expect(done.board[3 * 8 + 4]).toBeNull()
    expect(done.currentPlayer).toBe('1')
    expect(done.mustContinueFrom).toBeNull()
  })

  it('kings a man on the back rank and ENDS the capture sequence', () => {
    const board = empty()
    board[2 * 8 + 1] = man(0)
    board[1 * 8 + 2] = man(1)
    board[1 * 8 + 4] = man(1) // would offer a continuation if kinging did not end it
    const next = applyCheckersMove(g(board), 2 * 8 + 1, 0 * 8 + 3)!
    expect(next.board[0 * 8 + 3]).toEqual(king(0))
    expect(next.board[1 * 8 + 2]).toBeNull()
    expect(next.currentPlayer).toBe('1')
    expect(next.mustContinueFrom).toBeNull()
  })
})

describe('checkersGameover', () => {
  it('is null while the side to move has moves', () => {
    expect(checkersGameover(initialCheckersG())).toBeNull()
  })

  it('the side to move with no pieces loses', () => {
    const board = empty()
    board[4 * 8 + 3] = man(1)
    expect(checkersGameover(g(board, {currentPlayer: '0'}))).toEqual({
      winner: '1',
    })
  })

  it('the side to move with pieces but no moves loses', () => {
    // Player 0 man trapped in the corner (0,7)... use (7,0)-adjacent block:
    const board = empty()
    board[0 * 8 + 7] = man(0) // on the back rank, can only move down — men cannot
    board[1 * 8 + 6] = man(1)
    board[2 * 8 + 5] = man(1) // jumping (1,6) lands on (2,5) — occupied
    expect(checkersGameover(g(board, {currentPlayer: '0'}))).toEqual({
      winner: '1',
    })
  })
})
