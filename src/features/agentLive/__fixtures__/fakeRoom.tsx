import {Text} from 'react-native'

import {type LiveRoom, type StageRef} from '../room'

/** One recorded room call, in order. */
export type RoomCall =
  | {op: 'connect'; wsUrl: string; token: string}
  | {op: 'disconnect'}
  | {op: 'mic'; on: boolean}
  | {op: 'camera'; on: boolean}
  | {op: 'data'; text: string; topic: string; reliable: boolean}

/** A LiveRoom that records every call and lets a test show the stage. */
export function createFakeRoom(log: string[] = []) {
  const calls: RoomCall[] = []
  const listeners = new Set<(s: StageRef | null) => void>()
  const record = (c: RoomCall) => {
    calls.push(c)
    log.push(`room.${c.op}${'on' in c ? `(${c.on})` : ''}`)
  }
  const room: LiveRoom = {
    async connect({wsUrl, token}) {
      record({op: 'connect', wsUrl, token})
    },
    async disconnect() {
      record({op: 'disconnect'})
    },
    async setMicrophoneEnabled(on) {
      record({op: 'mic', on})
    },
    async setCameraEnabled(on) {
      record({op: 'camera', on})
    },
    async publishData(payload, {topic, reliable}) {
      record({
        op: 'data',
        text: new TextDecoder().decode(payload),
        topic,
        reliable,
      })
    },
    onStageChange(cb) {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
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
      listeners.forEach(cb => cb({kind: 'stage', ref}))
    },
    cameraPublishes: () =>
      calls.filter(c => c.op === 'camera' && c.on).length,
  }
}
