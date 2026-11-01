import {type ComponentType} from 'react'
import {type StyleProp, type ViewStyle} from 'react-native'

/**
 * The agent's stage video, as the binding found it. Opaque outside the
 * binding: only `StageVideo` reads it.
 */
export type StageRef = {readonly kind: 'stage'; readonly ref: unknown}

/**
 * Why the media server dropped us, in the session's terms:
 * - `client`: we left (end, or the camera rejoin);
 * - `removed`: the runtime removed us (consent withdrawn, a revoked or
 *   refused token, the participant_joined backstop);
 * - `room_deleted`: the session ended elsewhere (the owner's other device, the
 *   agent or a voice "stop", the session's hard end);
 * - `duplicate_identity`: the owner joined from another device;
 * - `rejected`: the server refused us (USER_REJECTED);
 * - `network`: anything else (no reason included): a full rejoin.
 * All but `network` are FINAL (../rejoin.ts, mirroring the runtime's
 * live-agent/src/rejoin.js).
 */
export type LiveDisconnectReason =
  | 'client'
  | 'removed'
  | 'room_deleted'
  | 'duplicate_identity'
  | 'rejected'
  | 'network'

export type LiveConnectionEvent =
  | {type: 'reconnecting'}
  | {type: 'reconnected'}
  | {type: 'disconnected'; reason: LiveDisconnectReason}

/**
 * What the session needs from a media room. The LiveKit binding
 * (`./livekit.tsx`) is the only implementation in the app; tests inject fakes.
 * Keeping the SDK behind this seam is what lets the screen module load without
 * importing LiveKit.
 */
export type LiveRoom = {
  connect(args: {wsUrl: string; token: string}): Promise<void>
  /**
   * `keepAudio`: leave the audio session running because a rejoin follows at
   * once (the camera opt-in), so audio doesn't drop and restart.
   */
  disconnect(opts?: {keepAudio?: boolean}): Promise<void>
  setMicrophoneEnabled(on: boolean): Promise<void>
  /** On publishes the camera; off unpublishes it (not just mute). */
  setCameraEnabled(on: boolean): Promise<void>
  publishData(
    payload: Uint8Array<ArrayBuffer>,
    opts: {topic: string; reliable: boolean},
  ): Promise<void>
  /** Called with the agent's stage track, or null when there is none. */
  onStageChange(cb: (stage: StageRef | null) => void): () => void
  /** The media connection's own state changes (not ones we asked for). */
  onConnectionChange(cb: (e: LiveConnectionEvent) => void): () => void
  StageVideo: ComponentType<{
    stage: StageRef
    style?: StyleProp<ViewStyle>
  }>
}

/** One room per session: `sid` scopes which participant counts as the agent. */
export type LiveRoomFactory = (args: {sid: string}) => LiveRoom
