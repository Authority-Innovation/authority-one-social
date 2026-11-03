import {type LiveRoomFactory} from './types'

export type {LiveRoom, LiveRoomFactory, StageRef} from './types'

/**
 * Loads the LiveKit binding on demand. This is the ONLY path to the SDK in the
 * app: nothing imports `./livekit` statically, so loading the session screen
 * (or anything else) with the flag off never evaluates LiveKit. With the flag
 * off, Metro also resolves the SDK to an empty module (plugins/agentLive).
 */
export async function loadLiveRoomFactory(): Promise<LiveRoomFactory> {
  const {createLiveKitRoom} = await import('./livekit')
  return createLiveKitRoom
}
