/**
 * GameClient — the SINGLE wiring point between the GameRoom screen and a
 * match transport. The screen only ever talks to this interface; the factory
 * below picks between the LIVE GameMatchDO WebSocket (liveGameClient.ts) and
 * the local mocks, and nowhere else.
 *
 * WIRE CONTRACT (v1, per pilot-agent-runtime/GAMES.md — the DO is live):
 *
 *   Client → server:
 *     {t: 'join', matchID: string, playerID: '0'|'1'|null, name: string}  // null = spectator
 *     {t: 'move', move: {type: string, args: object}}   // tic-tac-toe: {type:'place', args:{cell:0-8}}
 *     {t: 'chat', text: string}
 *     {t: 'choice', id: string}          // STORY MODE: pick an authored branch (proposed v1 story ext)
 *
 *   Server → client:
 *     {t: 'state', G, ctx, players}      // authoritative snapshot; wire G={cells:[9]}, players is an
 *                                        // OBJECT keyed by playerID {name, connected} — the live client
 *                                        // maps both to the app shapes in types.ts
 *     {t: 'chat', from, name, text, ts}  // from: '0'|'1'|'agent'|null (spectator)
 *     {t: 'players', players}            // presence roster changes
 *     {t: 'gameover', winner}            // winning playerID, or null for a draw
 *     {t: 'error', code, message}        // invalid move / bad frame etc — sent to the offender only
 *     {t: 'scene', image?, title?, text, choices?: [{id, label}]}
 *                                        // STORY MODE (proposed v1 story ext): replaces the current
 *                                        // scene wholesale; no choices = free-text (chat) beat
 */
import {createLiveGameClient} from './liveGameClient'
import {createMockStoryClient} from './mockStoryClient'
import {applyPlace, gameoverOf, initialG} from './tictactoe'
import {
  type GameClient,
  type GameClientOptions,
  type GameCtx,
  type GameMove,
  type PlayerInfo,
} from './types'

export * from './types'

/** Which transport a room runs on. The SCREEN decides (live iff it navigated
 *  in with a real server matchID), the factory just routes. */
export type GameTransport = 'live' | 'mock' | 'mock-story'

/** Build-time escape hatch: EXPO_PUBLIC_GAME_TRANSPORT=mock forces every room
 *  onto the local mocks (offline dev / demos with no worker reachable). */
export const FORCE_MOCK_TRANSPORT =
  String(process.env.EXPO_PUBLIC_GAME_TRANSPORT ?? '')
    .trim()
    .toLowerCase() === 'mock'

/**
 * Transport factory — the ONE swap point. `live` opens a WebSocket into the
 * deployed GameMatchDO (capability-URL matchID); the mocks keep the screen
 * fully functional standalone (board hot-seat / canned story).
 */
export function createGameClient(
  opts: GameClientOptions & {transport?: GameTransport},
): GameClient {
  const transport =
    FORCE_MOCK_TRANSPORT && opts.transport === 'live' ? 'mock' : opts.transport
  if (transport === 'live') {
    return createLiveGameClient(opts)
  }
  if (transport === 'mock-story') {
    return createMockStoryClient(opts)
  }
  return createMockGameClient(opts)
}

/** The agent commentator's sender id on the chat lane (mock). The live match
 *  carries `from: 'agent'` for the real commentator. */
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
        callbacks.onConnection?.('online')
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

    // Board matches have no branch points; only the story transports act on this.
    sendChoice() {},
  }
}
