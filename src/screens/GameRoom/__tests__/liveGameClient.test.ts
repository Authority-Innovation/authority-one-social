import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals'

import {
  createLiveGameClient,
  gameWsUrl,
  mapWireCheckers,
  mapWireChess,
  mapWireConnectFour,
  mapWireGameFrame,
  mapWireGameover,
  mapWirePlayers,
  mapWireState,
  type WebSocketLike,
  wireGameKind,
} from '../liveGameClient'
import {
  type GameCallbacks,
  type GameChatMsg,
  type GameClient,
  type GameConnectionStatus,
  type GameCtx,
  type GameErrorMsg,
  type PlayerInfo,
  type SceneFrame,
} from '../types'

/** Scripted stand-in for the wire socket. Frames are driven from the tests. */
class FakeWebSocket implements WebSocketLike {
  static instances: FakeWebSocket[] = []
  static latest(): FakeWebSocket {
    return FakeWebSocket.instances[FakeWebSocket.instances.length - 1]
  }

  readyState = 0
  sent: Array<Record<string, unknown>> = []
  onopen: ((ev?: unknown) => void) | null = null
  onmessage: ((ev: {data: unknown}) => void) | null = null
  onclose: ((ev?: unknown) => void) | null = null
  onerror: ((ev?: unknown) => void) | null = null

  constructor(public url: string) {
    FakeWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(JSON.parse(data))
  }

  close() {
    if (this.readyState === 3) return
    this.readyState = 3
    this.onclose?.()
  }

  // test drivers
  serverOpen() {
    this.readyState = 1
    this.onopen?.()
  }
  serverSend(frame: object) {
    this.onmessage?.({data: JSON.stringify(frame)})
  }
  serverDrop() {
    this.readyState = 3
    this.onclose?.()
  }
}

function harness() {
  const states: Array<{G: unknown; ctx: GameCtx; players: PlayerInfo[]}> = []
  const chats: GameChatMsg[] = []
  const histories: GameChatMsg[][] = []
  const rosters: PlayerInfo[][] = []
  const gameovers: Array<string | null> = []
  const scenes: SceneFrame[] = []
  const errors: GameErrorMsg[] = []
  const seats: Array<string | null> = []
  const connections: GameConnectionStatus[] = []
  const callbacks: GameCallbacks = {
    onState: (G, ctx, players) => states.push({G, ctx, players}),
    onChat: m => chats.push(m),
    onChatHistory: msgs => histories.push(msgs),
    onPlayers: p => rosters.push(p),
    onGameover: w => gameovers.push(w),
    onScene: s => scenes.push(s),
    onError: e => errors.push(e),
    onSeat: s => seats.push(s),
    onConnection: c => connections.push(c),
  }
  return {
    callbacks,
    states,
    chats,
    histories,
    rosters,
    gameovers,
    scenes,
    errors,
    seats,
    connections,
  }
}

const WIRE_STATE = {
  t: 'state',
  G: {cells: [null, null, null, null, '0', null, null, null, null]},
  ctx: {currentPlayer: '1', turn: 2},
  players: {
    '0': {name: 'Elliott', connected: true},
    '1': {name: 'Ada', connected: true},
  },
}

describe('wire mapping', () => {
  it('maps wire G {cells} + ctx to the app TicTacToeG shape', () => {
    const {G, ctx} = mapWireState(WIRE_STATE.G, WIRE_STATE.ctx)
    expect(G.board).toEqual([
      null,
      null,
      null,
      null,
      '0',
      null,
      null,
      null,
      null,
    ])
    expect(G.currentPlayer).toBe('1')
    expect(ctx.currentPlayer).toBe('1')
    expect(ctx.gameover).toBeNull()
  })

  it('pads/normalizes a malformed board to 9 cells', () => {
    const {G} = mapWireState(
      {cells: ['0', 'x', undefined]},
      {currentPlayer: '9'},
    )
    expect(G.board).toHaveLength(9)
    expect(G.board[0]).toBe('0')
    expect(G.board[1]).toBeNull()
    expect(G.currentPlayer).toBe('0')
  })

  it('maps gameover {winner} and {draw:true}', () => {
    expect(mapWireGameover({winner: '1'})).toEqual({winner: '1'})
    expect(mapWireGameover({draw: true})).toEqual({winner: null})
    expect(mapWireGameover(undefined)).toBeNull()
  })

  it('maps the players object to a PlayerInfo array', () => {
    expect(mapWirePlayers(WIRE_STATE.players)).toEqual([
      {id: '0', name: 'Elliott'},
      {id: '1', name: 'Ada'},
    ])
    expect(mapWirePlayers(undefined)).toEqual([])
  })

  it('builds a wss capability URL from the https base', () => {
    expect(gameWsUrl('abc-123', 'https://worker.example.dev')).toBe(
      'wss://worker.example.dev/games/abc-123/ws',
    )
  })
})

describe('per-game wire mapping', () => {
  const CHECKERS_BOARD = Array(64).fill(null)
  CHECKERS_BOARD[35] = {player: 0, king: false}
  CHECKERS_BOARD[28] = {player: 1, king: true}

  it('detects the game from an explicit game field or the G shape', () => {
    expect(wireGameKind({game: 'chess'})).toBe('chess')
    expect(wireGameKind({game: 'checkers'})).toBe('checkers')
    expect(wireGameKind({game: 'connect-four'})).toBe('connect-four')
    expect(wireGameKind({G: {fen: 'x'}})).toBe('chess')
    expect(wireGameKind({G: {board: CHECKERS_BOARD}})).toBe('checkers')
    expect(wireGameKind({G: {board: Array(42).fill(null)}})).toBe(
      'connect-four',
    )
    expect(wireGameKind({G: {cells: Array(9).fill(null)}})).toBe('tic-tac-toe')
    expect(wireGameKind({})).toBe('tic-tac-toe')
  })

  it('maps a checkers state frame (board, mustContinueFrom, legalMoves)', () => {
    const {G, ctx} = mapWireCheckers(
      {board: CHECKERS_BOARD, mustContinueFrom: 35},
      [
        {from: 35, to: 21, captures: [28]},
        {from: -1, to: 999}, // out of range — dropped
        {from: 'x', to: 21}, // malformed — dropped
      ],
      {currentPlayer: '0'},
    )
    if (G.kind !== 'checkers') throw new Error('expected checkers G')
    expect(G.board).toHaveLength(64)
    expect(G.board[35]).toEqual({player: 0, king: false})
    expect(G.board[28]).toEqual({player: 1, king: true})
    expect(G.mustContinueFrom).toBe(35)
    expect(G.legalMoves).toEqual([{from: 35, to: 21, captures: [28]}])
    expect(ctx.currentPlayer).toBe('0')
    expect(ctx.gameover).toBeNull()
  })

  it('normalizes malformed checkers cells and absent legalMoves', () => {
    const {G} = mapWireCheckers(
      {board: [{player: 2}, 'junk', {player: '1', king: true}]},
      undefined,
      {},
    )
    if (G.kind !== 'checkers') throw new Error('expected checkers G')
    expect(G.board[0]).toBeNull()
    expect(G.board[1]).toBeNull()
    expect(G.board[2]).toEqual({player: 1, king: true})
    expect(G.legalMoves).toEqual([])
    expect(G.mustContinueFrom).toBeNull()
  })

  it('maps a chess state frame (fen, check, lastMove, legalMoves)', () => {
    const {G, ctx} = mapWireChess(
      {
        fen: '8/8/8/8/8/8/8/k6K b - - 0 1',
        check: true,
        lastMove: {from: 'e2', to: 'e4'},
      },
      [
        {from: 'a1', to: 'a2'},
        {from: 'a7', to: 'a8', promotion: 'q'},
        {from: 7, to: 'a2'}, // malformed — dropped
      ],
      {currentPlayer: '1', gameover: {winner: '0'}},
    )
    if (G.kind !== 'chess') throw new Error('expected chess G')
    expect(G.fen).toBe('8/8/8/8/8/8/8/k6K b - - 0 1')
    expect(G.check).toBe(true)
    expect(G.lastMove).toEqual({from: 'e2', to: 'e4'})
    expect(G.legalMoves).toEqual([
      {from: 'a1', to: 'a2'},
      {from: 'a7', to: 'a8', promotion: 'q'},
    ])
    expect(ctx.currentPlayer).toBe('1')
    expect(ctx.gameover).toEqual({winner: '0'})
  })

  it('maps a connect-four state frame (board, lastMove, winningLine, legalMoves)', () => {
    const board = Array(42).fill(null)
    board[5 * 7 + 3] = 0
    board[4 * 7 + 3] = 1
    const {G, ctx} = mapWireConnectFour(
      {board, lastMove: {row: 4, col: 3}, winningLine: null},
      [
        {col: 0},
        {col: 6},
        {col: -1}, // out of range — dropped
        {col: 'x'}, // malformed — dropped
      ],
      {currentPlayer: '0'},
    )
    if (G.kind !== 'connect-four') throw new Error('expected connect-four G')
    expect(G.board).toHaveLength(42)
    expect(G.board[5 * 7 + 3]).toBe(0)
    expect(G.board[4 * 7 + 3]).toBe(1)
    expect(G.lastMove).toEqual({row: 4, col: 3})
    expect(G.winningLine).toBeNull()
    expect(G.legalMoves).toEqual([{col: 0}, {col: 6}])
    expect(ctx.currentPlayer).toBe('0')
    expect(ctx.gameover).toBeNull()
  })

  it('normalizes malformed connect-four cells, lastMove, and winningLine', () => {
    const {G} = mapWireConnectFour(
      {
        board: [2, '0', 1, 'junk', 0],
        lastMove: {row: 'x', col: 1},
        winningLine: [38, 39, 40], // not four cells — dropped
      },
      undefined,
      {},
    )
    if (G.kind !== 'connect-four') throw new Error('expected connect-four G')
    expect(G.board[0]).toBeNull()
    expect(G.board[1]).toBeNull()
    expect(G.board[2]).toBe(1)
    expect(G.board[3]).toBeNull()
    expect(G.board[4]).toBe(0)
    expect(G.lastMove).toBeNull()
    expect(G.winningLine).toBeNull()
    expect(G.legalMoves).toEqual([])
  })

  it('maps a winning connect-four frame with the four cells', () => {
    const board = Array(42).fill(null)
    for (const i of [38, 39, 40, 41]) board[i] = 1
    const {G, ctx} = mapWireConnectFour(
      {board, lastMove: {row: 5, col: 6}, winningLine: [38, 39, 40, 41]},
      [],
      {currentPlayer: '0', gameover: {winner: '1'}},
    )
    if (G.kind !== 'connect-four') throw new Error('expected connect-four G')
    expect(G.winningLine).toEqual([38, 39, 40, 41])
    expect(ctx.gameover).toEqual({winner: '1'})
  })

  it('mapWireGameFrame routes to the right mapper and tags the kind', () => {
    expect(
      mapWireGameFrame({G: {cells: Array(9).fill(null)}, ctx: {}}).G.kind,
    ).toBe('tic-tac-toe')
    expect(
      mapWireGameFrame({game: 'checkers', G: {board: []}, ctx: {}}).G.kind,
    ).toBe('checkers')
    expect(mapWireGameFrame({G: {fen: 'x'}, ctx: {}}).G.kind).toBe('chess')
    expect(
      mapWireGameFrame({G: {board: Array(42).fill(null)}, ctx: {}}).G.kind,
    ).toBe('connect-four')
    expect(
      mapWireGameFrame({game: 'connect-four', G: {board: []}, ctx: {}}).G.kind,
    ).toBe('connect-four')
  })
})

describe('createLiveGameClient', () => {
  let client: GameClient | null = null

  beforeEach(() => {
    jest.useFakeTimers()
    FakeWebSocket.instances = []
  })
  afterEach(() => {
    client?.disconnect()
    client = null
    jest.useRealTimers()
  })

  function connect(h = harness(), seat = '0') {
    client = createLiveGameClient({
      matchID: 'm-uuid',
      playerID: seat,
      name: 'Elliott',
      callbacks: h.callbacks,
      baseUrl: 'https://worker.example.dev',
      webSocketImpl: FakeWebSocket,
    })
    client.connect()
    return h
  }

  it('joins its seat on open and maps the state snapshot', () => {
    const h = connect()
    const ws = FakeWebSocket.latest()
    expect(ws.url).toBe('wss://worker.example.dev/games/m-uuid/ws')
    ws.serverOpen()
    expect(ws.sent[0]).toEqual({
      t: 'join',
      matchID: 'm-uuid',
      playerID: '0',
      name: 'Elliott',
    })
    expect(h.seats).toEqual(['0'])
    ws.serverSend(WIRE_STATE)
    expect(h.states).toHaveLength(1)
    expect(h.states[0].players).toEqual([
      {id: '0', name: 'Elliott'},
      {id: '1', name: 'Ada'},
    ])
    expect(h.connections[h.connections.length - 1]).toBe('online')
  })

  it('serializes move, chat, and choice frames per the contract', () => {
    connect()
    const ws = FakeWebSocket.latest()
    ws.serverOpen()
    client!.sendMove({type: 'place', args: {cell: 4}})
    client!.sendChat('  gg  ')
    client!.sendChoice('question-guests')
    expect(ws.sent.slice(1)).toEqual([
      {t: 'move', move: {type: 'place', args: {cell: 4}}},
      {t: 'chat', text: 'gg'},
      {t: 'choice', id: 'question-guests'},
    ])
  })

  it('re-dispatches chat, gameover, scene, and error frames', () => {
    const h = connect()
    const ws = FakeWebSocket.latest()
    ws.serverOpen()
    ws.serverSend({t: 'chat', from: 'agent', name: 'Bob', text: 'hi', ts: 5})
    ws.serverSend({t: 'chat', from: null, name: 'Visitor', text: 'o/', ts: 6})
    ws.serverSend({t: 'gameover', winner: null})
    ws.serverSend({
      t: 'scene',
      image: 'https://img.example/1.png',
      title: 'Act I',
      text: 'It begins.',
      choices: [
        {id: 'go', label: 'Go'},
        {id: 7, label: 'bad'},
      ],
    })
    ws.serverSend({t: 'error', code: 'invalid-move', message: 'cell taken'})
    // Non-object and malformed payloads are ignored, never thrown.
    ws.onmessage?.({data: '"not json at all"'})
    ws.onmessage?.({data: '{{{'})
    expect(h.chats[0]).toMatchObject({from: 'agent', name: 'Bob', text: 'hi'})
    expect(h.chats[1].from).toBe('spectator')
    expect(h.gameovers).toEqual([null])
    expect(h.scenes[0]).toEqual({
      image: 'https://img.example/1.png',
      title: 'Act I',
      text: 'It begins.',
      choices: [{id: 'go', label: 'Go'}],
    })
    expect(h.errors[0]).toEqual({code: 'invalid-move', message: 'cell taken'})
  })

  it('replays the join-time chat-history ring through onChatHistory', () => {
    const h = connect()
    const ws = FakeWebSocket.latest()
    ws.serverOpen()
    ws.serverSend({
      t: 'chat-history',
      messages: [
        {from: '0', name: 'Elliott', text: 'who had keys?', ts: 1},
        {from: 'agent', name: 'Marlowe', text: 'three keys exist', ts: 2},
        {from: null, name: 'Visitor', text: 'o/', ts: 3},
        'garbage-entry',
      ],
    })
    // One replay batch, defensively mapped — NOT appended through onChat.
    expect(h.histories).toHaveLength(1)
    expect(h.histories[0]).toHaveLength(3)
    expect(h.histories[0][0]).toMatchObject({from: '0', text: 'who had keys?'})
    expect(h.histories[0][1]).toMatchObject({from: 'agent', name: 'Marlowe'})
    expect(h.histories[0][2].from).toBe('spectator')
    expect(h.chats).toHaveLength(0)
    // A malformed frame is ignored, never thrown.
    ws.serverSend({t: 'chat-history', messages: 'nope'})
    expect(h.histories).toHaveLength(1)
  })

  it('queues chat typed while the socket is down and flushes after re-join', () => {
    connect()
    const first = FakeWebSocket.latest()
    first.serverOpen()
    first.serverSend(WIRE_STATE)
    first.serverDrop()
    // The composer already cleared — this text must not be lost.
    client!.sendChat('did you see the ledger?')
    jest.advanceTimersByTime(1000)
    const second = FakeWebSocket.latest()
    expect(second).not.toBe(first)
    second.serverOpen()
    // Not yet flushed: the server has not re-accepted us (no state frame).
    expect(second.sent.filter(f => f.t === 'chat')).toHaveLength(0)
    second.serverSend(WIRE_STATE)
    expect(second.sent.filter(f => f.t === 'chat')).toEqual([
      {t: 'chat', text: 'did you see the ledger?'},
    ])
    // Flushed once, not resent on the next state frame.
    second.serverSend(WIRE_STATE)
    expect(second.sent.filter(f => f.t === 'chat')).toHaveLength(1)
  })

  it('falls back to the other seat, then spectator, on seat-taken', () => {
    const h = connect()
    const ws = FakeWebSocket.latest()
    ws.serverOpen()
    ws.serverSend({t: 'error', code: 'seat-taken', message: 'seat 0 is held'})
    expect(ws.sent[1]).toMatchObject({t: 'join', playerID: '1'})
    ws.serverSend({t: 'error', code: 'seat-taken', message: 'seat 1 is held'})
    expect(ws.sent[2]).toMatchObject({t: 'join', playerID: null})
    expect(h.seats).toEqual(['0', '1', null])
    // Spectating is not an error condition.
    expect(h.errors).toHaveLength(0)
  })

  it('reconnects with backoff after a drop and re-joins the SAME seat', () => {
    const h = connect()
    const first = FakeWebSocket.latest()
    first.serverOpen()
    first.serverSend(WIRE_STATE)
    first.serverDrop()
    expect(h.connections[h.connections.length - 1]).toBe('reconnecting')
    jest.advanceTimersByTime(800)
    const second = FakeWebSocket.latest()
    expect(second).not.toBe(first)
    second.serverOpen()
    expect(second.sent[0]).toMatchObject({t: 'join', playerID: '0'})
    second.serverSend(WIRE_STATE)
    expect(h.connections[h.connections.length - 1]).toBe('online')
    expect(h.states).toHaveLength(2)
  })

  it('treats seat-taken DURING reconnect as retryable (zombie socket), not fallback', () => {
    const h = connect()
    const first = FakeWebSocket.latest()
    first.serverOpen()
    first.serverSend(WIRE_STATE)
    first.serverDrop()
    jest.advanceTimersByTime(800)
    const second = FakeWebSocket.latest()
    second.serverOpen()
    second.serverSend({t: 'error', code: 'seat-taken', message: 'held'})
    // No fallback join on this socket; it closes and retries later.
    expect(second.sent).toHaveLength(1)
    expect(second.readyState).toBe(3)
    jest.advanceTimersByTime(30_000)
    const third = FakeWebSocket.latest()
    expect(third).not.toBe(second)
    third.serverOpen()
    expect(third.sent[0]).toMatchObject({t: 'join', playerID: '0'})
    expect(h.errors).toHaveLength(0)
  })

  it('GUEST MODE: the capability token rides every join frame', () => {
    const h = harness()
    client = createLiveGameClient({
      matchID: 'm-uuid',
      playerID: '1',
      name: 'Austin',
      token: 'cap-token-123',
      callbacks: h.callbacks,
      baseUrl: 'https://worker.example.dev',
      webSocketImpl: FakeWebSocket,
    })
    client.connect()
    const first = FakeWebSocket.latest()
    first.serverOpen()
    expect(first.sent[0]).toEqual({
      t: 'join',
      matchID: 'm-uuid',
      playerID: '1',
      name: 'Austin',
      token: 'cap-token-123',
    })
    // Seat fallback keeps the token…
    first.serverSend({t: 'error', code: 'seat-taken', message: 'held'})
    expect(first.sent[1]).toMatchObject({playerID: '0', token: 'cap-token-123'})
    // …and so does a reconnect re-join.
    first.serverSend(WIRE_STATE)
    first.serverDrop()
    jest.advanceTimersByTime(800)
    const second = FakeWebSocket.latest()
    second.serverOpen()
    expect(second.sent[0]).toMatchObject({token: 'cap-token-123'})
  })

  it('signed-in joins carry NO token field at all', () => {
    connect()
    const ws = FakeWebSocket.latest()
    ws.serverOpen()
    expect('token' in ws.sent[0]).toBe(false)
  })

  it('handles a live checkers state frame and serializes from/to moves', () => {
    const h = connect()
    const ws = FakeWebSocket.latest()
    ws.serverOpen()
    const board = Array(64).fill(null)
    board[42] = {player: 0, king: false}
    ws.serverSend({
      t: 'state',
      game: 'checkers',
      G: {board},
      ctx: {currentPlayer: '0'},
      legalMoves: [
        {from: 42, to: 33},
        {from: 42, to: 35},
      ],
      players: {'0': {name: 'Austin', connected: true}},
    })
    const state = h.states[h.states.length - 1]
    const G = state.G as {kind: string; legalMoves: unknown[]}
    expect(G.kind).toBe('checkers')
    expect(G.legalMoves).toHaveLength(2)
    client!.sendMove({type: 'move', args: {from: 42, to: 33}})
    expect(ws.sent[ws.sent.length - 1]).toEqual({
      t: 'move',
      move: {type: 'move', args: {from: 42, to: 33}},
    })
  })

  it('handles a live connect-four state frame and serializes drop moves', () => {
    const h = connect()
    const ws = FakeWebSocket.latest()
    ws.serverOpen()
    const board = Array(42).fill(null)
    board[5 * 7 + 3] = 0
    ws.serverSend({
      t: 'state',
      game: 'connect-four',
      G: {board, lastMove: {row: 5, col: 3}, winningLine: null},
      ctx: {currentPlayer: '1'},
      legalMoves: [{col: 0}, {col: 3}],
      players: {'0': {name: 'Austin', connected: true}},
    })
    const state = h.states[h.states.length - 1]
    const G = state.G as {kind: string; legalMoves: unknown[]}
    expect(G.kind).toBe('connect-four')
    expect(G.legalMoves).toEqual([{col: 0}, {col: 3}])
    client!.sendMove({type: 'drop', args: {col: 3}})
    expect(ws.sent[ws.sent.length - 1]).toEqual({
      t: 'move',
      move: {type: 'drop', args: {col: 3}},
    })
  })

  it('disconnect() closes the socket and stops reconnection', () => {
    connect()
    const ws = FakeWebSocket.latest()
    ws.serverOpen()
    client!.disconnect()
    expect(ws.readyState).toBe(3)
    jest.advanceTimersByTime(60_000)
    expect(FakeWebSocket.instances).toHaveLength(1)
    // Sends after disconnect are dropped, never thrown.
    client!.sendMove({type: 'place', args: {cell: 1}})
    client!.sendChat('hello?')
    expect(ws.sent).toHaveLength(1)
  })
})
