import {type ComponentType} from 'react'
import {type StyleProp, type ViewStyle} from 'react-native'

/**
 * The agent's stage video, as the binding found it. Opaque outside the
 * binding: only `StageVideo` reads it.
 */
export type StageRef = {readonly kind: 'stage'; readonly ref: unknown}

/**
 * What the session needs from a media room. The LiveKit binding
 * (`./livekit.ts`) is the only implementation in the app; tests inject fakes.
 * Keeping the SDK behind this seam is what lets the screen module load without
 * importing LiveKit.
 */
export type LiveRoom = {
  connect(args: {wsUrl: string; token: string}): Promise<void>
  disconnect(): Promise<void>
  setMicrophoneEnabled(on: boolean): Promise<void>
  /** On publishes the camera; off unpublishes it (not just mute). */
  setCameraEnabled(on: boolean): Promise<void>
  publishData(
    payload: Uint8Array<ArrayBuffer>,
    opts: {topic: string; reliable: boolean},
  ): Promise<void>
  /** Called with the agent's stage track, or null when there is none. */
  onStageChange(cb: (stage: StageRef | null) => void): () => void
  StageVideo: ComponentType<{
    stage: StageRef
    style?: StyleProp<ViewStyle>
  }>
}

/** One room per session: `sid` scopes which participant counts as the agent. */
export type LiveRoomFactory = (args: {sid: string}) => LiveRoom
