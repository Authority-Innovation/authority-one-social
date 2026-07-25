import {describe, expect, it} from '@jest/globals'

import {
  algToSq,
  applyChessMove,
  buildFen,
  INITIAL_FEN,
  isKingAttacked,
  parseFen,
  pieceGlyph,
  pseudoLegalMoves,
  sqToAlg,
} from '../chess'

describe('square algebra', () => {
  it('round-trips algebraic squares (a8 = index 0, h1 = 63)', () => {
    expect(algToSq('a8')).toBe(0)
    expect(algToSq('h1')).toBe(63)
    expect(algToSq('e2')).toBe(6 * 8 + 4)
    expect(sqToAlg(0)).toBe('a8')
    expect(sqToAlg(63)).toBe('h1')
    for (let i = 0; i < 64; i++) expect(algToSq(sqToAlg(i))).toBe(i)
    expect(algToSq('z9')).toBeNull()
    expect(algToSq('e')).toBeNull()
  })
})

describe('parseFen / buildFen', () => {
  it('parses the initial position', () => {
    const {squares, active} = parseFen(INITIAL_FEN)
    expect(active).toBe('w')
    expect(squares[algToSq('e1')!]).toEqual({color: 'w', type: 'k'})
    expect(squares[algToSq('d8')!]).toEqual({color: 'b', type: 'q'})
    expect(squares[algToSq('e2')!]).toEqual({color: 'w', type: 'p'})
    expect(squares[algToSq('e4')!]).toBeNull()
    expect(squares.filter(Boolean)).toHaveLength(32)
  })

  it('round-trips through buildFen', () => {
    const {squares, active} = parseFen(INITIAL_FEN)
    expect(buildFen(squares, active)).toBe(INITIAL_FEN.replace('KQkq', '-'))
  })

  it('is defensive about malformed FEN', () => {
    expect(parseFen('').squares.every(s => s === null)).toBe(true)
    expect(parseFen('garbage').active).toBe('w')
  })

  it('uses the solid glyph shapes for both colors', () => {
    // Color comes from fill + outline styling, not the glyph: the hollow
    // "white" set is illegible on light squares.
    expect(pieceGlyph({color: 'w', type: 'k'})).toBe('♚')
    expect(pieceGlyph({color: 'b', type: 'k'})).toBe('♚')
    // The pawn carries U+FE0E (text presentation): bare U+265F is the one
    // chess glyph that defaults to EMOJI presentation and ignores text color.
    expect(pieceGlyph({color: 'w', type: 'p'})).toBe('♟︎')
    expect(pieceGlyph({color: 'b', type: 'p'})).toBe('♟︎')
  })
})

describe('pseudoLegalMoves (mock-only rules)', () => {
  it('generates 20 opening moves for white', () => {
    const {squares} = parseFen(INITIAL_FEN)
    const moves = pseudoLegalMoves(squares, 'w')
    expect(moves).toHaveLength(20) // 16 pawn + 4 knight
    expect(moves).toContainEqual({from: 'e2', to: 'e4'})
    expect(moves).toContainEqual({from: 'g1', to: 'f3'})
  })

  it('pawns capture diagonally and promote with four choices', () => {
    const {squares} = parseFen('8/P7/8/8/8/8/8/k6K w - - 0 1')
    const moves = pseudoLegalMoves(squares, 'w').filter(m => m.from === 'a7')
    expect(moves.map(m => m.promotion).sort()).toEqual(['b', 'n', 'q', 'r'])
    expect(moves.every(m => m.to === 'a8')).toBe(true)
  })

  it('sliding pieces stop at blockers and capture enemies', () => {
    const {squares} = parseFen('8/8/8/3r4/8/3P4/8/k6K b - - 0 1')
    const rook = pseudoLegalMoves(squares, 'b').filter(m => m.from === 'd5')
    expect(rook).toContainEqual({from: 'd5', to: 'd3'}) // captures the pawn
    expect(rook.some(m => m.to === 'd2')).toBe(false) // cannot pass through
  })
})

describe('applyChessMove / isKingAttacked', () => {
  it('moves a piece, toggles the active color, and promotes', () => {
    const {squares, active} = parseFen('8/P7/8/8/8/8/8/k6K w - - 0 1')
    const next = applyChessMove(squares, active, {
      from: 'a7',
      to: 'a8',
      promotion: 'q',
    })!
    expect(next.squares[algToSq('a8')!]).toEqual({color: 'w', type: 'q'})
    expect(next.squares[algToSq('a7')!]).toBeNull()
    expect(next.active).toBe('b')
    expect(next.capturedKing).toBe(false)
    // The fresh queen checks the black king on a1.
    expect(isKingAttacked(next.squares, 'b')).toBe(true)
    expect(isKingAttacked(next.squares, 'w')).toBe(false)
  })

  it('reports a captured king (the mock terminal condition)', () => {
    const {squares, active} = parseFen('8/8/8/8/8/8/8/kQ5K w - - 0 1')
    const next = applyChessMove(squares, active, {from: 'b1', to: 'a1'})!
    expect(next.capturedKing).toBe(true)
  })

  it('rejects malformed and out-of-turn moves', () => {
    const {squares} = parseFen(INITIAL_FEN)
    expect(applyChessMove(squares, 'w', {from: 'zz', to: 'e4'})).toBeNull()
    expect(applyChessMove(squares, 'w', {from: 'e7', to: 'e5'})).toBeNull()
    expect(applyChessMove(squares, 'w', {from: 'e4', to: 'e5'})).toBeNull()
  })
})
