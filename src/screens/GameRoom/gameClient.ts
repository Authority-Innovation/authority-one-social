/**
 * GameClient — the SINGLE wiring point between the GameRoom screen and a
 * match transport. The screen only ever talks to this interface; swapping the
 * mock for the live GameMatchDO WebSocket happens in `createGameClient` below
 * and nowhere else.
 *
 * WIRE CONTRACT (agreed with the runtime session building the GameMatchDO —
 * one Durable Object per match, WebSocket per player):
 *
 *   Client → server:
 *     {t: 'join', matchID: string, playerID: string, name: string}
 *     {t: 'move', move: {type: string, args: object}}   // tic-tac-toe: {type:'place', args:{cell:0-8}}
 *     {t: 'chat', text: string}
 *
 *   Server → client:
 *     {t: 'state', G, ctx, players}      // authoritative snapshot after every accepted move
 *     {t: 'chat', from, name, text, ts}  // fan-out of every chat line (incl. the agent's)
 *     {t: 'players', players}            // presence roster changes
 *     {t: 'gameover', winner}            // winning playerID, or null for a draw
 *
 * TODO(game-runtime): when the GameMatchDO endpoint lands, add a
 * WebSocket-backed implementation here (open `wss://<runtime>/game/<matchID>`,
 * send the join frame, JSON.parse incoming frames into the ServerMsg union
 * below, and re-dispatch to the same callbacks) and return it from
 * `createGameClient` instead of the mock. Reconnection/backoff lives inside
 * that implementation — the screen stays transport-blind.
 */
import {applyPlace, gameoverOf, initialG, type TicTacToeG} from './tictactoe'

/** A move envelope. Tic-tac-toe uses {type:'place', args:{cell: 0-8}}. */
export interface GameMove {
  type: string
  args?: Record<string, unknown>
}

export interface PlayerInfo {
  id: string
  name: string
}

/** boardgame.io-style turn context echoed by the server with every state. */
export interface GameCtx {
  currentPlayer: string
  gameover?: {winner: string | null} | null
}

export interface GameChatMsg {
  from: string
  name: string
  text: string
  ts: number
}

/** Client → server frames (documentation of the wire shape; the mock never serializes). */
export type ClientMsg =
  | {t: 'join'; matchID: string; playerID: string; name: string}
  | {t: 'move'; move: GameMove}
  | {t: 'chat'; text: string}

/** Server → client frames. */
export type ServerMsg =
  | {t: 'state'; G: TicTacToeG; ctx: GameCtx; players: PlayerInfo[]}
  | {t: 'chat'; from: string; name: string; text: string; ts: number}
  | {t: 'players'; players: PlayerInfo[]}
  | {t: 'gameover'; winner: string | null}

export interface GameCallbacks {
  onState: (G: TicTacToeG, ctx: GameCtx, players: PlayerInfo[]) => void
  onChat: (msg: GameChatMsg) => void
  onPlayers: (players: PlayerInfo[]) => void
  onGameover: (winner: string | null) => void
}

export interface GameClientOptions {
  matchID: string
  playerID: string
  name: string
  callbacks: GameCallbacks
}

export interface GameClient {
  connect: () => void
  disconnect: () => void
  sendMove: (move: GameMove) => void
  sendChat: (text: string) => void
}

/**
 * Transport factory — the ONE swap point. Today every match runs on the local
 * mock (fully playable, hot-seat, with canned agent commentary) so the screen
 * is functional standalone. TODO(game-runtime): route to the WebSocket client
 * once the GameMatchDO contract above is live.
 */
export function createGameClient(opts: GameClientOptions): GameClient {
  return createMockGameClient(opts)
}

/** The agent commentator's sender id on the chat lane (mock). The live match
 *  will carry the real agent identity (handle/DID) in `from`. */
export const MOCK_AGENT_ID = 'agent:bob'
export const MOCK_AGENT_NAME = 'Bob'

const OPPONENT_NAME = 'Guest'

const OPENERS = [
  'Board is live — X goes first. Make it count!',
  'New game! May the best tapper win.',
]
const MID_GAME = [
  'Bold move.',
  'Center control — textbook.',
  'I see what you did there.',
  'The tension is unbearable.',
]
// Name-agnostic ("nice one, NAME" grammar breaks when the local fallback name
// is "You") — the real agent will compose these itself from the game event.
const WIN_LINES_CHAT = [
  'Three in a row — that’s the game! Well played 🎉',
  'And that’s the match! Rematch, anyone?',
]
const DRAW_LINES = [
  'A draw. Two unstoppable forces. Run it back?',
  "Cat's game! Nobody blinked.",
]

/**
 * Local mock transport: an in-memory authoritative match on this device.
 *
 * Semantics it deliberately shares with the real server: moves are validated
 * (occupied cell / finished game are dropped), every ACCEPTED move re-emits a
 * full authoritative state, chat is echoed back through onChat, and gameover
 * fires once. Mock-only convenience: it's a HOT-SEAT match — both players sit
 * at this device, so taps place for whichever player's turn it is (the live
 * server will instead reject out-of-turn moves from your socket).
 */
export function createMockGameClient(opts: GameClientOptions): GameClient {
  const {playerID, name, callbacks} = opts
  let G = initialG()
  let connected = false
  let gameoverSent = false
  let chatCount = 0
  const timers: Array<ReturnType<typeof setTimeout>> = []

  const players: PlayerInfo[] = [
    {id: playerID, name},
    {id: playerID === '0' ? '1' : '0', name: OPPONENT_NAME},
  ]

  const ctx = (): GameCtx => ({
    currentPlayer: G.currentPlayer,
    gameover: gameoverOf(G.board),
  })

  const later = (ms: number, fn: () => void) => {
    const id = setTimeout(() => {
      if (connected) fn()
    }, ms)
    timers.push(id)
  }

  const agentSay = (text: string, delayMs = 600) => {
    later(delayMs, () =>
      callbacks.onChat({
        from: MOCK_AGENT_ID,
        name: MOCK_AGENT_NAME,
        text,
        ts: Date.now(),
      }),
    )
  }

  return {
    connect() {
      if (connected) return
      connected = true
      // Async like a real socket: the roster and first snapshot arrive after
      // connect() returns, never re-entrantly.
      later(0, () => {
        callbacks.onPlayers(players)
        callbacks.onState(G, ctx(), players)
        agentSay(OPENERS[Math.floor(Math.random() * OPENERS.length)], 900)
      })
    },

    disconnect() {
      connected = false
      for (const id of timers) clearTimeout(id)
      timers.length = 0
    },

    sendMove(move: GameMove) {
      if (!connected) return
      if (move.type !== 'place') return
      const cell = Number((move.args as {cell?: unknown} | undefined)?.cell)
      // Hot-seat: the tap acts as the CURRENT player (see docblock above).
      const actor = G.currentPlayer
      const next = applyPlace(G, actor, cell)
      if (!next) return // invalid — authoritative server would drop it too
      G = next
      const over = gameoverOf(G.board)
      later(0, () => callbacks.onState(G, ctx(), players))
      if (over && !gameoverSent) {
        gameoverSent = true
        later(0, () => callbacks.onGameover(over.winner))
        if (over.winner !== null) {
          const line =
            WIN_LINES_CHAT[Math.floor(Math.random() * WIN_LINES_CHAT.length)]
          agentSay(line)
        } else {
          agentSay(DRAW_LINES[Math.floor(Math.random() * DRAW_LINES.length)])
        }
      } else if (!over) {
        // Comment occasionally, not every move — the real agent sits behind a
        // reply gate for exactly this reason.
        const placed = G.board.filter(c => c !== null).length
        if (placed === 1 || placed === 5) {
          agentSay(MID_GAME[Math.floor(Math.random() * MID_GAME.length)])
        }
      }
    },

    sendChat(text: string) {
      if (!connected) return
      const trimmed = text.trim()
      if (!trimmed) return
      // The server echoes every chat line to all sockets, including the sender.
      later(0, () =>
        callbacks.onChat({from: playerID, name, text: trimmed, ts: Date.now()}),
      )
      chatCount++
      // Canned in-character replies so the lane demos the agent conversation.
      if (chatCount % 2 === 1) {
        agentSay(
          chatCount === 1
            ? "Hey! I'm keeping score. Eyes on the board."
            : 'Less chat, more tic-tac-toe 😄',
          1200,
        )
      }
    },
  }
}
