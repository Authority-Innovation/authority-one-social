/**
 * Shared GameRoom transport types — the app-side shapes of the wire contract
 * documented in gameClient.ts. In their own module so every transport
 * (mock, live WebSocket, story mock) can import them without cycles.
 */
import {type CheckersG, type CheckersMove, type CheckersPiece} from './checkers'
import {type ChessG, type ChessMove} from './chess'
import {type ConnectFourG, type ConnectFourMove} from './connectFour'
import {type TicTacToeG} from './tictactoe'

export type {
  CheckersG,
  CheckersMove,
  CheckersPiece,
  ChessG,
  ChessMove,
  ConnectFourG,
  ConnectFourMove,
}

/** Which board game a match plays. Story matches never carry a board G. */
export type GameKind = 'tic-tac-toe' | 'checkers' | 'chess' | 'connect-four'

/** A move envelope. Tic-tac-toe uses {type:'place', args:{cell: 0-8}};
 *  checkers {type:'move', args:{from,to}} (board indices); chess
 *  {type:'move', args:{from:'e2', to:'e4', promotion?}}; connect four
 *  {type:'drop', args:{col: 0-6}}. */
export interface GameMove {
  type: string
  args?: Record<string, unknown>
}

/**
 * App-side game state: the wire `G` (plus the frame-level `legalMoves` for
 * games whose rules live server-side) tagged with the game it belongs to, so
 * the screen can pick the right board component off one field.
 */
export type GameG =
  | ({kind: 'tic-tac-toe'} & TicTacToeG)
  | ({kind: 'checkers'; legalMoves: CheckersMove[]} & CheckersG)
  | ({kind: 'chess'; legalMoves: ChessMove[]} & ChessG)
  | ({kind: 'connect-four'; legalMoves: ConnectFourMove[]} & ConnectFourG)

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

/** Client → server frames (documentation of the wire shape; the mocks never
 *  serialize). `token` is the GUEST capability token from a `?t=` link —
 *  validated and match-scoped server-side; omitted entirely for signed-in
 *  joins. */
export type ClientMsg =
  | {
      t: 'join'
      matchID: string
      playerID: string | null
      name: string
      token?: string
    }
  | {t: 'move'; move: GameMove}
  | {t: 'chat'; text: string}
  | {t: 'choice'; id: string}

/** Server → client frames (app-side shapes; the live client maps wire G /
 *  legalMoves / players). */
export type ServerMsg =
  | {t: 'state'; G: GameG; ctx: GameCtx; players: PlayerInfo[]}
  | {t: 'chat'; from: string; name: string; text: string; ts: number}
  | {t: 'players'; players: PlayerInfo[]}
  | {t: 'gameover'; winner: string | null}
  | {t: 'chat-history'; messages: GameChatMsg[]}
  | {t: 'error'; code: string; message: string}
  | ({t: 'scene'} & SceneFrame)

export interface GameCallbacks {
  onState: (G: GameG, ctx: GameCtx, players: PlayerInfo[]) => void
  onChat: (msg: GameChatMsg) => void
  /** The room's chat ring, sent ONCE to a joining socket (right after its
   *  state frame). REPLACE the local chat log with it — a re-join (refresh,
   *  reconnect) delivers it again, so appending would duplicate. */
  onChatHistory?: (msgs: GameChatMsg[]) => void
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
  /** Which game the MOCK transports should run (default tic-tac-toe). Live
   *  matches report their game through the state frame instead. */
  game?: GameKind
  /** Guest capability token (from a `?t=` link) to pass on the join frame.
   *  Absent for signed-in play. */
  token?: string
  callbacks: GameCallbacks
}

export interface GameClient {
  connect: () => void
  disconnect: () => void
  sendMove: (move: GameMove) => void
  sendChat: (text: string) => void
  sendChoice: (id: string) => void
}
