import {useState} from 'react'
import {Pressable, View} from 'react-native'

import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Text} from '#/components/Typography'
import {
  C4_COLS,
  C4_ROWS,
  type ConnectFourG,
  type ConnectFourMove,
  landingRow,
  legalColSet,
} from '../connectFour'
import {type GameCtx, type PlayerInfo} from '../gameClient'
import {useFlashHint} from './useFlashHint'

/** Fixed board colors (independent of app theme) so the discs always read,
 *  matching convention for a physical Connect Four frame. */
const FRAME_BLUE = '#1d4ed8'
const HOLE_COLOR = '#eef2f7'
const DISC_COLORS = ['#e03131', '#fcc419'] // seat 0 = red, seat 1 = yellow
const DISC_BORDER = 'rgba(0, 0, 0, 0.25)'
/** Highlights live on the HOLE behind the disc (chess-style square tint): a
 *  ring on the disc itself vanishes against same-hue discs or the white hole.
 *  The last-move halo is DARK — gold-on-yellow was unreadable. */
const LAST_HOLE = '#111827'
const WIN_HOLE = '#ffd700'
/** Strong ring on the four winning discs — dark reads on red AND yellow. */
const WIN_RING = 'rgba(0, 0, 0, 0.6)'
/** Full columns fade while it's your pick so the playable ones read. */
const FULL_COLUMN_OPACITY = 0.45

/**
 * The tappable 7x6 Connect Four board plus status line. Purely
 * presentational: rules never run here — column legality comes from the
 * state frame's `legalMoves` (server-computed live, connectFour.ts in the
 * mock), and taps report a COLUMN up (the whole column is the tap target;
 * the server decides the landing row). The only local derivation is the
 * hover/press ghost's landing cell, cosmetic and recomputed from the
 * authoritative board. Last move and the winning four highlight; a tap that
 * cannot act always says why (never fail silently).
 * Strings are plain literals — custom (non-Bluesky) surface, no Lingui.
 */
export function ConnectFourBoard({
  G,
  ctx,
  players,
  seat,
  hotSeat = false,
  boardSize,
  onDrop,
  onNewGame,
}: {
  G: ConnectFourG & {legalMoves: ConnectFourMove[]}
  ctx: GameCtx
  players: PlayerInfo[]
  /** The seat this client holds (null = spectating). */
  seat: string | null
  /** Mock hot-seat: taps act for whichever player's turn it is. */
  hotSeat?: boolean
  /** Rendered edge length budget; the board is 7 cells wide, 6 tall. */
  boardSize: number
  onDrop: (col: number) => void
  onNewGame?: () => void
}) {
  const t = useTheme()
  const {hint, flashHint} = useFlashHint()
  const [hoverCol, setHoverCol] = useState<number | null>(null)
  const over = ctx.gameover ?? null
  // NEVER render a raw seat id ("1 is thinking…"): an unfilled seat gets its
  // own truthful status below; any other unnamed seat reads as "Player N".
  const seatFilled = (id: string) => players.some(p => p.id === id)
  const nameOf = (id: string) =>
    players.find(p => p.id === id)?.name ?? `Player ${Number(id) + 1}`

  const myTurn = hotSeat || (seat !== null && seat === ctx.currentPlayer)
  const interactive = over === null && myTurn
  const actingPlayer = Number(ctx.currentPlayer) as 0 | 1
  const legalCols = legalColSet(G.legalMoves)
  const winSet = new Set(G.winningLine ?? [])
  const lastIdx = G.lastMove ? G.lastMove.row * C4_COLS + G.lastMove.col : null

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
    : !seatFilled(ctx.currentPlayer)
      ? // The turn sits on a seat NOBODY holds — say so; implying a
        // nonexistent opponent is "thinking" hides a hung match.
        'Waiting for a player to join…'
      : isYou(ctx.currentPlayer)
        ? 'Your turn'
        : seat !== null && !myTurn
          ? `${nameOf(ctx.currentPlayer)} is thinking…`
          : `${nameOf(ctx.currentPlayer)}'s turn`

  const onColumnPress = (col: number) => {
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
    if (!legalCols.has(col)) {
      // The column truly has no room. Say so — silence reads as a frozen
      // board (the exact live-game bug the flash hint exists for).
      flashHint('That column is full — pick another')
      return
    }
    onDrop(col)
  }

  // Ghost preview of where the disc will land in the hovered/pressed column
  // (web hover; cosmetic only — the server still owns the real landing row).
  const ghostIdx = (col: number): number | null => {
    if (!interactive || hoverCol !== col || !legalCols.has(col)) return null
    const row = landingRow(G.board, col)
    return row === null ? null : row * C4_COLS + col
  }

  const cellSize = Math.floor(boardSize / C4_COLS)
  const discSize = Math.floor(cellSize * 0.78)

  const disc = (player: 0 | 1, win: boolean, testID: string) => (
    <View
      testID={testID}
      style={{
        width: discSize,
        height: discSize,
        borderRadius: discSize / 2,
        backgroundColor: DISC_COLORS[player],
        borderWidth: win ? 3 : 2,
        borderColor: win ? WIN_RING : DISC_BORDER,
      }}
    />
  )

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
          a.flex_row,
          a.rounded_md,
          a.overflow_hidden,
          a.border,
          t.atoms.border_contrast_medium,
          {
            width: cellSize * C4_COLS,
            height: cellSize * C4_ROWS,
            backgroundColor: FRAME_BLUE,
          },
        ]}>
        {Array.from({length: C4_COLS}, (_, col) => {
          const full = !legalCols.has(col)
          const filled = Array.from(
            {length: C4_ROWS},
            (_, row) => G.board[row * C4_COLS + col],
          ).filter(c => c !== null).length
          return (
            <Pressable
              key={col}
              testID={`c4-col-${col}`}
              accessibilityRole="button"
              accessibilityLabel={`Column ${col + 1}, ${filled} of ${C4_ROWS} discs${filled >= C4_ROWS ? ', full' : ''}`}
              accessibilityHint="Drops your disc into this column"
              disabled={over !== null}
              onPress={() => onColumnPress(col)}
              onHoverIn={() => setHoverCol(col)}
              onHoverOut={() =>
                setHoverCol(prev => (prev === col ? null : prev))
              }
              onPressIn={() => setHoverCol(col)}
              onPressOut={() =>
                setHoverCol(prev => (prev === col ? null : prev))
              }
              style={[
                // A full column dims while this client may act, so the
                // playable columns read at a glance.
                interactive && full && {opacity: FULL_COLUMN_OPACITY},
              ]}>
              {Array.from({length: C4_ROWS}, (_, row) => {
                const i = row * C4_COLS + col
                const cell = G.board[i]
                const ghost = ghostIdx(col) === i
                return (
                  <View
                    key={row}
                    style={[
                      a.align_center,
                      a.justify_center,
                      {width: cellSize, height: cellSize},
                    ]}>
                    {/* The hole, punched out of the blue frame. The last
                        drop's and the winning cells' holes tint gold, so the
                        highlight ring shows around the disc. */}
                    <View
                      style={[
                        a.absolute,
                        a.align_center,
                        a.justify_center,
                        {
                          width: discSize + 6,
                          height: discSize + 6,
                          borderRadius: (discSize + 6) / 2,
                          backgroundColor: winSet.has(i)
                            ? WIN_HOLE
                            : lastIdx === i
                              ? LAST_HOLE
                              : HOLE_COLOR,
                        },
                      ]}
                    />
                    {cell !== null ? (
                      disc(
                        cell,
                        winSet.has(i),
                        winSet.has(i)
                          ? `c4-win-${i}`
                          : lastIdx === i
                            ? `c4-last-${i}`
                            : `c4-disc-${i}`,
                      )
                    ) : ghost ? (
                      <View
                        testID={`c4-ghost-${i}`}
                        style={{
                          width: discSize,
                          height: discSize,
                          borderRadius: discSize / 2,
                          backgroundColor: DISC_COLORS[actingPlayer],
                          opacity: 0.35,
                        }}
                      />
                    ) : null}
                  </View>
                )
              })}
            </Pressable>
          )
        })}
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
