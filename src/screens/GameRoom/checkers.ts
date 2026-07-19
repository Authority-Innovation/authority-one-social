/**
 * Pure checkers (English draughts) game model. PURE + unit-tested — no React,
 * no transport.
 *
 * Mirrors the wire shape the runtime's GameMatchDO checkers game produces so
 * the mock client and the live transport hand the screen identical state:
 * `board` is a length-64 array indexed row*8+col with ROW 0 AT THE TOP; each
 * occupied square holds {player, king}. Player 0 sits at the BOTTOM (moves up,
 * decreasing row), player 1 at the TOP (moves down).
 *
 * The move generator exists for the MOCK transport (hot-seat dev board) — a
 * live match takes `legalMoves` from the server's state frame and never runs
 * these rules locally. Rules: men move diagonally forward, kings one step any
 * diagonal, captures jump an adjacent enemy into the empty square beyond,
 * captures are FORCED when available, multi-jumps must continue with the same
 * piece, and kinging ends a capture sequence.
 */
import {type PlayerID} from './tictactoe'

export interface CheckersPiece {
  player: 0 | 1
  king: boolean
}

export type CheckersCell = CheckersPiece | null

/** One hop. `captures` holds the jumped square's index when it's a jump. */
export interface CheckersMove {
  from: number
  to: number
  captures?: number[]
}

/** Game state (`G` in the wire contract, minus server-computed legalMoves). */
export interface CheckersG {
  board: CheckersCell[]
  currentPlayer: PlayerID
  /** Mid multi-jump: the square whose piece MUST capture again, else null. */
  mustContinueFrom: number | null
}

export const CHECKERS_BOARD_SIZE = 64

const rowOf = (i: number) => Math.floor(i / 8)
const colOf = (i: number) => i % 8

/** Pieces sit on the dark squares: (row + col) odd, with row 0 at the top. */
export function isDarkSquare(i: number): boolean {
  return (rowOf(i) + colOf(i)) % 2 === 1
}

/** Standard opening position: player 1 on rows 0-2, player 0 on rows 5-7. */
export function initialCheckersG(): CheckersG {
  const board: CheckersCell[] = Array(CHECKERS_BOARD_SIZE).fill(null)
  for (let i = 0; i < CHECKERS_BOARD_SIZE; i++) {
    if (!isDarkSquare(i)) continue
    const row = rowOf(i)
    if (row <= 2) board[i] = {player: 1, king: false}
    if (row >= 5) board[i] = {player: 0, king: false}
  }
  return {board, currentPlayer: '0', mustContinueFrom: null}
}

/** Diagonal row-directions this piece may travel (kings go both ways). */
function rowDirsOf(piece: CheckersPiece): number[] {
  if (piece.king) return [-1, 1]
  // Player 0 starts at the bottom and advances up the board.
  return piece.player === 0 ? [-1] : [1]
}

const inBounds = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8

function capturesFrom(board: CheckersCell[], from: number): CheckersMove[] {
  const piece = board[from]
  if (!piece) return []
  const moves: CheckersMove[] = []
  const r = rowOf(from)
  const c = colOf(from)
  for (const dr of rowDirsOf(piece)) {
    for (const dc of [-1, 1]) {
      const mr = r + dr
      const mc = c + dc
      const lr = r + 2 * dr
      const lc = c + 2 * dc
      if (!inBounds(lr, lc)) continue
      const mid = board[mr * 8 + mc]
      if (mid && mid.player !== piece.player && board[lr * 8 + lc] === null) {
        moves.push({from, to: lr * 8 + lc, captures: [mr * 8 + mc]})
      }
    }
  }
  return moves
}

function stepsFrom(board: CheckersCell[], from: number): CheckersMove[] {
  const piece = board[from]
  if (!piece) return []
  const moves: CheckersMove[] = []
  const r = rowOf(from)
  const c = colOf(from)
  for (const dr of rowDirsOf(piece)) {
    for (const dc of [-1, 1]) {
      const nr = r + dr
      const nc = c + dc
      if (inBounds(nr, nc) && board[nr * 8 + nc] === null) {
        moves.push({from, to: nr * 8 + nc})
      }
    }
  }
  return moves
}

/**
 * Every legal hop for the side to move. Captures are forced: when any capture
 * exists only captures are returned, and mid multi-jump only the continuing
 * piece's captures are.
 */
export function checkersLegalMoves(G: CheckersG): CheckersMove[] {
  if (G.mustContinueFrom !== null) {
    return capturesFrom(G.board, G.mustContinueFrom)
  }
  const player = Number(G.currentPlayer) as 0 | 1
  const mine: number[] = []
  for (let i = 0; i < G.board.length; i++) {
    if (G.board[i]?.player === player) mine.push(i)
  }
  const captures = mine.flatMap(i => capturesFrom(G.board, i))
  if (captures.length > 0) return captures
  return mine.flatMap(i => stepsFrom(G.board, i))
}

/**
 * The distinct squares that have at least one legal move — i.e. the pieces
 * the side to move may actually pick up. With forced captures this is often
 * a small subset of their pieces; the board dims everything else so the
 * player can see at a glance what is playable. PURE.
 */
export function movableFroms(legalMoves: CheckersMove[]): number[] {
  const froms: number[] = []
  for (const m of legalMoves) {
    if (!froms.includes(m.from)) froms.push(m.from)
  }
  return froms
}

/**
 * True when every legal move is a capture (and there is at least one move) —
 * the forced-capture rule in effect. The UI must SAY so: a player whose
 * tapped piece has no moves otherwise reads the board as frozen. PURE.
 */
export function capturesAreForced(legalMoves: CheckersMove[]): boolean {
  return (
    legalMoves.length > 0 &&
    legalMoves.every(m => (m.captures?.length ?? 0) > 0)
  )
}

/**
 * Apply a from/to hop for the side to move. Returns the next G, or null when
 * the hop is not among the current legal moves — the caller drops invalid
 * moves exactly like the authoritative server will. Handles kinging (which
 * ends a capture sequence) and multi-jump continuation (same player keeps the
 * turn with `mustContinueFrom` set).
 */
export function applyCheckersMove(
  G: CheckersG,
  from: number,
  to: number,
): CheckersG | null {
  const move = checkersLegalMoves(G).find(m => m.from === from && m.to === to)
  if (!move) return null
  const piece = G.board[from]!
  const board = [...G.board]
  board[from] = null
  for (const cap of move.captures ?? []) board[cap] = null
  const backRank = piece.player === 0 ? 0 : 7
  const kinged = !piece.king && rowOf(to) === backRank
  board[to] = kinged ? {...piece, king: true} : piece
  const continuing =
    !!move.captures?.length && !kinged && capturesFrom(board, to).length > 0
  if (continuing) {
    return {board, currentPlayer: G.currentPlayer, mustContinueFrom: to}
  }
  return {
    board,
    currentPlayer: G.currentPlayer === '0' ? '1' : '0',
    mustContinueFrom: null,
  }
}

/** Terminal state: the side to move losing all moves (or pieces) loses. */
export function checkersGameover(G: CheckersG): {winner: PlayerID} | null {
  if (checkersLegalMoves(G).length > 0) return null
  return {winner: G.currentPlayer === '0' ? '1' : '0'}
}
