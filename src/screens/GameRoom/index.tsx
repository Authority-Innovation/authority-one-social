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
import {Text} from '#/components/Typography'
import {IS_WEB} from '#/env'
import {Board} from './components/Board'
import {ChatLane} from './components/ChatLane'
import {ScenePane} from './components/ScenePane'
import {
  createGameClient,
  FORCE_MOCK_TRANSPORT,
  type GameChatMsg,
  type GameClient,
  type GameConnectionStatus,
  type GameCtx,
  type GameTransport,
  type PlayerInfo,
  type SceneFrame,
} from './gameClient'
import {initialG, type TicTacToeG} from './tictactoe'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'GameRoom'>

/** Width of the chat column in the wide (TV / landscape) split. */
const CHAT_COLUMN_WIDTH = 360

/** How long a server rejection (invalid move etc) stays on screen. */
const ERROR_TOAST_MS = 2500

/**
 * GameRoom — one responsive screen, two orientations, chat ALWAYS visible
 * (the agent + community chat are part of gameplay, not a separate surface):
 *
 *   narrow (phone / portrait): game pane TOP, chat lane BOTTOM
 *   wide (TV / desktop / landscape): game pane LEFT, chat lane RIGHT
 *
 * TWO game-pane modes share that layout engine:
 *   board — the tic-tac-toe board (mock hot-seat, or the LIVE GameMatchDO)
 *   story — the narrative ScenePane (illustration + text + choice buttons),
 *           where the chat lane is the primary play surface (agent GM)
 *
 * Transport is decided by the ROUTE: `/game` runs the local mock,
 * `/game?mode=story` the canned story mock, and `/game/<matchID>` joins the
 * LIVE match over WebSocket (matchID is the capability UUID from match
 * create). A live server can also flip the pane to story by sending scene
 * frames. All traffic flows through the GameClient seam (gameClient.ts).
 */
export function GameRoomScreen({route}: Props) {
  // A fresh mount per room identity keeps game + chat state from leaking
  // between rooms (same pattern as AgentChat's per-thread keying).
  const matchId = route.params?.matchId ?? 'lobby'
  const live = !!route.params?.matchId && !FORCE_MOCK_TRANSPORT
  const storyRoute = route.params?.mode === 'story'
  const requestedSeat = route.params?.seat === '1' ? '1' : '0'
  return (
    <GameRoomInner
      key={`${matchId}:${storyRoute ? 'story' : 'board'}`}
      matchId={matchId}
      live={live}
      storyRoute={storyRoute}
      requestedSeat={requestedSeat}
    />
  )
}

function GameRoomInner({
  matchId,
  live,
  storyRoute,
  requestedSeat,
}: {
  matchId: string
  live: boolean
  storyRoute: boolean
  requestedSeat: string
}) {
  const t = useTheme()
  const {width, height} = useWindowDimensions()
  const {centerColumnOffset} = useLayoutBreakpoints()
  const {currentAccount} = useSession()

  const playerName =
    currentAccount?.handle?.split('.')[0] ?? currentAccount?.handle ?? 'You'

  // "New game" recreates the client against a fresh match generation — the
  // contract-clean reset for the LOCAL mock only (a live match id is minted
  // by the server, so live rooms hide the control instead).
  const [generation, setGeneration] = useState(0)
  const matchID = generation === 0 ? matchId : `${matchId}~${generation}`

  const [G, setG] = useState<TicTacToeG>(() => initialG())
  const [ctx, setCtx] = useState<GameCtx>({currentPlayer: '0'})
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [chat, setChat] = useState<ChatMessage[]>([])
  // The seat this client actually holds (live join may fall back to the other
  // seat or spectator); drives tap identity + chat attribution.
  const [seat, setSeat] = useState<string | null>(requestedSeat)
  const [scene, setScene] = useState<SceneFrame | null>(null)
  const [sceneChosenId, setSceneChosenId] = useState<string | null>(null)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [connection, setConnection] = useState<GameConnectionStatus | null>(
    null,
  )

  const clientRef = useRef<GameClient | null>(null)
  const chatSeq = useRef(0)
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const transport: GameTransport = live
    ? 'live'
    : storyRoute
      ? 'mock-story'
      : 'mock'

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
      playerID: requestedSeat,
      name: playerName,
      transport,
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
        onSeat: setSeat,
        onScene: s => {
          setScene(s)
          setSceneChosenId(null)
        },
        onError: err => {
          // Gentle surface: a transient line in the game pane, never a crash.
          setErrorText(err.message || err.code)
          if (errorTimer.current) clearTimeout(errorTimer.current)
          errorTimer.current = setTimeout(
            () => setErrorText(null),
            ERROR_TOAST_MS,
          )
        },
        onConnection: setConnection,
      },
    })
    clientRef.current = client
    client.connect()
    return () => {
      client.disconnect()
      clientRef.current = null
      if (errorTimer.current) {
        clearTimeout(errorTimer.current)
        errorTimer.current = null
      }
    }
  }, [matchID, requestedSeat, playerName, transport])

  // Pure width-driven orientation (see docblock).
  const wide = width >= (IS_WEB ? 1100 : 900)

  // Story pane engages from the route (mock demo) or the moment a live server
  // sends a scene frame — a scene with no board is a valid match.
  const storyMode = storyRoute || scene !== null

  const selfIds = new Set(seat !== null ? [seat] : [])
  const participants =
    players.length > 0 ? players.map(p => p.name).join(' vs ') : null

  const onCellPress = (cell: number) => {
    clientRef.current?.sendMove({type: 'place', args: {cell}})
  }
  const onSendChat = (text: string) => {
    clientRef.current?.sendChat(text)
  }
  const onChoose = (id: string) => {
    setSceneChosenId(id)
    clientRef.current?.sendChoice(id)
  }
  const onNewGame = () => setGeneration(g => g + 1)

  const subtitle = storyMode
    ? (scene?.title ?? 'Story')
    : participants
      ? `Tic-tac-toe — ${participants}`
      : null

  const header = (
    <Layout.Header.Outer>
      <Layout.Header.BackButton />
      <Layout.Header.Content>
        {/* Plain literals: custom (non-Bluesky) surface, never rides the
            compiled Lingui catalog. */}
        <Layout.Header.TitleText>Game Room</Layout.Header.TitleText>
        {subtitle ? (
          <Layout.Header.SubtitleText>{subtitle}</Layout.Header.SubtitleText>
        ) : null}
      </Layout.Header.Content>
      <Layout.Header.Slot />
    </Layout.Header.Outer>
  )

  // Status strip shared by both layouts: reconnect indicator + gentle server
  // rejections (invalid move etc). Absent almost always.
  const statusStrip =
    connection === 'reconnecting' ||
    connection === 'connecting' ||
    errorText ? (
      <View style={[a.align_center, a.gap_2xs, a.pt_sm]}>
        {connection === 'reconnecting' || connection === 'connecting' ? (
          <Text
            style={[a.text_sm, t.atoms.text_contrast_medium]}
            accessibilityLiveRegion="polite">
            {connection === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
          </Text>
        ) : null}
        {errorText ? (
          <Text
            testID="gameErrorText"
            style={[a.text_sm, {color: t.palette.negative_500}]}
            accessibilityLiveRegion="polite">
            {errorText}
          </Text>
        ) : null}
      </View>
    ) : null

  const gamePane = (boardSize: number) =>
    storyMode ? (
      <View style={[a.flex_1, a.w_full]}>
        {statusStrip}
        <ScenePane scene={scene} chosenId={sceneChosenId} onChoose={onChoose} />
      </View>
    ) : (
      <View style={[a.align_center, a.gap_sm]}>
        {statusStrip}
        <Board
          G={G}
          ctx={ctx}
          players={players}
          boardSize={boardSize}
          onCellPress={onCellPress}
          onNewGame={live ? undefined : onNewGame}
        />
      </View>
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
              storyMode ? undefined : a.align_center,
              storyMode ? undefined : a.justify_center,
              storyMode ? undefined : a.px_xl,
              a.border_l,
              t.atoms.border_contrast_low,
              t.atoms.bg,
            ]}>
            {gamePane(Math.max(boardSize, 240))}
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
  // size that always leaves the chat lane a workable share of the screen; the
  // story pane takes a fixed share for the same reason.
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
        {storyMode ? (
          <View style={[{height: Math.max(height * 0.45, 300)}]}>
            {gamePane(boardSize)}
          </View>
        ) : (
          <View style={[a.py_lg, a.align_center]}>{gamePane(boardSize)}</View>
        )}
        <View style={[a.flex_1, a.border_t, t.atoms.border_contrast_low]}>
          <ChatLane messages={chat} selfIds={selfIds} onSend={onSendChat} />
        </View>
      </View>
    </Layout.Screen>
  )
}
