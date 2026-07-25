/**
 * Pure chess helpers. PURE + unit-tested — no React, no transport.
 *
 * The live wire carries the WHOLE board state as a FEN string plus the
 * server-computed `legalMoves` — so for a live match the client only needs to
 * PARSE FEN for rendering and echo one of the offered moves back. Full rules
 * never run on the client.
 *
 * The pseudo-legal move generator below exists for the MOCK transport only
 * (hot-seat dev board): piece movement, captures, pawn double-steps and
 * promotions — deliberately NO castling, NO en passant, and NO check
 * legality filter (a mock game "ends" when a king is captured). The server
 * remains the sole rules authority in live play.
 *
 * Board indexing everywhere: index 0 = a8 (top-left), row-major to 63 = h1,
 * matching the checkers/tic-tac-toe "row 0 at the top" convention.
 */

export type ChessColor = 'w' | 'b'
export type ChessPieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'

export interface ChessPiece {
  color: ChessColor
  type: ChessPieceType
}

/** One move in algebraic squares, as the wire carries it. */
export interface ChessMove {
  from: string
  to: string
  promotion?: string
}

/** Game state (`G` in the wire contract, minus server-computed legalMoves):
 *  FEN is the whole board, plus render hints for check + last-move. */
export interface ChessG {
  fen: string
  check: boolean
  lastMove: {from: string; to: string} | null
}

export const INITIAL_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const rowOf = (i: number) => Math.floor(i / 8)
const colOf = (i: number) => i % 8

/** 'e2' → board index, or null when malformed. */
export function algToSq(alg: string): number | null {
  if (typeof alg !== 'string' || alg.length !== 2) return null
  const col = alg.charCodeAt(0) - 97 // 'a'
  const rank = alg.charCodeAt(1) - 48 // '1'
  if (col < 0 || col > 7 || rank < 1 || rank > 8) return null
  return (8 - rank) * 8 + col
}

/** Board index → 'e2'. */
export function sqToAlg(i: number): string {
  return `${String.fromCharCode(97 + colOf(i))}${8 - rowOf(i)}`
}

/**
 * FEN → 64 squares + side to move. Defensive: malformed placement fields
 * yield empty squares rather than throwing (the server owns validity).
 */
export function parseFen(fen: string): {
  squares: Array<ChessPiece | null>
  active: ChessColor
} {
  const squares: Array<ChessPiece | null> = Array(64).fill(null)
  const fields = String(fen ?? '').split(/\s+/)
  const ranks = (fields[0] ?? '').split('/')
  for (let r = 0; r < 8; r++) {
    let c = 0
    for (const ch of ranks[r] ?? '') {
      if (c >= 8) break
      if (ch >= '1' && ch <= '8') {
        c += Number(ch)
      } else if (/[pnbrqk]/i.test(ch)) {
        squares[r * 8 + c] = {
          color: ch === ch.toLowerCase() ? 'b' : 'w',
          type: ch.toLowerCase() as ChessPieceType,
        }
        c++
      }
    }
  }
  return {squares, active: fields[1] === 'b' ? 'b' : 'w'}
}

/** Squares + side to move → FEN (placement + active; rest neutral). */
export function buildFen(
  squares: Array<ChessPiece | null>,
  active: ChessColor,
): string {
  const ranks: string[] = []
  for (let r = 0; r < 8; r++) {
    let rank = ''
    let empty = 0
    for (let c = 0; c < 8; c++) {
      const p = squares[r * 8 + c]
      if (!p) {
        empty++
        continue
      }
      if (empty > 0) {
        rank += empty
        empty = 0
      }
      rank += p.color === 'w' ? p.type.toUpperCase() : p.type
    }
    if (empty > 0) rank += empty
    ranks.push(rank)
  }
  return `${ranks.join('/')} ${active} - - 0 1`
}

// Both colors use the SOLID glyph shapes: the hollow "white" set (U+2654-2659)
// has thin strokes and no fill, so it nearly vanishes on light squares.
// Color is conveyed by fill + outline in the board's text styling instead.
// U+265F (pawn) is the ONE chess glyph with default EMOJI presentation, so
// bare it renders as the black-pawn color emoji and ignores the text color;
// U+FE0E (VS-15) forces text presentation so it takes red/blue like the rest.
const SOLID_PAWN = '♟︎'
const GLYPHS: Record<ChessColor, Record<ChessPieceType, string>> = {
  w: {k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: SOLID_PAWN},
  b: {k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: SOLID_PAWN},
}

export function pieceGlyph(piece: ChessPiece): string {
  return GLYPHS[piece.color][piece.type]
}

export const PROMOTION_PIECES: ChessPieceType[] = ['q', 'r', 'b', 'n']

const KNIGHT_DELTAS = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
] as const
const BISHOP_RAYS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const
const ROOK_RAYS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const
const ALL_RAYS = [...BISHOP_RAYS, ...ROOK_RAYS] as const

const inBounds = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8

/** MOCK-ONLY move generation — see the module docblock for what's omitted. */
export function pseudoLegalMoves(
  squares: Array<ChessPiece | null>,
  color: ChessColor,
): ChessMove[] {
  const moves: ChessMove[] = []
  const add = (from: number, to: number, promotes: boolean) => {
    if (promotes) {
      for (const p of PROMOTION_PIECES) {
        moves.push({from: sqToAlg(from), to: sqToAlg(to), promotion: p})
      }
    } else {
      moves.push({from: sqToAlg(from), to: sqToAlg(to)})
    }
  }
  for (let i = 0; i < 64; i++) {
    const piece = squares[i]
    if (!piece || piece.color !== color) continue
    const r = rowOf(i)
    const c = colOf(i)
    if (piece.type === 'p') {
      // White sits at the bottom (high rows) and advances toward row 0.
      const dr = color === 'w' ? -1 : 1
      const startRow = color === 'w' ? 6 : 1
      const lastRow = color === 'w' ? 0 : 7
      const one = (r + dr) * 8 + c
      if (inBounds(r + dr, c) && squares[one] === null) {
        add(i, one, r + dr === lastRow)
        const two = (r + 2 * dr) * 8 + c
        if (r === startRow && squares[two] === null) add(i, two, false)
      }
      for (const dc of [-1, 1]) {
        if (!inBounds(r + dr, c + dc)) continue
        const target = squares[(r + dr) * 8 + c + dc]
        if (target && target.color !== color) {
          add(i, (r + dr) * 8 + c + dc, r + dr === lastRow)
        }
      }
    } else if (piece.type === 'n' || piece.type === 'k') {
      const deltas = piece.type === 'n' ? KNIGHT_DELTAS : ALL_RAYS
      for (const [dr, dc] of deltas) {
        if (!inBounds(r + dr, c + dc)) continue
        const to = (r + dr) * 8 + c + dc
        if (squares[to]?.color !== color) add(i, to, false)
      }
    } else {
      const rays =
        piece.type === 'b'
          ? BISHOP_RAYS
          : piece.type === 'r'
            ? ROOK_RAYS
            : ALL_RAYS
      for (const [dr, dc] of rays) {
        let nr = r + dr
        let nc = c + dc
        while (inBounds(nr, nc)) {
          const to = nr * 8 + nc
          const target = squares[to]
          if (target === null) {
            add(i, to, false)
          } else {
            if (target.color !== color) add(i, to, false)
            break
          }
          nr += dr
          nc += dc
        }
      }
    }
  }
  return moves
}

/** Apply a move for the MOCK. Reports a captured king so the mock can end. */
export function applyChessMove(
  squares: Array<ChessPiece | null>,
  active: ChessColor,
  move: ChessMove,
): {
  squares: Array<ChessPiece | null>
  active: ChessColor
  capturedKing: boolean
} | null {
  const from = algToSq(move.from)
  const to = algToSq(move.to)
  if (from === null || to === null) return null
  const piece = squares[from]
  if (!piece || piece.color !== active) return null
  const capturedKing = squares[to]?.type === 'k'
  const next = [...squares]
  next[from] = null
  next[to] = move.promotion
    ? {color: piece.color, type: move.promotion as ChessPieceType}
    : piece
  return {squares: next, active: active === 'w' ? 'b' : 'w', capturedKing}
}

/** Is `color`'s king pseudo-attacked? Powers the mock's check highlight. */
export function isKingAttacked(
  squares: Array<ChessPiece | null>,
  color: ChessColor,
): boolean {
  let kingSq = -1
  for (let i = 0; i < 64; i++) {
    if (squares[i]?.type === 'k' && squares[i]?.color === color) kingSq = i
  }
  if (kingSq === -1) return false
  const kingAlg = sqToAlg(kingSq)
  return pseudoLegalMoves(squares, color === 'w' ? 'b' : 'w').some(
    m => m.to === kingAlg,
  )
}
