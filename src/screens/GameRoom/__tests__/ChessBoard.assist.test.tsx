/**
 * ACCESSIBILITY ASSIST — the buttons actually RENDER.
 *
 * assistPanel.test.ts proves the decision; nothing proved the component acted
 * on it, and that gap is exactly where the bug lived (Austin, 2026-07-27: the
 * runtime authorized his seat and served real moves, and he still never saw a
 * button). These tests render the real ChessBoard and assert on what a player
 * would see: three big labelled buttons, on their turn, above the board.
 */
import {describe, expect, it, jest} from '@jest/globals'
import {fireEvent, render} from '@testing-library/react-native'

// The real #/alf barrel drags in Layout -> Dialog -> the native bottom-sheet
// module, which cannot load under jest (same stub as AgentGrid.test.tsx).
jest.mock('#/alf', () => {
  const styleProxy: Record<string, object> = new Proxy({}, {get: () => ({})})
  return {
    atoms: styleProxy,
    useTheme: () => ({
      atoms: styleProxy,
      palette: new Proxy({}, {get: () => '#000000'}),
    }),
    web: (v: unknown) => v,
    native: () => ({}),
    platform: () => ({}),
  }
})

jest.mock('#/components/Typography', () => {
  const {Text} = require('react-native')
  return {Text}
})

jest.mock('#/components/Button', () => {
  const {Pressable, Text} = require('react-native')
  return {
    Button: ({children, ...rest}: {children?: unknown}) => (
      <Pressable {...rest}>{children as never}</Pressable>
    ),
    ButtonText: ({children}: {children?: unknown}) => (
      <Text>{children as never}</Text>
    ),
  }
})

import {INITIAL_FEN} from '../chess'
import {ChessBoard} from '../components/ChessBoard'
import {
  type AssistInfo,
  type AssistSuggestion,
  type GameCtx,
  type PlayerInfo,
} from '../types'

/** Flattened style of a rendered node, typed so the lint rules stay happy. */
function styleOf(node: unknown): Record<string, unknown> {
  const style = (node as {props: {style: unknown}}).props.style
  const parts = Array.isArray(style) ? style.flat(2) : [style]
  return Object.assign({}, ...parts) as Record<string, unknown>
}

const PLAYERS: PlayerInfo[] = [
  {id: '0', name: 'Austin'},
  {id: '1', name: 'Bob'},
]

const INFO: AssistInfo = {
  seats: ['0'],
  intents: ['attack', 'defend', 'surprise'],
}

const SUGGESTION: AssistSuggestion = {
  intent: 'attack',
  move: {from: 'e2', to: 'e4'},
  reason: 'Push your pawn to e4 and take the middle!',
  differentiated: true,
}

/** White to move (the initial position) unless a FEN says otherwise. */
function renderBoard({
  fen = INITIAL_FEN,
  seat = '0',
  gameover = null,
  info = INFO,
  suggestion = null,
  pending = null,
  onMove = jest.fn(),
  onRequest = jest.fn(),
  onDismiss = jest.fn(),
}: {
  fen?: string
  seat?: string | null
  gameover?: GameCtx['gameover']
  info?: AssistInfo | null
  suggestion?: AssistSuggestion | null
  pending?: AssistInfo['intents'][number] | null
  onMove?: (from: string, to: string, promotion?: string) => void
  onRequest?: (intent: AssistInfo['intents'][number]) => void
  onDismiss?: () => void
} = {}) {
  const r = render(
    <ChessBoard
      G={{
        fen,
        check: false,
        lastMove: null,
        legalMoves: [{from: 'e2', to: 'e4'}],
      }}
      ctx={{currentPlayer: '0', gameover}}
      players={PLAYERS}
      seat={seat}
      boardSize={320}
      onMove={onMove}
      assist={{
        info,
        suggestion,
        pending,
        agentName: 'Bob',
        onRequest,
        onDismiss,
      }}
    />,
  )
  return {...r, onMove, onRequest, onDismiss}
}

describe('ChessBoard accessibility assist', () => {
  it('renders all three buttons on the granted seat’s own turn', () => {
    const r = renderBoard()
    expect(r.getByTestId('assistPanel')).toBeTruthy()
    for (const intent of ['attack', 'defend', 'surprise']) {
      expect(r.getByTestId(`assist-${intent}`)).toBeTruthy()
    }
    // Labelled in words a player can be told to look for, not just emoji.
    expect(r.getByText('Attack')).toBeTruthy()
    expect(r.getByText('Defend')).toBeTruthy()
    expect(r.getByText('Surprise')).toBeTruthy()
  })

  it('gives every button a big tap target and a high-contrast face', () => {
    const r = renderBoard()
    for (const intent of ['attack', 'defend', 'surprise']) {
      const merged = styleOf(r.getByTestId(`assist-${intent}`))
      expect(merged.minHeight as number).toBeGreaterThanOrEqual(76)
      // Solid green fill, not a theme-tinted "subtle" surface (the original
      // buttons were bg_contrast_25 and disappeared into the page).
      expect(merged.backgroundColor).toBe('#0f7a37')
    }
  })

  it('puts the buttons ABOVE the board, not below the fold', () => {
    const r = renderBoard()
    // Document order in the rendered tree: the panel is emitted before the
    // first board square, so it is above the board on screen.
    const tree = JSON.stringify(r.toJSON())
    expect(tree.indexOf('assistPanel')).toBeGreaterThan(-1)
    expect(tree.indexOf('assistPanel')).toBeLessThan(tree.indexOf('ch-sq-a8'))
  })

  it('taps report the intent up and never move a piece by themselves', () => {
    const r = renderBoard()
    fireEvent.press(r.getByTestId('assist-defend'))
    expect(r.onRequest).toHaveBeenCalledWith('defend')
    expect(r.onMove).not.toHaveBeenCalled()
  })

  it('holds the block in place on the opponent’s turn', () => {
    // Black to move: same position, active colour flipped.
    const r = renderBoard({
      fen: INITIAL_FEN.replace(' w ', ' b '),
    })
    expect(r.getByTestId('assistPanel')).toBeTruthy()
    expect(r.getByTestId('assistWaiting')).toBeTruthy()
    // No dead buttons while it is not their move.
    expect(r.queryByTestId('assist-attack')).toBeNull()
  })

  it('shows a suggestion with one big confirming button that plays it', () => {
    const r = renderBoard({suggestion: SUGGESTION})
    expect(r.getByTestId('assistReason')).toBeTruthy()
    const confirm = r.getByTestId('assistConfirm')
    expect(styleOf(confirm).minHeight as number).toBeGreaterThanOrEqual(64)
    fireEvent.press(confirm)
    expect(r.onMove).toHaveBeenCalledWith('e2', 'e4', undefined)
  })

  it('says what it is thinking about while the ask is in flight', () => {
    const r = renderBoard({pending: 'attack'})
    expect(r.getByTestId('assistThinking')).toBeTruthy()
    expect(r.queryByTestId('assist-attack')).toBeNull()
  })

  it('never shows for a seat the match did not grant, or a spectator', () => {
    expect(
      renderBoard({info: {...INFO, seats: ['1']}}).queryByTestId('assistPanel'),
    ).toBeNull()
    expect(renderBoard({info: null}).queryByTestId('assistPanel')).toBeNull()
    expect(renderBoard({seat: null}).queryByTestId('assistPanel')).toBeNull()
  })

  it('disappears once the game is over', () => {
    expect(
      renderBoard({gameover: {winner: '1'}}).queryByTestId('assistPanel'),
    ).toBeNull()
  })

  it('renders nothing extra when the board has no assist prop at all', () => {
    const r = render(
      <ChessBoard
        G={{
          fen: INITIAL_FEN,
          check: false,
          lastMove: null,
          legalMoves: [],
        }}
        ctx={{currentPlayer: '0'}}
        players={PLAYERS}
        seat="0"
        boardSize={320}
        onMove={jest.fn()}
      />,
    )
    expect(r.queryByTestId('assistPanel')).toBeNull()
  })
})
