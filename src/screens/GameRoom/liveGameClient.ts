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
import {type Cell, type TicTacToeG} from './tictactoe'
import {
  type GameClient,
  type GameClientOptions,
  type GameCtx,
  type GameErrorMsg,
  type GameMove,
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

/** Wire `G` ({cells}) + ctx → the app's TicTacToeG. PURE, defensive. */
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
    send({t: 'join', matchID, playerID: seat, name})
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
        const {G, ctx} = mapWireState(frame.G, frame.ctx)
        everJoined = true
        reconnectAttempt = 0
        callbacks.onConnection?.('online')
        callbacks.onState(G, ctx, mapWirePlayers(frame.players))
        break
      }
      case 'players':
        callbacks.onPlayers(mapWirePlayers(frame.players))
        break
      case 'chat':
        callbacks.onChat({
          from: typeof frame.from === 'string' ? frame.from : SPECTATOR_FROM,
          name: typeof frame.name === 'string' ? frame.name : '',
          text: typeof frame.text === 'string' ? frame.text : '',
          ts: typeof frame.ts === 'number' ? frame.ts : Date.now(),
        })
        break
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
      send({t: 'chat', text: trimmed})
    },

    sendChoice(id: string) {
      send({t: 'choice', id})
    },
  }
}
