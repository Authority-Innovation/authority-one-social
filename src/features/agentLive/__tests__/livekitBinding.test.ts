/**
 * The LiveKit binding (room/livekit.tsx) over a plain-object SDK: what it
 * subscribes to [L6], who may see the owner's tracks, how it reports drops,
 * camera off as unpublish, and the audio session around joins.
 */
import {beforeEach, describe, expect, it, jest} from '@jest/globals'

type Handler = (...args: unknown[]) => void

const mockAudio = {
  startAudioSession: jest.fn(() => Promise.resolve()),
  stopAudioSession: jest.fn(() => Promise.resolve()),
}
jest.mock('@livekit/react-native', () => ({
  registerGlobals: jest.fn(),
  setupIOSAudioManagement: jest.fn(),
  AudioSession: mockAudio,
  VideoTrack: () => null,
}))

const mockRooms: MockRoom[] = []
type Pub = {
  kind: string
  source: string
  trackName: string
  track: object | null
  setSubscribed: jest.Mock
}
type MockParticipant = {
  identity: string
  trackPublications: Map<string, Pub>
  videoTrackPublications: Map<string, Pub>
}
class MockRoom {
  handlers = new Map<string, Handler[]>()
  remoteParticipants = new Map<string, MockParticipant>()
  connectImpl = jest.fn((_url: string, _token: string, _opts: object) =>
    Promise.resolve(),
  )
  localParticipant = {
    setTrackSubscriptionPermissions: jest.fn(),
    setMicrophoneEnabled: jest.fn(() => Promise.resolve()),
    setCameraEnabled: jest.fn(() => Promise.resolve()),
    getTrackPublication: jest.fn(() => ({track: {id: 'cam'}})),
    unpublishTrack: jest.fn(() => Promise.resolve()),
    publishData: jest.fn(() => Promise.resolve()),
  }
  options: {
    reconnectPolicy?: {nextRetryDelayInMs(c: object): number | null}
    singlePeerConnection?: boolean
  }
  constructor(options: MockRoom['options']) {
    this.options = options
    mockRooms.push(this)
  }
  on(e: string, h: Handler) {
    this.handlers.set(e, [...(this.handlers.get(e) ?? []), h])
    return this
  }
  emit(e: string, ...args: unknown[]) {
    for (const h of this.handlers.get(e) ?? []) h(...args)
  }
  connect(url: string, token: string, opts: object) {
    return this.connectImpl(url, token, opts)
  }
  disconnect = jest.fn(() => Promise.resolve())
}
jest.mock('livekit-client', () => ({
  Room: MockRoom,
  RoomEvent: {
    TrackPublished: 'trackPublished',
    ParticipantConnected: 'participantConnected',
    ParticipantDisconnected: 'participantDisconnected',
    TrackSubscribed: 'trackSubscribed',
    TrackUnsubscribed: 'trackUnsubscribed',
    Reconnecting: 'reconnecting',
    Reconnected: 'reconnected',
    Disconnected: 'disconnected',
  },
  Track: {
    Kind: {Video: 'video', Audio: 'audio'},
    Source: {
      Camera: 'camera',
      Microphone: 'microphone',
      ScreenShare: 'screen_share',
    },
  },
  // The real protocol enum (numbers and their names).
  DisconnectReason: jest.requireActual<{DisconnectReason: object}>(
    '@livekit/protocol',
  ).DisconnectReason,
}))

import {type LiveConnectionEvent} from '../room'
import {
  createLiveKitRoom,
  disconnectReasonOf,
  LIVE_ROOM_OPTIONS,
  NO_SDK_RECONNECT,
} from '../room/livekit'

const SID = 'ls_01JBX8M4Q2T7V9WZ3K5N6P8R0S'

function pub(kind: string, source: string, trackName = ''): Pub {
  return {kind, source, trackName, track: {}, setSubscribed: jest.fn()}
}
function participant(identity: string, pubs: Pub[]): MockParticipant {
  const all = new Map(pubs.map((p, i) => [String(i), p]))
  return {
    identity,
    trackPublications: all,
    videoTrackPublications: new Map(
      [...all].filter(([, p]) => p.kind === 'video'),
    ),
  }
}

function make() {
  const live = createLiveKitRoom({sid: SID})
  const room = mockRooms[mockRooms.length - 1]
  return {live, room}
}

beforeEach(() => {
  mockRooms.length = 0
  mockAudio.startAudioSession.mockClear()
  mockAudio.stopAudioSession.mockClear()
})

describe('subscriptions [L6]', () => {
  it('only this session’s agent: its stage video and its voice', async () => {
    const {live, room} = make()
    const stage = pub('video', 'screen_share', 'stage')
    const voice = pub('audio', 'microphone')
    const agentCam = pub('video', 'camera')
    const guestVoice = pub('audio', 'microphone')
    const otherSessionStage = pub('video', 'screen_share', 'stage')
    room.remoteParticipants.set(
      'a',
      participant(`agent:${SID}:ak1`, [stage, voice, agentCam]),
    )
    room.remoteParticipants.set(
      'g',
      participant(`guest:${SID}:g1`, [guestVoice]),
    )
    room.remoteParticipants.set(
      'x',
      participant('agent:ls_01JBX8M4Q2T7V9WZ3K5N6P8R0T:ak1', [
        otherSessionStage,
      ]),
    )
    await live.connect({wsUrl: 'wss://media.test', token: 't'})
    expect(room.connectImpl).toHaveBeenCalledWith('wss://media.test', 't', {
      autoSubscribe: false,
    })
    expect(stage.setSubscribed).toHaveBeenCalledWith(true)
    expect(voice.setSubscribed).toHaveBeenCalledWith(true)
    expect(agentCam.setSubscribed).not.toHaveBeenCalled()
    expect(guestVoice.setSubscribed).not.toHaveBeenCalled()
    expect(otherSessionStage.setSubscribed).not.toHaveBeenCalled()
  })

  it('the owner’s tracks are visible to this session’s agent only', async () => {
    const {live, room} = make()
    room.remoteParticipants.set('a', participant(`agent:${SID}:ak1`, []))
    room.remoteParticipants.set('g', participant(`guest:${SID}:g1`, []))
    await live.connect({wsUrl: 'wss://media.test', token: 't'})
    expect(
      room.localParticipant.setTrackSubscriptionPermissions,
    ).toHaveBeenLastCalledWith(false, [
      {participantIdentity: `agent:${SID}:ak1`, allowAll: true},
    ])
  })

  it('reports the stage when the agent’s stage track arrives', () => {
    const {live, room} = make()
    const seen: unknown[] = []
    live.onStageChange(s => seen.push(s))
    const stage = pub('video', 'screen_share', 'stage')
    room.remoteParticipants.set('a', participant(`agent:${SID}:ak1`, [stage]))
    room.emit('trackSubscribed')
    expect(seen[seen.length - 1]).toMatchObject({kind: 'stage'})
  })
})

describe('connection', () => {
  it('joins on /rtc directly: singlePeerConnection off (build 44, Dev edge /rtc/v1 query-size 400)', () => {
    const {room} = make()
    expect(room.options.singlePeerConnection).toBe(false)
    expect(room.options).toBe(LIVE_ROOM_OPTIONS)
  })

  it('the SDK never resumes or reconnects on its own (join gate R1/R2)', () => {
    const {room} = make()
    expect(room.options.reconnectPolicy).toBe(NO_SDK_RECONNECT)
    for (const retryCount of [0, 1, 5]) {
      expect(
        NO_SDK_RECONNECT.nextRetryDelayInMs({retryCount, elapsedMs: 0}),
      ).toBeNull()
    }
  })

  it.each([
    [1, 'client'],
    [12, 'rejected'],
    [2, 'duplicate_identity'],
    [4, 'removed'],
    [5, 'room_deleted'],
    [10, 'room_deleted'],
    [3, 'network'],
    [9, 'network'],
    [0, 'network'],
    [undefined, 'network'],
  ])('reason %s is %s', (reason, mapped) => {
    expect(disconnectReasonOf(reason as never)).toBe(mapped)
  })

  it('reports reconnecting, reconnected and a drop with its reason', () => {
    const {live, room} = make()
    const seen: LiveConnectionEvent[] = []
    const off = live.onConnectionChange(e => seen.push(e))
    room.emit('reconnecting')
    room.emit('reconnected')
    room.emit('disconnected', 4)
    expect(seen).toEqual([
      {type: 'reconnecting'},
      {type: 'reconnected'},
      {type: 'disconnected', reason: 'removed'},
    ])
    off()
    room.emit('disconnected', 5)
    expect(seen).toHaveLength(3)
  })
})

describe('audio session', () => {
  it('starts before the join and stops on leaving', async () => {
    const {live} = make()
    await live.connect({wsUrl: 'wss://media.test', token: 't'})
    expect(mockAudio.startAudioSession).toHaveBeenCalledTimes(1)
    await live.disconnect()
    expect(mockAudio.stopAudioSession).toHaveBeenCalledTimes(1)
  })

  it('a failed join stops it again', async () => {
    const {live, room} = make()
    room.connectImpl.mockImplementationOnce(() =>
      Promise.reject(new Error('401')),
    )
    await expect(
      live.connect({wsUrl: 'wss://media.test', token: 't'}),
    ).rejects.toThrow()
    expect(mockAudio.stopAudioSession).toHaveBeenCalledTimes(1)
  })

  it('a rejoin keeps it running (no stop, no second start)', async () => {
    const {live} = make()
    await live.connect({wsUrl: 'wss://media.test', token: 't1'})
    await live.disconnect({keepAudio: true})
    await live.connect({wsUrl: 'wss://media.test', token: 't2'})
    expect(mockAudio.stopAudioSession).not.toHaveBeenCalled()
    expect(mockAudio.startAudioSession).toHaveBeenCalledTimes(1)
  })
})

describe('camera', () => {
  it('off unpublishes the camera track, not just mute', async () => {
    const {live, room} = make()
    await live.setCameraEnabled(true)
    expect(room.localParticipant.setCameraEnabled).toHaveBeenCalledWith(true)
    await live.setCameraEnabled(false)
    expect(room.localParticipant.unpublishTrack).toHaveBeenCalledWith(
      {id: 'cam'},
      true,
    )
  })
})
