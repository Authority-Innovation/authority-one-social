/**
 * Shared GameRoom transport types — the app-side shapes of the wire contract
 * documented in gameClient.ts. In their own module so every transport
 * (mock, live WebSocket, story mock) can import them without cycles.
 */
import {type TicTacToeG} from './tictactoe'

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

/** One tappable authored branch point in a story scene. */
export interface SceneChoice {
  id: string
  label: string
}

/**
 * STORY MODE scene frame (server → client, minus the 't' tag). Each frame
 * replaces the current scene entirely. `image` is a plain https URL (the
 * agent-generated case-file / scene illustration); absent choices mean the
 * beat advances through free-text chat with the agent GM.
 */
export interface SceneFrame {
  image?: string
  title?: string
  text: string
  choices?: SceneChoice[]
}

/** Server error frame payload (invalid move, bad seat, …). */
export interface GameErrorMsg {
  code: string
  message: string
}

/** Live transport connection status, for a gentle UI indicator. */
export type GameConnectionStatus = 'connecting' | 'online' | 'reconnecting'

/** Client → server frames (documentation of the wire shape; the mocks never serialize). */
export type ClientMsg =
  | {t: 'join'; matchID: string; playerID: string | null; name: string}
  | {t: 'move'; move: GameMove}
  | {t: 'chat'; text: string}
  | {t: 'choice'; id: string}

/** Server → client frames (app-side shapes; the live client maps wire G/players). */
export type ServerMsg =
  | {t: 'state'; G: TicTacToeG; ctx: GameCtx; players: PlayerInfo[]}
  | {t: 'chat'; from: string; name: string; text: string; ts: number}
  | {t: 'players'; players: PlayerInfo[]}
  | {t: 'gameover'; winner: string | null}
  | {t: 'error'; code: string; message: string}
  | ({t: 'scene'} & SceneFrame)

export interface GameCallbacks {
  onState: (G: TicTacToeG, ctx: GameCtx, players: PlayerInfo[]) => void
  onChat: (msg: GameChatMsg) => void
  onPlayers: (players: PlayerInfo[]) => void
  onGameover: (winner: string | null) => void
  /** STORY MODE: a new scene replaces the current one. */
  onScene?: (scene: SceneFrame) => void
  /** Server rejected something we sent (invalid move etc). Surface gently. */
  onError?: (err: GameErrorMsg) => void
  /** The seat this client actually holds (may differ from the requested one
   *  after a seat-taken fallback; null = spectating). */
  onSeat?: (playerID: string | null) => void
  /** Live transport connectivity, for a subtle "reconnecting" indicator. */
  onConnection?: (status: GameConnectionStatus) => void
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
  sendChoice: (id: string) => void
}
