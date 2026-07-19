import {useState} from 'react'
import {Pressable, View} from 'react-native'

import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Text} from '#/components/Typography'
import {
  capturesAreForced,
  type CheckersG,
  type CheckersMove,
  movableFroms,
} from '../checkers'
import {type GameCtx, type PlayerInfo} from '../gameClient'
import {useFlashHint} from './useFlashHint'

/** Fixed board colors (independent of app theme) so the red/black pieces
 *  always read, matching convention for a physical board. */
const DARK_SQUARE = '#b58863'
const LIGHT_SQUARE = '#f0d9b5'
const PIECE_COLORS = ['#c0392b', '#2c3e50'] // player 0 = red, player 1 = black
const SELECT_TINT = 'rgba(255, 255, 0, 0.4)'
const PIECE_BORDER = 'rgba(255,255,255,0.55)'
/** Ring on pieces that MUST move (forced capture / multi-jump continuation). */
const FORCED_RING = '#ffd700'
/** Immovable own pieces fade so the playable ones read at a glance. */
const IMMOVABLE_OPACITY = 0.4

/**
 * The tappable 8x8 checkers board plus status line. Purely presentational:
 * rules never run here — destinations come from the state frame's
 * `legalMoves` (server-computed live, checkers.ts in the mock), and taps
 * report a from/to hop up. Mid multi-jump (`G.mustContinueFrom`) the jumping
 * piece stays force-selected and only its continuation hops highlight.
 * Strings are plain literals — custom (non-Bluesky) surface, no Lingui.
 */
export function CheckersBoard({
  G,
  ctx,
  players,
  seat,
  hotSeat = false,
  boardSize,
  onMove,
  onNewGame,
}: {
  G: CheckersG & {legalMoves: CheckersMove[]}
  ctx: GameCtx
  players: PlayerInfo[]
  /** The seat this client holds (null = spectating). */
  seat: string | null
  /** Mock hot-seat: taps act for whichever player's turn it is. */
  hotSeat?: boolean
  /** Rendered edge length of the square board, in px. */
  boardSize: number
  onMove: (from: number, to: number) => void
  onNewGame?: () => void
}) {
  const t = useTheme()
  const [selected, setSelected] = useState<number | null>(null)
  const {hint, flashHint} = useFlashHint()
  const over = ctx.gameover ?? null
  const nameOf = (id: string) => players.find(p => p.id === id)?.name ?? id

  const myTurn = hotSeat || (seat !== null && seat === ctx.currentPlayer)
  const interactive = over === null && myTurn
  const actingPlayer = Number(ctx.currentPlayer) as 0 | 1
  // Mid multi-jump the continuing piece is force-selected.
  const effectiveSelected = G.mustContinueFrom ?? selected
  const destinations =
    interactive && effectiveSelected !== null
      ? G.legalMoves.filter(m => m.from === effectiveSelected)
      : []

  // What the side to move may actually pick up. With captures forced this is
  // often a small subset — the rest of their pieces legitimately have zero
  // destinations, which without the styling below reads as a frozen board.
  const movable = new Set(movableFroms(G.legalMoves))
  const forcedCapture = capturesAreForced(G.legalMoves)

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
    : G.mustContinueFrom !== null && myTurn
      ? 'Keep jumping!'
      : isYou(ctx.currentPlayer)
        ? 'Your turn'
        : seat !== null && !myTurn
          ? `${nameOf(ctx.currentPlayer)} is thinking…`
          : `${nameOf(ctx.currentPlayer)}'s turn`

  // Persistent one-line guidance under the status; a transient tap hint
  // (why the tap did nothing) takes precedence while it is up. "You" flips
  // to the mover's name in hot-seat, where either player may be up.
  const mover = isYou(ctx.currentPlayer) ? 'You' : nameOf(ctx.currentPlayer)
  const guidance =
    over === null && myTurn
      ? G.mustContinueFrom !== null
        ? 'Keep jumping with the highlighted piece'
        : forcedCapture
          ? movable.size === 1
            ? `${mover} must capture — only the highlighted piece can move`
            : `${mover} must capture`
          : null
      : null

  const onSquarePress = (i: number) => {
    if (over !== null) return
    if (!myTurn) {
      flashHint(
        seat === null
          ? 'You’re watching this match'
          : `Waiting for ${nameOf(ctx.currentPlayer)} — it’s their turn`,
      )
      return
    }
    const dest = destinations.find(m => m.to === i)
    if (effectiveSelected !== null && dest) {
      onMove(dest.from, dest.to)
      setSelected(null)
      return
    }
    // Mid multi-jump the selection cannot leave the jumping piece.
    if (G.mustContinueFrom !== null) {
      if (i !== G.mustContinueFrom) {
        flashHint('Keep jumping with the same piece')
      }
      return
    }
    const piece = G.board[i]
    if (piece && piece.player === actingPlayer) {
      if (!movable.has(i)) {
        // The forced-capture rule in action: this piece truly has no legal
        // move right now. Say so — silence here reads as a frozen board.
        flashHint(
          forcedCapture
            ? 'That piece can’t move — you must capture'
            : 'That piece can’t move right now',
        )
        setSelected(null)
        return
      }
      setSelected(i === selected ? null : i)
    } else {
      setSelected(null)
    }
  }

  const cellSize = Math.floor(boardSize / 8)
  const pieceSize = Math.floor(cellSize * 0.78)

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
        ) : guidance ? (
          <Text
            testID="boardGuidance"
            style={[a.text_sm, a.font_bold, t.atoms.text_contrast_medium]}
            accessibilityLiveRegion="polite">
            {guidance}
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
              const piece = G.board[i]
              const dark = (row + col) % 2 === 1
              const isSelected = effectiveSelected === i && piece !== null
              const isDest = destinations.some(m => m.to === i)
              // Movable/forced styling applies to the side to move's pieces
              // while this client may act; opponent pieces stay plain context.
              const isOwnTurnPiece =
                interactive && piece !== null && piece.player === actingPlayer
              const isMovable = isOwnTurnPiece && movable.has(i)
              const isImmovable = isOwnTurnPiece && !movable.has(i)
              const mustAct = isMovable && forcedCapture
              return (
                <Pressable
                  key={i}
                  testID={`ck-sq-${i}`}
                  accessibilityRole="button"
                  accessibilityLabel={
                    piece
                      ? `Square ${i}, ${piece.player === 0 ? 'red' : 'black'}${piece.king ? ' king' : ''}${
                          mustAct
                            ? ', must capture'
                            : isMovable
                              ? ', can move'
                              : isImmovable
                                ? ', cannot move'
                                : ''
                        }`
                      : `Square ${i}, empty`
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
                    isSelected && {backgroundColor: SELECT_TINT},
                  ]}>
                  {piece ? (
                    <View
                      testID={
                        mustAct
                          ? `ck-piece-forced-${i}`
                          : isImmovable
                            ? `ck-piece-immovable-${i}`
                            : `ck-piece-${i}`
                      }
                      style={[
                        a.align_center,
                        a.justify_center,
                        {
                          width: pieceSize,
                          height: pieceSize,
                          borderRadius: pieceSize / 2,
                          backgroundColor: PIECE_COLORS[piece.player],
                          borderWidth: mustAct ? 3 : 2,
                          borderColor: mustAct ? FORCED_RING : PIECE_BORDER,
                        },
                        isImmovable && {opacity: IMMOVABLE_OPACITY},
                      ]}>
                      {piece.king ? (
                        <Text
                          style={[
                            a.font_bold,
                            {
                              color: '#ffd700',
                              fontSize: pieceSize * 0.55,
                              lineHeight: pieceSize * 0.7,
                            },
                          ]}>
                          ♛
                        </Text>
                      ) : null}
                    </View>
                  ) : isDest ? (
                    <View
                      testID={`ck-dest-${i}`}
                      style={{
                        width: cellSize * 0.3,
                        height: cellSize * 0.3,
                        borderRadius: cellSize * 0.15,
                        backgroundColor: 'rgba(20, 120, 60, 0.85)',
                      }}
                    />
                  ) : null}
                </Pressable>
              )
            })}
          </View>
        ))}
      </View>

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
