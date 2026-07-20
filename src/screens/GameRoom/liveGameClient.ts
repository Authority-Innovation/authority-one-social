/**
 * LIVE GameMatchDO transport — a WebSocket into the deployed game worker
 * (wire contract: pilot-agent-runtime/GAMES.md, summarized in gameClient.ts).
 *
 * Responsibilities beyond dumb frame passing:
 *  - SHAPE MAPPING: the wire sends `G={cells:[9]}`, `players` as an object
 *    keyed by playerID, and `ctx.gameover` as `{winner}|{draw:true}`; the
 *    screen consumes the app shapes in types.ts. Mapped here, tested purely.
 *  - SEAT CLAIM + FALLBACK: first join asks for the requested seat; if the
 *    server answers `seat-taken` we try the other seat, then spectate. The
 *    resolved seat is reported through onSeat so the screen re-attributes
 *    "You" and knows whether taps are live.
 *  - RECONNECT: any non-user close schedules a capped-backoff reconnect that
 *    re-joins the SAME seat (the DO allows re-claiming a seat whose sockets
 *    all died). `seat-taken` during a reconnect means the server still sees
 *    our zombie socket — retry, never fall over to the other seat.
 *  - ERRORS: every other `error` frame is surfaced via onError (the screen
 *    shows it gently); nothing throws.
 */
import {AGENT_RUNTIME_BASE_URL} from '#/lib/agent-runtime'
import {logger} from '#/logger'
import {CHECKERS_BOARD_SIZE, type CheckersCell} from './checkers'
import {INITIAL_FEN} from './chess'
import {
  C4_COLS,
  CONNECT_FOUR_BOARD_SIZE,
  type ConnectFourCell,
} from './connectFour'
import {type Cell, type TicTacToeG} from './tictactoe'
import {
  type CheckersMove,
  type ChessMove,
  type ConnectFourMove,
  type GameChatMsg,
  type GameClient,
  type GameClientOptions,
  type GameCtx,
  type GameErrorMsg,
  type GameG,
  type GameKind,
  type GameMove,
  type GameSeries,
  type PlayerInfo,
  type SceneFrame,
} from './types'

/**
 * Base URL of the game worker. The GameMatchDO rides the agent-runtime Worker
 * today; EXPO_PUBLIC_GAME_SERVER_URL repoints games independently if they ever
 * move off it.
 */
export const GAME_SERVER_BASE_URL: string =
  process.env.EXPO_PUBLIC_GAME_SERVER_URL ?? AGENT_RUNTIME_BASE_URL

/** wss:// capability URL for a match's room. PURE. */
export function gameWsUrl(
  matchID: string,
  base = GAME_SERVER_BASE_URL,
): string {
  const ws = base.replace(/^http/, 'ws').replace(/\/+$/, '')
  return `${ws}/games/${encodeURIComponent(matchID)}/ws`
}

/** Which game a wire state frame carries: the explicit `game` field when the
 *  server sends one, else inferred from the G shape. PURE. */
export function wireGameKind(frame: {game?: unknown; G?: unknown}): GameKind {
  if (
    frame.game === 'chess' ||
    frame.game === 'checkers' ||
    frame.game === 'connect-four' ||
    frame.game === 'tic-tac-toe'
  ) {
    return frame.game
  }
  const G = (frame.G ?? {}) as {fen?: unknown; board?: unknown}
  if (typeof G.fen === 'string') return 'chess'
  if (Array.isArray(G.board) && G.board.length === CHECKERS_BOARD_SIZE) {
    return 'checkers'
  }
  if (Array.isArray(G.board) && G.board.length === CONNECT_FOUR_BOARD_SIZE) {
    return 'connect-four'
  }
  return 'tic-tac-toe'
}

/** Wire checkers `G` ({board:[64], mustContinueFrom?}) + frame legalMoves +
 *  ctx → the app shape. PURE, defensive. */
export function mapWireCheckers(
  G: unknown,
  legalMoves: unknown,
  ctx: unknown,
): {G: GameG; ctx: GameCtx} {
  const wire = (G ?? {}) as {board?: unknown; mustContinueFrom?: unknown}
  const raw = Array.isArray(wire.board) ? wire.board : []
  const board: CheckersCell[] = Array.from(
    {length: CHECKERS_BOARD_SIZE},
    (_, i) => {
      const cell = raw[i] as {player?: unknown; king?: unknown} | null
      const player = Number(cell?.player)
      if (!cell || (player !== 0 && player !== 1)) return null
      return {player, king: cell.king === true}
    },
  )
  const moves: CheckersMove[] = Array.isArray(legalMoves)
    ? (legalMoves as Array<{from?: unknown; to?: unknown; captures?: unknown}>)
        .filter(
          m =>
            Number.isInteger(m?.from) &&
            Number.isInteger(m?.to) &&
            (m.from as number) >= 0 &&
            (m.from as number) < CHECKERS_BOARD_SIZE &&
            (m.to as number) >= 0 &&
            (m.to as number) < CHECKERS_BOARD_SIZE,
        )
        .map(m => ({
          from: m.from as number,
          to: m.to as number,
          ...(Array.isArray(m.captures)
            ? {captures: m.captures.filter(c => Number.isInteger(c))}
            : {}),
        }))
    : []
  const c = (ctx ?? {}) as {currentPlayer?: unknown; gameover?: unknown}
  const currentPlayer = c.currentPlayer === '1' ? '1' : '0'
  return {
    G: {
      kind: 'checkers',
      board,
      currentPlayer,
      mustContinueFrom: Number.isInteger(wire.mustContinueFrom)
        ? (wire.mustContinueFrom as number)
        : null,
      legalMoves: moves,
    },
    ctx: {currentPlayer, gameover: mapWireGameover(c.gameover)},
  }
}

/** Wire chess `G` ({fen, check?, lastMove?}) + frame legalMoves + ctx → the
 *  app shape. PURE, defensive. */
export function mapWireChess(
  G: unknown,
  legalMoves: unknown,
  ctx: unknown,
): {G: GameG; ctx: GameCtx} {
  const wire = (G ?? {}) as {fen?: unknown; check?: unknown; lastMove?: unknown}
  const last = wire.lastMove as {from?: unknown; to?: unknown} | null
  const moves: ChessMove[] = Array.isArray(legalMoves)
    ? (legalMoves as Array<{from?: unknown; to?: unknown; promotion?: unknown}>)
        .filter(m => typeof m?.from === 'string' && typeof m?.to === 'string')
        .map(m => ({
          from: m.from as string,
          to: m.to as string,
          ...(typeof m.promotion === 'string' ? {promotion: m.promotion} : {}),
        }))
    : []
  const c = (ctx ?? {}) as {currentPlayer?: unknown; gameover?: unknown}
  const currentPlayer = c.currentPlayer === '1' ? '1' : '0'
  return {
    G: {
      kind: 'chess',
      fen:
        typeof wire.fen === 'string' && wire.fen.length > 0
          ? wire.fen
          : INITIAL_FEN,
      check: wire.check === true,
      lastMove:
        last && typeof last.from === 'string' && typeof last.to === 'string'
          ? {from: last.from, to: last.to}
          : null,
      legalMoves: moves,
    },
    ctx: {currentPlayer, gameover: mapWireGameover(c.gameover)},
  }
}

/** Wire connect-four `G` ({board:[42 x (null|0|1)], lastMove?, winningLine?})
 *  + frame legalMoves ([{col}]) + ctx → the app shape. PURE, defensive. */
export function mapWireConnectFour(
  G: unknown,
  legalMoves: unknown,
  ctx: unknown,
): {G: GameG; ctx: GameCtx} {
  const wire = (G ?? {}) as {
    board?: unknown
    lastMove?: unknown
    winningLine?: unknown
  }
  const raw = Array.isArray(wire.board) ? wire.board : []
  const board: ConnectFourCell[] = Array.from(
    {length: CONNECT_FOUR_BOARD_SIZE},
    (_, i) => (raw[i] === 0 || raw[i] === 1 ? (raw[i] as 0 | 1) : null),
  )
  const moves: ConnectFourMove[] = Array.isArray(legalMoves)
    ? (legalMoves as Array<{col?: unknown}>)
        .filter(
          m =>
            Number.isInteger(m?.col) &&
            (m.col as number) >= 0 &&
            (m.col as number) < C4_COLS,
        )
        .map(m => ({col: m.col as number}))
    : []
  const last = wire.lastMove as {row?: unknown; col?: unknown} | null
  const line = Array.isArray(wire.winningLine)
    ? wire.winningLine.filter(
        (i): i is number =>
          Number.isInteger(i) &&
          (i as number) >= 0 &&
          (i as number) < CONNECT_FOUR_BOARD_SIZE,
      )
    : []
  const c = (ctx ?? {}) as {currentPlayer?: unknown; gameover?: unknown}
  const currentPlayer = c.currentPlayer === '1' ? '1' : '0'
  return {
    G: {
      kind: 'connect-four',
      board,
      currentPlayer,
      lastMove:
        last && Number.isInteger(last.row) && Number.isInteger(last.col)
          ? {row: last.row as number, col: last.col as number}
          : null,
      winningLine: line.length === 4 ? line : null,
      legalMoves: moves,
    },
    ctx: {currentPlayer, gameover: mapWireGameover(c.gameover)},
  }
}

/** One wire state frame → the app's tagged GameG + ctx, whatever the game. */
export function mapWireGameFrame(frame: {
  game?: unknown
  G?: unknown
  ctx?: unknown
  legalMoves?: unknown
  [k: string]: unknown
}): {G: GameG; ctx: GameCtx} {
  const kind = wireGameKind(frame)
  if (kind === 'chess') {
    return mapWireChess(frame.G, frame.legalMoves, frame.ctx)
  }
  if (kind === 'checkers') {
    return mapWireCheckers(frame.G, frame.legalMoves, frame.ctx)
  }
  if (kind === 'connect-four') {
    return mapWireConnectFour(frame.G, frame.legalMoves, frame.ctx)
  }
  const {G, ctx} = mapWireState(frame.G, frame.ctx)
  return {G: {kind: 'tic-tac-toe', ...G}, ctx}
}

/** Wire tic-tac-toe `G` ({cells}) + ctx → the app's TicTacToeG. PURE, defensive. */
export function mapWireState(
  G: unknown,
  ctx: unknown,
): {G: TicTacToeG; ctx: GameCtx} {
  const cells = Array.isArray((G as {cells?: unknown})?.cells)
    ? ((G as {cells: unknown[]}).cells as Cell[])
    : []
  const board: Cell[] = Array.from({length: 9}, (_, i) =>
    cells[i] === '0' || cells[i] === '1' ? cells[i] : null,
  )
  const c = (ctx ?? {}) as {currentPlayer?: unknown; gameover?: unknown}
  const currentPlayer = c.currentPlayer === '1' ? '1' : '0'
  return {
    G: {board, currentPlayer},
    ctx: {currentPlayer, gameover: mapWireGameover(c.gameover)},
  }
}

/** Wire `series` ({round, firstMover?, score}) → GameSeries, or null when
 *  absent/malformed. PURE, defensive — non-numeric score entries dropped. */
export function mapWireSeries(series: unknown): GameSeries | null {
  if (!series || typeof series !== 'object') return null
  const s = series as {round?: unknown; firstMover?: unknown; score?: unknown}
  if (!Number.isInteger(s.round) || (s.round as number) < 1) return null
  const score: Record<string, number> = {}
  if (s.score && typeof s.score === 'object' && !Array.isArray(s.score)) {
    for (const [k, v] of Object.entries(s.score as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) score[k] = v
    }
  }
  return {
    round: s.round as number,
    ...(typeof s.firstMover === 'string' ? {firstMover: s.firstMover} : {}),
    score,
  }
}

/** Wire ctx.gameover ({winner:"0"} | {draw:true}) → {winner|null}. PURE. */
export function mapWireGameover(
  gameover: unknown,
): {winner: string | null} | null {
  if (!gameover || typeof gameover !== 'object') return null
  const g = gameover as {winner?: unknown; draw?: unknown}
  if (g.draw === true) return {winner: null}
  if (typeof g.winner === 'string') return {winner: g.winner}
  return {winner: null}
}

/** Wire players object ({"0":{name,connected}}) → PlayerInfo[]. PURE. */
export function mapWirePlayers(players: unknown): PlayerInfo[] {
  if (!players || typeof players !== 'object') return []
  if (Array.isArray(players)) {
    return (players as unknown[]).filter((p): p is PlayerInfo => {
      const q = p as {id?: unknown; name?: unknown} | null
      return !!q && typeof q.id === 'string' && typeof q.name === 'string'
    })
  }
  return Object.entries(players as Record<string, {name?: unknown}>).map(
    ([id, p]) => ({id, name: typeof p?.name === 'string' ? p.name : id}),
  )
}

/** Sender id for chat frames whose `from` is null (spectators). */
const SPECTATOR_FROM = 'spectator'

/** One wire chat payload ({from,name,text,ts}) → the app shape. PURE,
 *  defensive — shared by live `chat` frames and the join-time ring replay. */
export function mapWireChatMsg(m: {[k: string]: unknown}): GameChatMsg {
  return {
    from: typeof m.from === 'string' ? m.from : SPECTATOR_FROM,
    name: typeof m.name === 'string' ? m.name : '',
    text: typeof m.text === 'string' ? m.text : '',
    ts: typeof m.ts === 'number' ? m.ts : Date.now(),
  }
}

const RECONNECT_BASE_MS = 750
const RECONNECT_MAX_MS = 15_000

/** Minimal WebSocket surface the client needs (injectable for tests). */
export type WebSocketLike = {
  readyState: number
  send: (data: string) => void
  close: () => void
  onopen: ((ev?: unknown) => void) | null
  onmessage: ((ev: {data: unknown}) => void) | null
  onclose: ((ev?: unknown) => void) | null
  onerror: ((ev?: unknown) => void) | null
}

export interface LiveGameClientOptions extends GameClientOptions {
  /** Override the worker base URL (tests / staging). */
  baseUrl?: string
  /** Injectable WebSocket constructor for tests. Defaults to the global. */
  webSocketImpl?: new (url: string) => WebSocketLike
}

const WS_OPEN = 1

export function createLiveGameClient(opts: LiveGameClientOptions): GameClient {
  const {matchID, name, callbacks} = opts
  const WS =
    opts.webSocketImpl ??
    (WebSocket as unknown as new (url: string) => WebSocketLike)
  const url = gameWsUrl(matchID, opts.baseUrl)

  let ws: WebSocketLike | null = null
  let closedByUser = false
  /** Chat typed while the socket was down (the composer clears immediately,
   *  so a silent drop loses the words) — flushed once the server has
   *  re-accepted us (first state frame after a join). Only chat is queued:
   *  a stale move/choice against a changed board should NOT auto-fire. */
  const pendingChat: string[] = []
  /** The seat we are currently claiming ('0' | '1' | null = spectator). */
  let seat: string | null = opts.playerID
  /** True once the server has accepted us into the room (first state frame). */
  let everJoined = false
  let reconnectAttempt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  const send = (frame: object) => {
    if (ws && ws.readyState === WS_OPEN) {
      try {
        ws.send(JSON.stringify(frame))
      } catch (e) {
        logger.warn('game: ws send failed', {safeMessage: String(e)})
      }
    }
  }

  const joinCurrentSeat = () => {
    // The guest capability token (?t= link) rides every join — including
    // seat-fallback and reconnect re-joins — so the DO can authorize the
    // account-less socket. Omitted entirely for signed-in play.
    send({
      t: 'join',
      matchID,
      playerID: seat,
      name,
      ...(opts.token ? {token: opts.token} : {}),
    })
    callbacks.onSeat?.(seat)
  }

  const scheduleReconnect = () => {
    if (closedByUser || reconnectTimer) return
    callbacks.onConnection?.('reconnecting')
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** reconnectAttempt,
      RECONNECT_MAX_MS,
    )
    reconnectAttempt++
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      open()
    }, delay)
  }

  const handleFrame = (frame: {[k: string]: unknown; t?: unknown}) => {
    switch (frame.t) {
      case 'state': {
        const {G, ctx} = mapWireGameFrame(frame)
        everJoined = true
        reconnectAttempt = 0
        callbacks.onConnection?.('online')
        callbacks.onState(G, ctx, mapWirePlayers(frame.players))
        const series = mapWireSeries(frame.series)
        if (series) callbacks.onSeries?.(series)
        for (const text of pendingChat.splice(0)) {
          send({t: 'chat', text})
        }
        break
      }
      case 'players':
        callbacks.onPlayers(mapWirePlayers(frame.players))
        break
      case 'chat':
        callbacks.onChat(mapWireChatMsg(frame))
        break
      case 'chat-history': {
        // Join-time replay of the room's chat ring (GAMES.md: sent once to a
        // joining socket, oldest first) — the screen REPLACES its log with it
        // so refresh/reconnect restores chat without duplicating.
        if (!Array.isArray(frame.messages)) break
        callbacks.onChatHistory?.(
          (frame.messages as Array<{[k: string]: unknown}>)
            .filter(m => m && typeof m === 'object')
            .map(mapWireChatMsg),
        )
        break
      }
      case 'gameover':
        callbacks.onGameover(
          typeof frame.winner === 'string' ? frame.winner : null,
        )
        break
      case 'scene': {
        const scene: SceneFrame = {
          image: typeof frame.image === 'string' ? frame.image : undefined,
          title: typeof frame.title === 'string' ? frame.title : undefined,
          text: typeof frame.text === 'string' ? frame.text : '',
          choices: Array.isArray(frame.choices)
            ? (frame.choices as Array<{id?: unknown; label?: unknown}>)
                .filter(
                  c =>
                    typeof c?.id === 'string' && typeof c?.label === 'string',
                )
                .map(c => ({id: c.id as string, label: c.label as string}))
            : undefined,
        }
        callbacks.onScene?.(scene)
        break
      }
      case 'error': {
        const err: GameErrorMsg = {
          code: typeof frame.code === 'string' ? frame.code : 'unknown',
          message:
            typeof frame.message === 'string' ? frame.message : 'Game error',
        }
        if (err.code === 'seat-taken') {
          if (!everJoined && seat === opts.playerID && seat !== null) {
            // First claim lost the race: take the other seat.
            seat = seat === '0' ? '1' : '0'
            joinCurrentSeat()
            return
          }
          if (!everJoined && seat !== null) {
            // Both seats held — watch the match instead of erroring out.
            seat = null
            joinCurrentSeat()
            return
          }
          if (everJoined) {
            // Reconnect raced our own zombie socket; the DO frees the seat
            // once it notices the old socket died. Back off and retry.
            ws?.close()
            return
          }
        }
        callbacks.onError?.(err)
        break
      }
      default:
        break
    }
  }

  const open = () => {
    if (closedByUser) return
    callbacks.onConnection?.(everJoined ? 'reconnecting' : 'connecting')
    let socket: WebSocketLike
    try {
      socket = new WS(url)
    } catch (e) {
      logger.warn('game: ws open failed', {safeMessage: String(e)})
      scheduleReconnect()
      return
    }
    ws = socket
    socket.onopen = () => {
      if (socket !== ws) return
      joinCurrentSeat()
    }
    socket.onmessage = ev => {
      if (socket !== ws) return
      let frame: unknown
      try {
        frame = JSON.parse(String(ev.data))
      } catch {
        return // never crash on a malformed frame
      }
      if (frame && typeof frame === 'object') {
        handleFrame(frame as {[k: string]: unknown})
      }
    }
    socket.onclose = () => {
      if (socket !== ws) return
      ws = null
      scheduleReconnect()
    }
    socket.onerror = () => {
      // The close event follows and owns reconnection; nothing to do here.
    }
  }

  return {
    connect() {
      closedByUser = false
      if (ws) return
      open()
    },

    disconnect() {
      closedByUser = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      const socket = ws
      ws = null
      socket?.close()
    },

    sendMove(move: GameMove) {
      send({t: 'move', move})
    },

    sendChat(text: string) {
      const trimmed = text.trim()
      if (!trimmed) return
      if (!ws || ws.readyState !== WS_OPEN) {
        pendingChat.push(trimmed)
        return
      }
      send({t: 'chat', text: trimmed})
    },

    sendChoice(id: string) {
      send({t: 'choice', id})
    },

    sendRematch() {
      // Reset-in-place: same matchID (so a guest's match-scoped token stays
      // valid), no navigation — the server answers with a fresh state frame
      // (or a rematch-not-allowed error, surfaced via the onError path).
      send({t: 'rematch'})
    },
  }
}
