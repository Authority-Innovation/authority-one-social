/**
 * This device's Agent Live key, one per signed-in account (so the runtime
 * can't link two accounts by a shared key). The 32-byte Ed25519 seed lives in
 * expo-secure-store, `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` (out of iCloud
 * Keychain and backups, as the AO session is). The module is required lazily:
 * nothing loads while Live is dark.
 *
 * Null when the keystore can't be used. The session then runs with unbound
 * tokens, which the runtime still accepts (single use, 60 s); only the
 * binding is lost.
 */
import type * as ExpoCryptoModule from 'expo-crypto'
import type * as SecureStoreModule from 'expo-secure-store'

import {logger} from '#/logger'
import {
  b64urlDecode,
  b64urlEncode,
  type DeviceKey,
  deviceKeyFromSeed,
} from './pop'

type SecureStore = typeof SecureStoreModule
type ExpoCrypto = typeof ExpoCryptoModule

const KEY_PREFIX = 'agent-live-device-key-v1'

// SecureStore keys allow [A-Za-z0-9._-] only.
const storeKeyFor = (ownerDid: string) =>
  `${KEY_PREFIX}.${ownerDid.replace(/[^A-Za-z0-9._-]/g, '_')}`

export async function getDeviceKey(
  ownerDid: string,
): Promise<DeviceKey | null> {
  try {
    const s = require('expo-secure-store') as SecureStore
    const opts = {keychainAccessible: s.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY}
    const k = storeKeyFor(ownerDid)
    const stored = await s.getItemAsync(k, opts)
    if (stored) {
      const seed = b64urlDecode(stored)
      if (seed.length === 32) return deviceKeyFromSeed(seed)
    }
    const {getRandomBytes} = require('expo-crypto') as ExpoCrypto
    const seed = getRandomBytes(32)
    await s.setItemAsync(k, b64urlEncode(seed), opts)
    return deviceKeyFromSeed(seed)
  } catch {
    logger.warn('agentLive: device key unavailable')
    return null
  }
}
