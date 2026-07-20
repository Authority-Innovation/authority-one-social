/**
 * Pure Connect Four game model. PURE + unit-tested — no React, no transport.
 *
 * Mirrors the wire shape the runtime's GameMatchDO connect-four game produces
 * (pilot-agent-runtime/GAMES.md) so the mock client and the live transport
 * hand the screen identical state: `board` is a length-42 array indexed
 * row*7+col with ROW 0 AT THE TOP (6 rows x 7 columns); each filled cell
 * holds the SEAT NUMBER (0 | 1) of the disc's owner. Discs drop down a
 * column and land in the lowest empty row (the largest row index).
 *
 * The move generator exists for the MOCK transport (hot-seat dev board) — a
 * live match takes `legalMoves` from the server's state frame and never runs
 * these rules locally. Moves are just columns: {col}.
 */
import {type PlayerID} from './tictactoe'

/** One cell: the seat (0 | 1) owning the disc, or null while empty. */
export type ConnectFourCell = 0 | 1 | null

/** One legal move: a column that still has room. */
export interface ConnectFourMove {
  col: number
}

/** Game state (`G` in the wire contract, minus server-computed legalMoves). */
export interface ConnectFourG {
  board: ConnectFourCell[]
  currentPlayer: PlayerID
  /** The most recent drop's landing cell, or null before the first move. */
  lastMove: {row: number; col: number} | null
  /** The four winning cell indices once somebody connects, else null. */
  winningLine: number[] | null
}

export const C4_COLS = 7
export const C4_ROWS = 6
export const CONNECT_FOUR_BOARD_SIZE = C4_COLS * C4_ROWS

export function initialConnectFourG(): ConnectFourG {
  return {
    board: Array(CONNECT_FOUR_BOARD_SIZE).fill(null),
    currentPlayer: '0',
    lastMove: null,
    winningLine: null,
  }
}

/**
 * The row a disc dropped into `col` lands in — the LOWEST empty row (row 0 is
 * the top, so that is the largest empty row index) — or null when the column
 * is full. Gravity guarantees no gaps, so the first empty cell scanning up
 * from the bottom is the landing spot. PURE.
 */
export function landingRow(
  board: ConnectFourCell[],
  col: number,
): number | null {
  if (!Number.isInteger(col) || col < 0 || col >= C4_COLS) return null
  for (let row = C4_ROWS - 1; row >= 0; row--) {
    if (board[row * C4_COLS + col] === null) return row
  }
  return null
}

/** Every column with room, for the side to move. Empty once the game is won. */
export function connectFourLegalMoves(G: ConnectFourG): ConnectFourMove[] {
  if (G.winningLine !== null) return []
  const moves: ConnectFourMove[] = []
  for (let col = 0; col < C4_COLS; col++) {
    if (landingRow(G.board, col) !== null) moves.push({col})
  }
  return moves
}

/**
 * The set of playable columns, derived from the state frame's `legalMoves` —
 * the UI's ONE source of column legality (server-computed live, rules above
 * in the mock), used to dim full columns and explain dead taps. PURE,
 * defensive against malformed wire entries.
 */
export function legalColSet(legalMoves: ConnectFourMove[]): Set<number> {
  const cols = new Set<number>()
  for (const m of legalMoves) {
    if (Number.isInteger(m?.col) && m.col >= 0 && m.col < C4_COLS) {
      cols.add(m.col)
    }
  }
  return cols
}

const DIRECTIONS = [
  [0, 1], // right
  [1, 0], // down
  [1, 1], // down-right
  [1, -1], // down-left
] as const

/** The first four-in-a-row on this board (cell indices), or null. PURE. */
export function findWinningLine(board: ConnectFourCell[]): number[] | null {
  for (let row = 0; row < C4_ROWS; row++) {
    for (let col = 0; col < C4_COLS; col++) {
      const v = board[row * C4_COLS + col]
      if (v === null || v === undefined) continue
      for (const [dr, dc] of DIRECTIONS) {
        const line = [row * C4_COLS + col]
        for (let k = 1; k < 4; k++) {
          const r = row + dr * k
          const c = col + dc * k
          if (r < 0 || r >= C4_ROWS || c < 0 || c >= C4_COLS) break
          if (board[r * C4_COLS + c] !== v) break
          line.push(r * C4_COLS + c)
        }
        if (line.length === 4) return line
      }
    }
  }
  return null
}

/**
 * Apply a drop for the side to move. Returns the next G, or null when the
 * drop is invalid (bad column, column full, or game already over) — the
 * caller drops invalid moves exactly like the authoritative server will.
 */
export function applyConnectFourDrop(
  G: ConnectFourG,
  col: number,
): ConnectFourG | null {
  if (G.winningLine !== null) return null
  const row = landingRow(G.board, col)
  if (row === null) return null
  const board = [...G.board]
  board[row * C4_COLS + col] = Number(G.currentPlayer) as 0 | 1
  return {
    board,
    currentPlayer: G.currentPlayer === '0' ? '1' : '0',
    lastMove: {row, col},
    winningLine: findWinningLine(board),
  }
}

/** Terminal state: the winning line's owner, or a draw on a full board. */
export function connectFourGameover(
  G: ConnectFourG,
): {winner: PlayerID | null} | null {
  if (G.winningLine !== null) {
    const owner = G.board[G.winningLine[0]]
    return {winner: owner === 1 ? '1' : '0'}
  }
  if (G.board.every(c => c !== null)) return {winner: null}
  return null
}
