import {Text} from 'react-native'

import {
  type LiveConnectionEvent,
  type LiveDisconnectReason,
  type LiveRoom,
  type StageRef,
} from '../room'

/** One recorded room call, in order. */
export type RoomCall =
  | {op: 'connect'; wsUrl: string; token: string}
  | {op: 'disconnect'; keepAudio: boolean}
  | {op: 'mic'; on: boolean}
  | {op: 'camera'; on: boolean}
  | {op: 'data'; text: string; topic: string; reliable: boolean}

type Op = RoomCall['op']

/**
 * A LiveRoom that records every call, lets a test show the stage, fail an
 * operation and drop the connection as the media server would.
 */
export function createFakeRoom(log: string[] = []) {
  const calls: RoomCall[] = []
  const stageListeners = new Set<(s: StageRef | null) => void>()
  const connListeners = new Set<(e: LiveConnectionEvent) => void>()
  const failures = new Map<Op, number>()
  const record = (c: RoomCall): Promise<void> => {
    calls.push(c)
    log.push(`room.${c.op}${'on' in c ? `(${c.on})` : ''}`)
    const left = failures.get(c.op) ?? 0
    if (left > 0) {
      failures.set(c.op, left - 1)
      return Promise.reject(new Error(`fake ${c.op} failed`))
    }
    return Promise.resolve()
  }
  const room: LiveRoom = {
    connect: ({wsUrl, token}) => record({op: 'connect', wsUrl, token}),
    disconnect: ({keepAudio = false} = {}) =>
      record({op: 'disconnect', keepAudio}),
    setMicrophoneEnabled: on => record({op: 'mic', on}),
    setCameraEnabled: on => record({op: 'camera', on}),
    publishData(payload, {topic, reliable}) {
      return record({
        op: 'data',
        text: new TextDecoder().decode(payload),
        topic,
        reliable,
      })
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
    StageVideo: ({stage}) => (
      <Text testID="fakeStageVideo">{String(stage.ref)}</Text>
    ),
  }
  return {
    room,
    calls,
    showStage(ref: unknown = 'agent-stage') {
      stageListeners.forEach(cb => cb({kind: 'stage', ref}))
    },
    /** The next `times` calls of `op` reject. */
    fail(op: Op, times = 1) {
      failures.set(op, times)
    },
    /** The media server dropped us. */
    drop(reason: LiveDisconnectReason) {
      connListeners.forEach(cb => cb({type: 'disconnected', reason}))
    },
    emit(e: LiveConnectionEvent) {
      connListeners.forEach(cb => cb(e))
    },
    listening: () => connListeners.size,
    cameraPublishes: () => calls.filter(c => c.op === 'camera' && c.on).length,
    connects: () => calls.filter(c => c.op === 'connect'),
  }
}
