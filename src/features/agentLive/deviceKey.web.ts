import {type DeviceKey} from './pop'

/** Agent Live is native-only; the web build never binds a token. */
export function getDeviceKey(_ownerDid: string): Promise<DeviceKey | null> {
  return Promise.resolve(null)
}
