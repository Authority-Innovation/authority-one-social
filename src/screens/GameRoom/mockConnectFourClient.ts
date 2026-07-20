/**
 * CONNECT FOUR mock transport — the same in-memory hot-seat discipline as the
 * other board mocks (see createMockGameClient): moves are validated against
 * the pure rules, every accepted drop re-emits a full authoritative state
 * (with `legalMoves` for the side to move, exactly like the live server's
 * state frame), chat echoes back, gameover fires once. Taps act as the
 * CURRENT player so the board is developable solo.
 */
import {
  applyConnectFourDrop,
  connectFourGameover,
  connectFourLegalMoves,
  initialConnectFourG,
} from './connectFour'
import {MOCK_AGENT_ID, MOCK_AGENT_NAME} from './mockAgent'
import {
  type GameClient,
  type GameClientOptions,
  type GameCtx,
  type GameG,
  type GameMove,
  type PlayerInfo,
} from './types'

export function createMockConnectFourClient(
  opts: GameClientOptions,
): GameClient {
  const {playerID, name, callbacks} = opts
  let G = initialConnectFourG()
  let connected = false
  let gameoverSent = false
  const timers: Array<ReturnType<typeof setTimeout>> = []

  const players: PlayerInfo[] = [
    {id: playerID, name},
    {id: playerID === '0' ? '1' : '0', name: 'Guest'},
  ]

  const appG = (): GameG => ({
    kind: 'connect-four',
    ...G,
    legalMoves: connectFourLegalMoves(G),
  })
  const ctx = (): GameCtx => ({
    currentPlayer: G.currentPlayer,
    gameover: connectFourGameover(G),
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
      later(0, () => {
        callbacks.onConnection?.('online')
        callbacks.onPlayers(players)
        callbacks.onState(appG(), ctx(), players)
      })
      agentSay('Connect Four is up — tap a column, four in a row wins.', 900)
    },

    disconnect() {
      connected = false
      for (const id of timers) clearTimeout(id)
      timers.length = 0
    },

    sendMove(move: GameMove) {
      if (!connected) return
      if (move.type !== 'drop') return
      const col = Number((move.args as {col?: unknown} | undefined)?.col)
      const next = applyConnectFourDrop(G, col)
      if (!next) return // invalid — authoritative server would drop it too
      G = next
      later(0, () => callbacks.onState(appG(), ctx(), players))
      const over = connectFourGameover(G)
      if (over && !gameoverSent) {
        gameoverSent = true
        later(0, () => callbacks.onGameover(over.winner))
        agentSay(
          over.winner !== null
            ? 'Four in a row — that is the game! 🎉'
            : 'Board is full — a draw. Run it back?',
        )
      }
    },

    sendChat(text: string) {
      if (!connected) return
      const trimmed = text.trim()
      if (!trimmed) return
      later(0, () =>
        callbacks.onChat({from: playerID, name, text: trimmed, ts: Date.now()}),
      )
    },

    // Board matches have no branch points; only the story transports act on this.
    sendChoice() {},
  }
}
