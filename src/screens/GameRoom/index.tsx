import {useEffect, useRef, useState} from 'react'
import {useWindowDimensions, View} from 'react-native'

import {type ChatMessage} from '#/lib/agent-runtime'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {useSession} from '#/state/session'
import {LEFT_NAV_MINIMAL_WIDTH} from '#/view/shell/desktop/LeftNav'
import {atoms as a, useLayoutBreakpoints, useTheme, web} from '#/alf'
import * as Layout from '#/components/Layout'
import {CENTER_COLUMN_WIDTH, SCROLLBAR_OFFSET} from '#/components/Layout'
import {IS_WEB} from '#/env'
import {Board} from './components/Board'
import {ChatLane} from './components/ChatLane'
import {
  createGameClient,
  type GameChatMsg,
  type GameClient,
  type GameCtx,
  type PlayerInfo,
} from './gameClient'
import {initialG, type TicTacToeG} from './tictactoe'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'GameRoom'>

/** Width of the chat column in the wide (TV / landscape) split. */
const CHAT_COLUMN_WIDTH = 360

/**
 * GameRoom — one responsive screen, two orientations, chat ALWAYS visible
 * (the agent + community chat are part of gameplay, not a separate surface):
 *
 *   narrow (phone / portrait): game pane TOP, chat lane BOTTOM
 *   wide (TV / desktop / landscape): game pane LEFT, chat lane RIGHT
 *
 * Orientation is pure layout, driven off the measured window width — same
 * component either way. On web the fixed desktop side navs consume horizontal
 * room, so the wide split engages at the same >=1100px media point the shell
 * uses for its side columns (and GameRoom gets the Messages-style immersive
 * treatment: minimal left nav, no right nav); on native, width >= 900 (a
 * tablet/TV in landscape) is enough. All game/chat traffic flows through the
 * GameClient seam (gameClient.ts) — swapping the local mock for the live
 * GameMatchDO WebSocket touches that module only.
 */
export function GameRoomScreen({route}: Props) {
  // A fresh mount per match id keeps game + chat state from leaking between
  // rooms (same pattern as AgentChat's per-thread keying).
  const matchId = route.params?.matchId ?? 'lobby'
  return <GameRoomInner key={matchId} matchId={matchId} />
}

function GameRoomInner({matchId}: {matchId: string}) {
  const t = useTheme()
  const {width, height} = useWindowDimensions()
  const {centerColumnOffset} = useLayoutBreakpoints()
  const {currentAccount} = useSession()

  // The viewer is always player '0' in the mock hot-seat match. The live
  // transport will assign real seats at join time.
  const playerID = '0'
  const playerName =
    currentAccount?.handle?.split('.')[0] ?? currentAccount?.handle ?? 'You'

  // "New game" recreates the client against a fresh match generation — the
  // contract-clean reset (a live match id is minted by the server; the mock
  // just starts a fresh board).
  const [generation, setGeneration] = useState(0)
  const matchID = generation === 0 ? matchId : `${matchId}~${generation}`

  const [G, setG] = useState<TicTacToeG>(() => initialG())
  const [ctx, setCtx] = useState<GameCtx>({currentPlayer: '0'})
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [chat, setChat] = useState<ChatMessage[]>([])

  const clientRef = useRef<GameClient | null>(null)
  const chatSeq = useRef(0)

  useEffect(() => {
    const toChatMessage = (m: GameChatMsg): ChatMessage => ({
      id: `game-${m.ts}-${chatSeq.current++}`,
      role: m.from.startsWith('agent') ? 'assistant' : 'user',
      text: m.text,
      senderName: m.name,
      senderId: m.from,
      createdAt: m.ts,
    })
    const client = createGameClient({
      matchID,
      playerID,
      name: playerName,
      callbacks: {
        onState: (g, c, p) => {
          setG(g)
          setCtx(c)
          setPlayers(p)
        },
        onPlayers: setPlayers,
        onChat: m => setChat(prev => [...prev, toChatMessage(m)]),
        // Terminal state also arrives via onState's ctx.gameover (which drives
        // the board status line); nothing extra to do on the dedicated event
        // yet — the live room will use it for recap/social triggers.
        onGameover: () => {},
      },
    })
    clientRef.current = client
    client.connect()
    return () => {
      client.disconnect()
      clientRef.current = null
    }
  }, [matchID, playerID, playerName])

  // Pure width-driven orientation (see docblock).
  const wide = width >= (IS_WEB ? 1100 : 900)

  const selfIds = new Set([playerID])
  const participants =
    players.length > 0 ? players.map(p => p.name).join(' vs ') : null

  const onCellPress = (cell: number) => {
    clientRef.current?.sendMove({type: 'place', args: {cell}})
  }
  const onSendChat = (text: string) => {
    clientRef.current?.sendChat(text)
  }
  const onNewGame = () => setGeneration(g => g + 1)

  const header = (
    <Layout.Header.Outer>
      <Layout.Header.BackButton />
      <Layout.Header.Content>
        {/* Plain literals: custom (non-Bluesky) surface, never rides the
            compiled Lingui catalog. */}
        <Layout.Header.TitleText>Game Room</Layout.Header.TitleText>
        {participants ? (
          <Layout.Header.SubtitleText>
            {`Tic-tac-toe — ${participants}`}
          </Layout.Header.SubtitleText>
        ) : null}
      </Layout.Header.Content>
      <Layout.Header.Slot />
    </Layout.Header.Outer>
  )

  if (wide) {
    // TV / desktop split: game LEFT, chat RIGHT. On web this mirrors the
    // Messages split-view geometry — a fixed-width two-column container,
    // nudged right to sit beside the (minimal) fixed left nav.
    const gameColumnWidth =
      CENTER_COLUMN_WIDTH -
      (centerColumnOffset ? LEFT_NAV_MINIMAL_WIDTH / 2 + 30 : 0)
    const containerWidth = gameColumnWidth + CHAT_COLUMN_WIDTH
    const boardSize = Math.min(gameColumnWidth - 96, height - 300, 440)

    return (
      <Layout.Screen testID="gameRoomScreen">
        {header}
        <View
          style={[
            a.flex_1,
            a.flex_row,
            a.mx_auto,
            a.w_full,
            {maxWidth: containerWidth},
            web({
              transform: [
                {
                  translateX: centerColumnOffset
                    ? LEFT_NAV_MINIMAL_WIDTH / 2
                    : LEFT_NAV_MINIMAL_WIDTH / 4,
                },
                {translateX: SCROLLBAR_OFFSET},
              ],
            }),
          ]}>
          {/* Solid pane backgrounds: Layout.Screen paints fixed center-column
              borders behind the content — an opaque bg keeps them from showing
              through the middle of the split. */}
          <View
            style={[
              a.flex_1,
              a.align_center,
              a.justify_center,
              a.px_xl,
              a.border_l,
              t.atoms.border_contrast_low,
              t.atoms.bg,
            ]}>
            <Board
              G={G}
              ctx={ctx}
              players={players}
              boardSize={Math.max(boardSize, 240)}
              onCellPress={onCellPress}
              onNewGame={onNewGame}
            />
          </View>
          <View
            style={[
              a.border_l,
              a.border_r,
              t.atoms.border_contrast_low,
              t.atoms.bg,
              {width: CHAT_COLUMN_WIDTH},
            ]}>
            <ChatLane messages={chat} selfIds={selfIds} onSend={onSendChat} />
          </View>
        </View>
      </Layout.Screen>
    )
  }

  // Phone / portrait split: game pane TOP, chat lane BOTTOM. Board caps at a
  // size that always leaves the chat lane a workable share of the screen.
  const boardSize = Math.max(Math.min(width - 64, height * 0.36, 340), 200)

  return (
    <Layout.Screen testID="gameRoomScreen">
      {header}
      <View
        style={[
          a.flex_1,
          a.w_full,
          a.mx_auto,
          {maxWidth: CENTER_COLUMN_WIDTH},
        ]}>
        <View style={[a.py_lg, a.align_center]}>
          <Board
            G={G}
            ctx={ctx}
            players={players}
            boardSize={boardSize}
            onCellPress={onCellPress}
            onNewGame={onNewGame}
          />
        </View>
        <View style={[a.flex_1, a.border_t, t.atoms.border_contrast_low]}>
          <ChatLane messages={chat} selfIds={selfIds} onSend={onSendChat} />
        </View>
      </View>
    </Layout.Screen>
  )
}
