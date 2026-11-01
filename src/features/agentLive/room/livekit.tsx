/**
 * The LiveKit binding. Reached only through `loadLiveRoomFactory()` (a dynamic
 * import), never statically, so nothing loads the SDK while the flag is off.
 *
 * Subscriptions [design r2 L6]: autoSubscribe is off. The owner subscribes
 * only to this session's agent (`agent:<sid>:*`): its `stage` video and its
 * voice. Edge sources and guests are not subscribed here. The owner's own
 * tracks are visible to the agent identity only.
 *
 * Connection: the SDK's own resume and reconnect are off (NO_SDK_RECONNECT).
 * A drop is reported once with its reason (types.ts), and the session decides
 * what to do (a full rejoin with a fresh token, or end).
 */
import {
  AudioSession,
  registerGlobals,
  setupIOSAudioManagement,
  VideoTrack,
} from '@livekit/react-native'
import {
  DisconnectReason,
  type Participant,
  type ReconnectPolicy,
  type RemoteParticipant,
  type RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
  type TrackPublication,
} from 'livekit-client'

import {disconnectReasonOf as reasonOf, reasonName} from '../rejoin'
import {LIVE_IOS_AUDIO_POLICY} from './audioSession'
import {
  type LiveConnectionEvent,
  type LiveDisconnectReason,
  type LiveRoom,
  type LiveRoomFactory,
  type StageRef,
} from './types'

let globalsRegistered = false

/**
 * The SDK never resumes or reconnects on its own (join gate R1/R2, runtime
 * design AGENT-LIVE-JOIN-GATE-REVISED @ adeeadb). The edge refuses every
 * resume (`reconnect=1`), and a full reconnect on the token in hand would be a
 * second use of a single-use token. With no retry, a lost connection is
 * reported as Disconnected at once, and the session does the full rejoin with
 * a fresh token. The `/rtc/v1` 404 is handled by the SDK itself: a
 * ServiceNotFound from `/rtc/v1/validate` retries the join on `/rtc`.
 */
export const NO_SDK_RECONNECT: ReconnectPolicy = {
  nextRetryDelayInMs: () => null,
}

type StageTrackRef = {
  participant: Participant
  publication: TrackPublication
  source: Track.Source
}

function isStage(pub: TrackPublication) {
  return (
    pub.kind === Track.Kind.Video &&
    (pub.trackName === 'stage' || pub.source === Track.Source.ScreenShare)
  )
}

/** The session's reason for an SDK DisconnectReason (../rejoin.ts decides). */
export function disconnectReasonOf(
  reason: DisconnectReason | undefined,
): LiveDisconnectReason {
  return reasonOf(reasonName(reason, DisconnectReason))
}

export const createLiveKitRoom: LiveRoomFactory = ({sid}) => {
  if (!globalsRegistered) {
    // Our own iOS audio policy instead of the SDK default, which leaves
    // playAndRecord whenever the mic is off (see ./audioSession). A no-op off
    // iOS.
    registerGlobals({autoConfigureAudioSession: false})
    setupIOSAudioManagement(true, LIVE_IOS_AUDIO_POLICY)
    globalsRegistered = true
  }
  const agentPrefix = `agent:${sid}:`
  const isAgent = (p: Participant) => p.identity.startsWith(agentPrefix)
  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
    reconnectPolicy: NO_SDK_RECONNECT,
  })
  const stageListeners = new Set<(stage: StageRef | null) => void>()
  const connListeners = new Set<(e: LiveConnectionEvent) => void>()
  let audioOn = false

  const findStage = (): StageRef | null => {
    for (const p of room.remoteParticipants.values()) {
      if (!isAgent(p)) continue
      for (const pub of p.videoTrackPublications.values()) {
        if (isStage(pub) && pub.track) {
          const ref: StageTrackRef = {
            participant: p,
            publication: pub,
            source: pub.source,
          }
          return {kind: 'stage', ref}
        }
      }
    }
    return null
  }
  const emitStage = () => {
    const stage = findStage()
    stageListeners.forEach(cb => cb(stage))
  }
  const emitConn = (e: LiveConnectionEvent) =>
    connListeners.forEach(cb => cb(e))

  const consider = (pub: RemoteTrackPublication, p: RemoteParticipant) => {
    if (!isAgent(p)) return
    if (isStage(pub) || pub.source === Track.Source.Microphone) {
      pub.setSubscribed(true)
    }
  }
  const allowAgents = () => {
    const agents = [...room.remoteParticipants.values()].filter(isAgent)
    room.localParticipant.setTrackSubscriptionPermissions(
      false,
      agents.map(p => ({participantIdentity: p.identity, allowAll: true})),
    )
  }
  const stopAudio = async () => {
    if (!audioOn) return
    audioOn = false
    await AudioSession.stopAudioSession().catch(() => {})
  }

  room
    .on(RoomEvent.TrackPublished, consider)
    .on(RoomEvent.ParticipantConnected, p => {
      allowAgents()
      p.trackPublications.forEach(pub => consider(pub, p))
    })
    .on(RoomEvent.ParticipantDisconnected, () => {
      allowAgents()
      emitStage()
    })
    .on(RoomEvent.TrackSubscribed, emitStage)
    .on(RoomEvent.TrackUnsubscribed, emitStage)
    .on(RoomEvent.Reconnecting, () => emitConn({type: 'reconnecting'}))
    .on(RoomEvent.Reconnected, () => emitConn({type: 'reconnected'}))
    .on(RoomEvent.Disconnected, reason => {
      emitStage()
      emitConn({type: 'disconnected', reason: disconnectReasonOf(reason)})
    })

  const StageVideo: LiveRoom['StageVideo'] = ({stage, style}) => (
    <VideoTrack
      trackRef={stage.ref as StageTrackRef}
      objectFit="contain"
      style={style as never}
    />
  )

  return {
    async connect({wsUrl, token}) {
      if (!audioOn) {
        await AudioSession.startAudioSession()
        audioOn = true
      }
      try {
        await room.connect(wsUrl, token, {autoSubscribe: false})
      } catch (e) {
        // A failed join must not leave the audio session running.
        await stopAudio()
        throw e
      }
      allowAgents()
      room.remoteParticipants.forEach(p =>
        p.trackPublications.forEach(pub => consider(pub, p)),
      )
      emitStage()
    },
    async disconnect({keepAudio = false} = {}) {
      await room.disconnect()
      if (!keepAudio) await stopAudio()
      emitStage()
    },
    async setMicrophoneEnabled(on) {
      await room.localParticipant.setMicrophoneEnabled(on)
    },
    async setCameraEnabled(on) {
      if (on) {
        await room.localParticipant.setCameraEnabled(true)
        return
      }
      const pub = room.localParticipant.getTrackPublication(Track.Source.Camera)
      if (pub?.track)
        await room.localParticipant.unpublishTrack(pub.track, true)
    },
    async publishData(payload, {topic, reliable}) {
      await room.localParticipant.publishData(payload, {topic, reliable})
    },
    onStageChange(cb) {
      stageListeners.add(cb)
      return () => {
        stageListeners.delete(cb)
      }
    },
    onConnectionChange(cb) {
      connListeners.add(cb)
      return () => {
        connListeners.delete(cb)
      }
    },
    StageVideo,
  }
}
