import {type LiveRoomFactory} from './types'

/**
 * Agent Live is native-only for now (the development-live dev client). The web
 * build never reaches this: the Go live button and the session screen are off
 * without the flag, and no web build sets it.
 */
export const createLiveKitRoom: LiveRoomFactory = () => {
  throw new Error('agentLive: not available on web')
}
