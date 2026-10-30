/**
 * The LiveKit binding. Reached only through `loadLiveRoomFactory()` (a dynamic
 * import), never statically, so nothing loads the SDK while the flag is off.
 *
 * Subscriptions [design r2 L6]: autoSubscribe is off. The owner subscribes
 * only to this session's agent (`agent:<sid>:*`): its `stage` video and its
 * voice. Edge sources and guests are not subscribed here. The owner's own
 * tracks are visible to the agent identity only.
 */
import {AudioSession, registerGlobals, VideoTrack} from '@livekit/react-native'
import {
  type Participant,
  type RemoteParticipant,
  type RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
  type TrackPublication,
} from 'livekit-client'

import {type LiveRoom, type LiveRoomFactory, type StageRef} from './types'

let globalsRegistered = false

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

export const createLiveKitRoom: LiveRoomFactory = ({sid}) => {
  if (!globalsRegistered) {
    registerGlobals()
    globalsRegistered = true
  }
  const agentPrefix = `agent:${sid}:`
  const isAgent = (p: Participant) => p.identity.startsWith(agentPrefix)
  const room = new Room({adaptiveStream: true, dynacast: true})
  const listeners = new Set<(stage: StageRef | null) => void>()

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
  const emit = () => {
    const stage = findStage()
    listeners.forEach(cb => cb(stage))
  }

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

  room
    .on(RoomEvent.TrackPublished, consider)
    .on(RoomEvent.ParticipantConnected, p => {
      allowAgents()
      p.trackPublications.forEach(pub => consider(pub, p))
    })
    .on(RoomEvent.ParticipantDisconnected, () => {
      allowAgents()
      emit()
    })
    .on(RoomEvent.TrackSubscribed, emit)
    .on(RoomEvent.TrackUnsubscribed, emit)

  const StageVideo: LiveRoom['StageVideo'] = ({stage, style}) => (
    <VideoTrack
      trackRef={stage.ref as StageTrackRef as never}
      objectFit="contain"
      style={style as never}
    />
  )

  return {
    async connect({wsUrl, token}) {
      await AudioSession.startAudioSession()
      await room.connect(wsUrl, token, {autoSubscribe: false})
      allowAgents()
      room.remoteParticipants.forEach(p =>
        p.trackPublications.forEach(pub => consider(pub, p)),
      )
      emit()
    },
    async disconnect() {
      await room.disconnect()
      await AudioSession.stopAudioSession()
      emit()
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
      if (pub?.track) await room.localParticipant.unpublishTrack(pub.track, true)
    },
    async publishData(payload, {topic, reliable}) {
      await room.localParticipant.publishData(payload, {topic, reliable})
    },
    onStageChange(cb) {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    StageVideo,
  }
}
