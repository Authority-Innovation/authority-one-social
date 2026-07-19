import {useState} from 'react'
import {Pressable, type TextStyle, View} from 'react-native'

import {atoms as a, useTheme, web} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Text} from '#/components/Typography'
import {
  algToSq,
  type ChessColor,
  type ChessG,
  type ChessMove,
  type ChessPieceType,
  parseFen,
  pieceGlyph,
  PROMOTION_PIECES,
  sqToAlg,
} from '../chess'
import {type GameCtx, type PlayerInfo} from '../gameClient'
import {useFlashHint} from './useFlashHint'

/** Fixed board colors (independent of app theme) so the glyphs always read. */
const DARK_SQUARE = '#739552'
const LIGHT_SQUARE = '#ebecd0'
const LAST_MOVE_TINT = 'rgba(255, 255, 0, 0.4)'
const SELECT_TINT = 'rgba(255, 255, 0, 0.55)'
const CHECK_TINT = 'rgba(220, 40, 40, 0.55)'

/**
 * Both colors render the same solid glyph shapes (see GLYPHS in chess.ts), so
 * color must come entirely from fill + a contrasting halo outline. The halo is
 * a ring of offset text shadows on web (RN's single textShadow cannot outline);
 * native keeps the single-shadow fallback.
 */
function pieceStyle(color: ChessColor, size: number): TextStyle[] {
  const white = color === 'w'
  const fill = white ? '#f8f8f8' : '#1a1a1a'
  const halo = white ? 'rgba(20, 20, 20, 0.9)' : 'rgba(248, 248, 248, 0.75)'
  const o = Math.max(1, Math.round(size * 0.045))
  return [
    {
      fontSize: size * 0.72,
      lineHeight: size * 0.95,
      color: fill,
      textShadowColor: halo,
      textShadowOffset: {width: 0, height: 0},
      textShadowRadius: 3,
    },
    web({
      textShadow: [
        `-${o}px -${o}px 1px ${halo}`,
        `${o}px -${o}px 1px ${halo}`,
        `-${o}px ${o}px 1px ${halo}`,
        `${o}px ${o}px 1px ${halo}`,
        `0 -${o}px 1px ${halo}`,
        `0 ${o}px 1px ${halo}`,
        `-${o}px 0 1px ${halo}`,
        `${o}px 0 1px ${halo}`,
      ].join(', '),
    }),
  ]
}

/** Seat '0' plays white, seat '1' black. */
const colorOfSeat = (seat: string | null): ChessColor | null =>
  seat === '0' ? 'w' : seat === '1' ? 'b' : null

/**
 * The tappable chess board plus status line. Purely presentational: the FEN
 * in the state frame is the whole board, destinations come from the frame's
 * `legalMoves` (server-computed live, pseudo-legal in the mock), and taps
 * report a from/to (+ promotion) move up — full rules never run here. When a
 * destination is a promotion (several legalMoves entries same from/to) a tiny
 * picker overlays the board, queen first. Last move and check highlight.
 * Strings are plain literals — custom (non-Bluesky) surface, no Lingui.
 */
export function ChessBoard({
  G,
  ctx,
  players,
  seat,
  hotSeat = false,
  boardSize,
  onMove,
  onNewGame,
}: {
  G: ChessG & {legalMoves: ChessMove[]}
  ctx: GameCtx
  players: PlayerInfo[]
  /** The seat this client holds (null = spectating). */
  seat: string | null
  /** Mock hot-seat: taps act for whichever color's turn it is. */
  hotSeat?: boolean
  /** Rendered edge length of the square board, in px. */
  boardSize: number
  onMove: (from: string, to: string, promotion?: string) => void
  onNewGame?: () => void
}) {
  const t = useTheme()
  const [selected, setSelected] = useState<number | null>(null)
  const {hint, flashHint} = useFlashHint()
  const [promotionChoice, setPromotionChoice] = useState<{
    from: string
    to: string
  } | null>(null)

  const {squares, active} = parseFen(G.fen)
  const over = ctx.gameover ?? null
  // NEVER render a raw seat id ("1 is thinking…"): an unfilled seat gets its
  // own truthful status below; any other unnamed seat reads as "Player N".
  const seatFilled = (id: string) => players.some(p => p.id === id)
  const nameOf = (id: string) =>
    players.find(p => p.id === id)?.name ?? `Player ${Number(id) + 1}`

  const myColor = colorOfSeat(seat)
  const myTurn = hotSeat || (myColor !== null && myColor === active)
  const interactive = over === null && myTurn
  const actingColor: ChessColor = hotSeat ? active : (myColor ?? active)

  const destinations =
    interactive && selected !== null
      ? G.legalMoves.filter(m => m.from === sqToAlg(selected))
      : []

  const lastFrom = G.lastMove ? algToSq(G.lastMove.from) : null
  const lastTo = G.lastMove ? algToSq(G.lastMove.to) : null
  // Check marks the side to move's king.
  let checkedKingSq: number | null = null
  if (G.check && over === null) {
    for (let i = 0; i < 64; i++) {
      const p = squares[i]
      if (p?.type === 'k' && p.color === active) checkedKingSq = i
    }
  }

  // "You" gets its own grammar ("Your turn", "You win") — the viewer's row in
  // the mock roster is literally named that when signed out.
  const isYou = (id: string) =>
    (seat === id && !hotSeat) || nameOf(id) === 'You'
  const status = over
    ? over.winner !== null
      ? isYou(over.winner)
        ? 'You win!'
        : `${nameOf(over.winner)} wins!`
      : "It's a draw."
    : `${
        !seatFilled(ctx.currentPlayer)
          ? // The turn sits on a seat NOBODY holds — say so; implying a
            // nonexistent opponent is "thinking" hides a hung match.
            'Waiting for a player to join'
          : isYou(ctx.currentPlayer)
            ? 'Your turn'
            : seat !== null && !myTurn
              ? `${nameOf(ctx.currentPlayer)} is thinking…`
              : `${nameOf(ctx.currentPlayer)}'s turn`
      } — ${active === 'w' ? 'white' : 'black'}${G.check ? ' — check!' : ''}`

  const onSquarePress = (i: number) => {
    if (over !== null) return
    if (!myTurn) {
      flashHint(
        seat === null
          ? 'You’re watching this match'
          : !seatFilled(ctx.currentPlayer)
            ? 'No opponent yet — waiting for someone to join'
            : `Waiting for ${nameOf(ctx.currentPlayer)} — it’s their turn`,
      )
      return
    }
    setPromotionChoice(null)
    const alg = sqToAlg(i)
    const dests = destinations.filter(m => m.to === alg)
    if (selected !== null && dests.length > 0) {
      if (dests.some(m => m.promotion)) {
        // Several wire moves share this from/to (one per promotion piece):
        // let the player pick which piece the pawn becomes.
        setPromotionChoice({from: dests[0].from, to: alg})
      } else {
        onMove(dests[0].from, alg)
      }
      setSelected(null)
      return
    }
    const piece = squares[i]
    if (piece && piece.color === actingColor) {
      // A piece with zero entries in legalMoves (blocked, or pinned on the
      // live server) must not fail silently — say why the tap did nothing.
      if (!G.legalMoves.some(m => m.from === alg)) {
        flashHint(
          G.check
            ? 'That piece can’t help — you must get out of check'
            : 'That piece has no legal moves right now',
        )
        setSelected(null)
        return
      }
      setSelected(i === selected ? null : i)
    } else {
      setSelected(null)
    }
  }

  const onPromote = (piece: ChessPieceType) => {
    if (!promotionChoice) return
    onMove(promotionChoice.from, promotionChoice.to, piece)
    setPromotionChoice(null)
  }

  const cellSize = Math.floor(boardSize / 8)

  return (
    <View style={[a.align_center, a.gap_sm]}>
      <Text
        testID="gameStatus"
        style={[a.text_lg, a.font_bold, t.atoms.text]}
        accessibilityLiveRegion="polite">
        {status}
      </Text>

      {/* Fixed-height subline so hints never shift the board mid-play. */}
      <View style={[a.align_center, a.justify_center, {minHeight: 20}]}>
        {hint ? (
          <Text
            testID="boardHint"
            style={[a.text_sm, a.font_bold, {color: t.palette.negative_500}]}
            accessibilityLiveRegion="polite">
            {hint}
          </Text>
        ) : null}
      </View>

      <View
        style={[
          a.rounded_md,
          a.overflow_hidden,
          a.border,
          t.atoms.border_contrast_medium,
          {width: cellSize * 8, height: cellSize * 8},
        ]}>
        {Array.from({length: 8}, (_, row) => (
          <View key={row} style={[a.flex_row]}>
            {Array.from({length: 8}, (_, col) => {
              const i = row * 8 + col
              const piece = squares[i]
              const dark = (row + col) % 2 === 1
              const alg = sqToAlg(i)
              const isSelected = selected === i && piece !== null
              const isDest = destinations.some(m => m.to === alg)
              const tint =
                checkedKingSq === i
                  ? CHECK_TINT
                  : isSelected
                    ? SELECT_TINT
                    : lastFrom === i || lastTo === i
                      ? LAST_MOVE_TINT
                      : null
              return (
                <Pressable
                  key={i}
                  testID={`ch-sq-${alg}`}
                  accessibilityRole="button"
                  accessibilityLabel={
                    piece
                      ? `${alg}, ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}`
                      : `${alg}, empty`
                  }
                  accessibilityHint="Selects a piece or moves the selected piece here"
                  disabled={over !== null}
                  onPress={() => onSquarePress(i)}
                  style={[
                    a.align_center,
                    a.justify_center,
                    {
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: dark ? DARK_SQUARE : LIGHT_SQUARE,
                    },
                  ]}>
                  {tint ? (
                    <View
                      style={[a.absolute, a.inset_0, {backgroundColor: tint}]}
                    />
                  ) : null}
                  {piece ? (
                    <Text style={pieceStyle(piece.color, cellSize)}>
                      {pieceGlyph(piece)}
                    </Text>
                  ) : isDest ? (
                    <View
                      testID={`ch-dest-${alg}`}
                      style={{
                        width: cellSize * 0.3,
                        height: cellSize * 0.3,
                        borderRadius: cellSize * 0.15,
                        backgroundColor: 'rgba(20, 20, 20, 0.35)',
                      }}
                    />
                  ) : null}
                </Pressable>
              )
            })}
          </View>
        ))}
      </View>

      {promotionChoice ? (
        <View
          testID="promotionPicker"
          style={[
            a.flex_row,
            a.align_center,
            a.gap_sm,
            a.px_md,
            a.py_sm,
            a.rounded_md,
            a.border,
            t.atoms.border_contrast_medium,
            t.atoms.bg,
          ]}>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            Promote to
          </Text>
          {PROMOTION_PIECES.map(p => (
            <Pressable
              key={p}
              testID={`promote-${p}`}
              accessibilityRole="button"
              accessibilityLabel={`Promote to ${p}`}
              accessibilityHint="Completes the move, promoting the pawn to this piece"
              onPress={() => onPromote(p)}
              style={[a.px_xs]}>
              <Text style={pieceStyle(actingColor, 40)}>
                {pieceGlyph({color: actingColor, type: p})}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {onNewGame == null ? null : over ? (
        <Button
          testID="newGameBtn"
          label="New game"
          color="primary"
          size="small"
          onPress={onNewGame}>
          <ButtonText>New game</ButtonText>
        </Button>
      ) : (
        <Button
          testID="newGameBtn"
          label="Restart game"
          color="secondary"
          size="small"
          onPress={onNewGame}>
          <ButtonText>Restart</ButtonText>
        </Button>
      )}
    </View>
  )
}
