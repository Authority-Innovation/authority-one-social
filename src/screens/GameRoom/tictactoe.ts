/**
 * Pure tic-tac-toe game model. PURE + unit-tested — no React, no transport.
 *
 * This mirrors the shape the runtime's GameMatchDO reducer produces so the
 * mock client and the live WebSocket transport hand the screen identical
 * state: `G` carries the 9-cell board plus whose turn it is, and gameover is
 * derived from the board. Cells hold the OWNING PLAYER's id ('0' | '1'),
 * not marks — the UI maps player id to X/O for display.
 */

/** boardgame.io-style player ids for a two-player match. */
export type PlayerID = '0' | '1'

/** One cell: the player who placed there, or null while empty. */
export type Cell = PlayerID | null

/** Game state (`G` in the wire contract): 9 cells row-major + current player. */
export interface TicTacToeG {
  board: Cell[]
  currentPlayer: PlayerID
}

/** Terminal result: the winning player's id, or null for a draw. */
export interface GameoverInfo {
  winner: PlayerID | null
}

export const EMPTY_BOARD: Cell[] = Array(9).fill(null)

export function initialG(): TicTacToeG {
  return {board: [...EMPTY_BOARD], currentPlayer: '0'}
}

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const

/** The winning player on this board, or null if no line is complete. */
export function winnerOf(board: Cell[]): PlayerID | null {
  for (const [x, y, z] of WIN_LINES) {
    const v = board[x]
    if (v !== null && v === board[y] && v === board[z]) return v
  }
  return null
}

export function isDraw(board: Cell[]): boolean {
  return winnerOf(board) === null && board.every(c => c !== null)
}

/** Terminal state of this board, or null while the game is still live. */
export function gameoverOf(board: Cell[]): GameoverInfo | null {
  const winner = winnerOf(board)
  if (winner !== null) return {winner}
  if (isDraw(board)) return {winner: null}
  return null
}

/**
 * Apply a "place" move. Returns the next G, or null when the move is invalid
 * (out of range, cell taken, out of turn, or game already over) — the caller
 * drops invalid moves exactly like the authoritative server will.
 */
export function applyPlace(
  G: TicTacToeG,
  playerID: PlayerID,
  cell: number,
): TicTacToeG | null {
  if (!Number.isInteger(cell) || cell < 0 || cell > 8) return null
  if (playerID !== G.currentPlayer) return null
  if (G.board[cell] !== null) return null
  if (gameoverOf(G.board) !== null) return null
  const board = [...G.board]
  board[cell] = playerID
  return {board, currentPlayer: playerID === '0' ? '1' : '0'}
}
