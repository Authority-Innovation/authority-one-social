import {Pressable, View} from 'react-native'

import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Text} from '#/components/Typography'
import {type GameCtx, type PlayerInfo} from '../gameClient'
import {type Cell, type TicTacToeG} from '../tictactoe'

/** Display marks: player '0' is X, player '1' is O — fixed for tic-tac-toe. */
function markOf(cell: Cell): string {
  if (cell === '0') return 'X'
  if (cell === '1') return 'O'
  return ''
}

/**
 * The tappable 3x3 tic-tac-toe board plus status line and new-game control.
 * Purely presentational: taps report the cell index up; all rules live in the
 * game client (authoritative server later). Strings are plain literals — this
 * is a custom (non-Bluesky) surface, so nothing here rides the Lingui catalog.
 */
export function Board({
  G,
  ctx,
  players,
  boardSize,
  onCellPress,
  onNewGame,
}: {
  G: TicTacToeG
  ctx: GameCtx
  players: PlayerInfo[]
  /** Rendered edge length of the square board, in px. */
  boardSize: number
  onCellPress: (cell: number) => void
  onNewGame: () => void
}) {
  const t = useTheme()
  const over = ctx.gameover ?? null
  const nameOf = (id: string) => players.find(p => p.id === id)?.name ?? id

  // "You" gets its own grammar ("Your turn", "You win") — the viewer's row in
  // the mock roster is literally named that when signed out.
  const status = over
    ? over.winner !== null
      ? nameOf(over.winner) === 'You'
        ? `You win! (${markOf(over.winner as Cell)})`
        : `${nameOf(over.winner)} (${markOf(over.winner as Cell)}) wins!`
      : "It's a draw."
    : nameOf(ctx.currentPlayer) === 'You'
      ? `Your turn — ${markOf(ctx.currentPlayer as Cell)}`
      : `${nameOf(ctx.currentPlayer)}'s turn — ${markOf(ctx.currentPlayer as Cell)}`

  const cellSize = Math.floor(boardSize / 3)

  return (
    <View style={[a.align_center, a.gap_md]}>
      <Text
        testID="gameStatus"
        style={[a.text_lg, a.font_bold, t.atoms.text]}
        // Winner line doubles as a live region for screen readers.
        accessibilityLiveRegion="polite">
        {status}
      </Text>

      <View
        style={[
          a.rounded_md,
          a.overflow_hidden,
          a.border,
          t.atoms.border_contrast_medium,
          {width: cellSize * 3, height: cellSize * 3},
        ]}>
        {[0, 1, 2].map(row => (
          <View key={row} style={[a.flex_row]}>
            {[0, 1, 2].map(col => {
              const i = row * 3 + col
              const cell = G.board[i]
              const disabled = cell !== null || over !== null
              return (
                <Pressable
                  key={i}
                  testID={`cell-${i}`}
                  accessibilityRole="button"
                  accessibilityLabel={
                    cell
                      ? `Cell ${i + 1}, ${markOf(cell)}`
                      : `Cell ${i + 1}, empty`
                  }
                  accessibilityHint="Places your mark in this cell"
                  disabled={disabled}
                  onPress={() => onCellPress(i)}
                  style={({pressed}) => [
                    a.align_center,
                    a.justify_center,
                    t.atoms.bg,
                    col < 2 && a.border_r,
                    row < 2 && a.border_b,
                    t.atoms.border_contrast_medium,
                    {width: cellSize, height: cellSize},
                    pressed && !disabled && t.atoms.bg_contrast_25,
                  ]}>
                  <Text
                    style={[
                      a.font_bold,
                      {fontSize: cellSize * 0.5, lineHeight: cellSize * 0.6},
                      cell === '0'
                        ? {color: t.palette.primary_500}
                        : t.atoms.text,
                    ]}>
                    {markOf(cell)}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        ))}
      </View>

      {over ? (
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
