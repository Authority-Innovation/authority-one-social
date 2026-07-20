import {useEffect, useRef, useState} from 'react'
import {useWindowDimensions, View} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {type ChatMessage} from '#/lib/agent-runtime'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {useSession} from '#/state/session'
import {LEFT_NAV_MINIMAL_WIDTH} from '#/view/shell/desktop/LeftNav'
import {atoms as a, useLayoutBreakpoints, useTheme, web} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'
import {CENTER_COLUMN_WIDTH, SCROLLBAR_OFFSET} from '#/components/Layout'
import {Text} from '#/components/Typography'
import {IS_WEB} from '#/env'
import {initialCheckersG} from './checkers'
import {INITIAL_FEN} from './chess'
import {Board} from './components/Board'
import {ChatLane} from './components/ChatLane'
import {CheckersBoard} from './components/CheckersBoard'
import {ChessBoard} from './components/ChessBoard'
import {ConnectFourBoard} from './components/ConnectFourBoard'
import {ScenePane} from './components/ScenePane'
import {initialConnectFourG} from './connectFour'
import {createLiveMatch, type LaunchableGame} from './createMatch'
import {
  createGameClient,
  FORCE_MOCK_TRANSPORT,
  type GameChatMsg,
  type GameClient,
  type GameConnectionStatus,
  type GameCtx,
  type GameG,
  type GameKind,
  type GameTransport,
  type PlayerInfo,
  type SceneFrame,
} from './gameClient'
import {initialG} from './tictactoe'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'GameRoom'>

/** Width of the chat column in the wide (TV / landscape) split. */
const CHAT_COLUMN_WIDTH = 360

/** How long a server rejection (invalid move etc) stays on screen. */
const ERROR_TOAST_MS = 2500

const GAME_TITLES: Record<GameKind, string> = {
  'tic-tac-toe': 'Tic-tac-toe',
  checkers: 'Checkers',
  chess: 'Chess',
  'connect-four': 'Connect Four',
}
const GAME_KINDS: GameKind[] = [
  'tic-tac-toe',
  'checkers',
  'chess',
  'connect-four',
]
/** What the "Start a live match" launcher offers: boards + the mystery (the
 *  runtime seats the owner's own agent as opponent/GM — see createMatch.ts). */
const LAUNCH_KINDS: LaunchableGame[] = [...GAME_KINDS, 'mystery']
const LAUNCH_TITLES: Record<LaunchableGame, string> = {
  ...GAME_TITLES,
  mystery: 'Mystery',
}

function asGameKind(v: unknown): GameKind {
  return v === 'checkers' || v === 'chess' || v === 'connect-four'
    ? v
    : 'tic-tac-toe'
}

/** The pre-first-frame state for a room of this game (the mocks and the live
 *  server both replace it with an authoritative snapshot on join). */
function initialAppG(kind: GameKind): GameG {
  if (kind === 'checkers') {
    return {kind, ...initialCheckersG(), legalMoves: []}
  }
  if (kind === 'chess') {
    return {
      kind,
      fen: INITIAL_FEN,
      check: false,
      lastMove: null,
      legalMoves: [],
    }
  }
  if (kind === 'connect-four') {
    return {kind, ...initialConnectFourG(), legalMoves: []}
  }
  return {kind, ...initialG()}
}

/**
 * GameRoom — one responsive screen, two orientations, chat ALWAYS visible
 * (the agent + community chat are part of gameplay, not a separate surface):
 *
 *   narrow (phone / portrait): game pane TOP, chat lane BOTTOM
 *   wide (TV / desktop / landscape): game pane LEFT, chat lane RIGHT
 *
 * TWO game-pane modes share that layout engine:
 *   board — a tappable board (tic-tac-toe / checkers / chess — mock hot-seat,
 *           or the LIVE GameMatchDO; the state frame names the game)
 *   story — the narrative ScenePane (illustration + text + choice buttons),
 *           where the chat lane is the primary play surface (agent GM)
 *
 * Transport is decided by the ROUTE: `/game` runs the local mock
 * (`?game=checkers|chess` picks the mock board), `/game?mode=story` the
 * canned story mock, and `/game/<matchID>` joins the LIVE match over
 * WebSocket (matchID is the capability UUID from match create). A live
 * server can also flip the pane to story by sending scene frames. All
 * traffic flows through the GameClient seam (gameClient.ts).
 *
 * GUEST MODE (no login): a live link carrying `?t=<capability token>` opens
 * WITHOUT an account — the navigator waives requireAuth for exactly that
 * shape (see createNativeStackNavigatorWithAuth), and the token rides the WS
 * join frame for the server to validate + scope to this one match. `?name=`
 * names the guest (default "Guest"). The signed-in flow is unchanged.
 */
export function GameRoomScreen({route}: Props) {
  // A fresh mount per room identity keeps game + chat state from leaking
  // between rooms (same pattern as AgentChat's per-thread keying).
  const matchId = route.params?.matchId ?? 'lobby'
  const live = !!route.params?.matchId && !FORCE_MOCK_TRANSPORT
  const storyRoute = route.params?.mode === 'story'
  const requestedSeat = route.params?.seat === '1' ? '1' : '0'
  const game = asGameKind(route.params?.game)
  const guestToken =
    live && typeof route.params?.t === 'string' && route.params.t.length > 0
      ? route.params.t
      : undefined
  const guestName =
    typeof route.params?.name === 'string' && route.params.name.trim()
      ? route.params.name.trim().slice(0, 40)
      : undefined
  return (
    <GameRoomInner
      key={`${matchId}:${storyRoute ? 'story' : 'board'}:${game}`}
      matchId={matchId}
      live={live}
      storyRoute={storyRoute}
      requestedSeat={requestedSeat}
      game={game}
      guestToken={guestToken}
      guestName={guestName}
    />
  )
}

function GameRoomInner({
  matchId,
  live,
  storyRoute,
  requestedSeat,
  game,
  guestToken,
  guestName,
}: {
  matchId: string
  live: boolean
  storyRoute: boolean
  requestedSeat: string
  game: GameKind
  guestToken?: string
  guestName?: string
}) {
  const t = useTheme()
  const {width, height} = useWindowDimensions()
  const {centerColumnOffset} = useLayoutBreakpoints()
  const {currentAccount} = useSession()
  const navigation = useNavigation<NavigationProp>()

  const isGuest = !!guestToken && !currentAccount
  const playerName = isGuest
    ? (guestName ?? 'Guest')
    : (currentAccount?.handle?.split('.')[0] ?? currentAccount?.handle ?? 'You')

  // "New game" recreates the client against a fresh match generation — the
  // contract-clean reset for the LOCAL mock only (a live match id is minted
  // by the server, so live rooms hide the control instead).
  const [generation, setGeneration] = useState(0)
  const matchID = generation === 0 ? matchId : `${matchId}~${generation}`

  const [G, setG] = useState<GameG>(() => initialAppG(game))
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
  // A live room shows "joining" until the first authoritative snapshot names
  // the game — rendering a guessed board first would flash the wrong one.
  const [hasState, setHasState] = useState(!live)
  // "New game" launcher: which game is mid-create (disables the row).
  const [creating, setCreating] = useState<LaunchableGame | null>(null)

  const clientRef = useRef<GameClient | null>(null)
  const chatSeq = useRef(0)
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const transport: GameTransport = live
    ? 'live'
    : storyRoute
      ? 'mock-story'
      : 'mock'

  const flashError = (message: string) => {
    setErrorText(message)
    if (errorTimer.current) clearTimeout(errorTimer.current)
    errorTimer.current = setTimeout(() => setErrorText(null), ERROR_TOAST_MS)
  }

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
      game,
      token: guestToken,
      callbacks: {
        onState: (g, c, p) => {
          setG(g)
          setCtx(c)
          setPlayers(p)
          setHasState(true)
        },
        onPlayers: setPlayers,
        onChat: m => setChat(prev => [...prev, toChatMessage(m)]),
        // Join-time chat-ring replay: REPLACE the log (a refresh/reconnect
        // delivers it again — appending would duplicate every line).
        onChatHistory: msgs => setChat(msgs.map(toChatMessage)),
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
          // A rejected guest token means this link cannot join AT ALL
          // (tampered or, more likely, expired) — keep that on screen
          // instead of stranding the guest on "Joining match…" after a
          // 2.5-second toast.
          if (err.code === 'bad-token' || err.code === 'token-required') {
            errorTimer.current = null
            return
          }
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
  }, [matchID, requestedSeat, playerName, transport, game, guestToken])

  // Pure width-driven orientation (see docblock).
  const wide = width >= (IS_WEB ? 1100 : 900)

  // Story pane engages from the route (mock demo) or the moment a live server
  // sends a scene frame — a scene with no board is a valid match.
  const storyMode = storyRoute || scene !== null

  const selfIds = new Set(seat !== null ? [seat] : [])
  const participants =
    players.length > 0 ? players.map(p => p.name).join(' vs ') : null

  const onSendChat = (text: string) => {
    clientRef.current?.sendChat(text)
  }
  const onChoose = (id: string) => {
    setSceneChosenId(id)
    clientRef.current?.sendChoice(id)
  }
  const onNewGame = () => setGeneration(g => g + 1)

  const onCreateMatch = async (kind: LaunchableGame) => {
    if (creating) return
    setCreating(kind)
    const res = await createLiveMatch(kind)
    setCreating(null)
    if (res.ok && res.matchID) {
      navigation.navigate('GameRoom', {matchId: res.matchID})
    } else {
      flashError(res.error ?? 'Could not create the match.')
    }
  }

  const subtitle = storyMode
    ? (scene?.title ?? 'Story')
    : participants
      ? `${GAME_TITLES[G.kind]} — ${participants}`
      : GAME_TITLES[G.kind]

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

  const board = (boardSize: number) => {
    if (live && !hasState) {
      return (
        <Text
          testID="gameJoining"
          style={[a.text_md, a.py_5xl, t.atoms.text_contrast_medium]}>
          Joining match…
        </Text>
      )
    }
    const sendMove = (move: {type: string; args: Record<string, unknown>}) =>
      clientRef.current?.sendMove(move)
    if (G.kind === 'checkers') {
      return (
        <CheckersBoard
          G={G}
          ctx={ctx}
          players={players}
          seat={seat}
          hotSeat={!live}
          boardSize={boardSize}
          onMove={(from, to) => sendMove({type: 'move', args: {from, to}})}
          onNewGame={live ? undefined : onNewGame}
        />
      )
    }
    if (G.kind === 'connect-four') {
      return (
        <ConnectFourBoard
          G={G}
          ctx={ctx}
          players={players}
          seat={seat}
          hotSeat={!live}
          boardSize={boardSize}
          onDrop={col => sendMove({type: 'drop', args: {col}})}
          onNewGame={live ? undefined : onNewGame}
        />
      )
    }
    if (G.kind === 'chess') {
      return (
        <ChessBoard
          G={G}
          ctx={ctx}
          players={players}
          seat={seat}
          hotSeat={!live}
          boardSize={boardSize}
          onMove={(from, to, promotion) =>
            sendMove({
              type: 'move',
              args: promotion ? {from, to, promotion} : {from, to},
            })
          }
          onNewGame={live ? undefined : onNewGame}
        />
      )
    }
    return (
      <Board
        G={G}
        ctx={ctx}
        players={players}
        boardSize={boardSize}
        onCellPress={cell => sendMove({type: 'place', args: {cell}})}
        onNewGame={live ? undefined : onNewGame}
      />
    )
  }

  // GUEST landing spot after the match: a gentle pointer back to wherever the
  // link came from (WhatsApp etc) — a guest has no account to keep browsing.
  const guestDone =
    isGuest && ctx.gameover ? (
      <Text
        testID="guestDoneHint"
        style={[a.text_sm, a.pt_xs, t.atoms.text_contrast_medium]}>
        ‹ Done — you can close this tab to get back to your chat.
      </Text>
    ) : null

  // "New game" launcher: signed-in lobby only (a guest's token is scoped to
  // one match; live rooms already have their game).
  const launcher =
    !live && !storyMode && !isGuest ? (
      <View style={[a.align_center, a.gap_xs, a.pt_lg]}>
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          {creating ? 'Creating match…' : 'Start a live match'}
        </Text>
        <View style={[a.flex_row, a.gap_sm]}>
          {LAUNCH_KINDS.map(kind => (
            <Button
              key={kind}
              testID={`newMatch-${kind}`}
              label={`New live ${LAUNCH_TITLES[kind]} match`}
              color="secondary"
              size="small"
              disabled={creating !== null}
              onPress={() => {
                void onCreateMatch(kind)
              }}>
              <ButtonText>{LAUNCH_TITLES[kind]}</ButtonText>
            </Button>
          ))}
        </View>
      </View>
    ) : null

  // Story mode: chatting with the GM IS the game — flavor the lane that way
  // instead of the board rooms' trash-talk framing.
  const chatLane = (
    <ChatLane
      messages={chat}
      selfIds={selfIds}
      onSend={onSendChat}
      placeholder={storyMode ? 'Ask, act, or accuse…' : undefined}
      emptyText={
        storyMode
          ? 'The game master is listening — questions and actions are both moves.'
          : undefined
      }
    />
  )

  const gamePane = (boardSize: number) =>
    storyMode ? (
      <View style={[a.flex_1, a.w_full]}>
        {statusStrip}
        <ScenePane scene={scene} chosenId={sceneChosenId} onChoose={onChoose} />
      </View>
    ) : (
      <View style={[a.align_center, a.gap_sm]}>
        {statusStrip}
        {board(boardSize)}
        {guestDone}
        {launcher}
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
      // Web Layout.Screen is minHeight:100dvh — a floor, not a ceiling — so
      // without a cap the CHAT LANE grows the page and pushes its own input
      // off-screen (found live at phone width with a replayed chat ring). The
      // room is a fixed split whose lanes scroll INTERNALLY: cap the screen at
      // the viewport. Native already bounds (height:100%).
      <Layout.Screen
        testID="gameRoomScreen"
        style={web({maxHeight: '100dvh', overflow: 'hidden'})}>
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
            {chatLane}
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
    // Web Layout.Screen is minHeight:100dvh — a floor, not a ceiling — so
    // without a cap the CHAT LANE grows the page and pushes its own input
    // off-screen (found live at phone width with a replayed chat ring). The
    // room is a fixed split whose lanes scroll INTERNALLY: cap the screen at
    // the viewport. Native already bounds (height:100%).
    <Layout.Screen
      testID="gameRoomScreen"
      style={web({maxHeight: '100dvh', overflow: 'hidden'})}>
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
          {chatLane}
        </View>
      </View>
    </Layout.Screen>
  )
}
