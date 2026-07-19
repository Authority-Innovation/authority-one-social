import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals'

import {
  createLiveGameClient,
  gameWsUrl,
  mapWireGameover,
  mapWirePlayers,
  mapWireState,
  type WebSocketLike,
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
  const rosters: PlayerInfo[][] = []
  const gameovers: Array<string | null> = []
  const scenes: SceneFrame[] = []
  const errors: GameErrorMsg[] = []
  const seats: Array<string | null> = []
  const connections: GameConnectionStatus[] = []
  const callbacks: GameCallbacks = {
    onState: (G, ctx, players) => states.push({G, ctx, players}),
    onChat: m => chats.push(m),
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
