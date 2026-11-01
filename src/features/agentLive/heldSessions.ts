/**
 * The live sessions this device has held (joined with its own key), per
 * account. R3 replaces a held participant only with the SAME device key,
 * proven, and keys never leave the device (deviceKey.ts), so "this device
 * held this session" is the only case where the app can expect a takeover
 * to be admitted (review 563477989 R1). Kept in expo-secure-store beside the
 * key, `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`; the last MAX ids only.
 *
 * Best effort: a keystore that can't be read means "not held here", so no
 * takeover is offered.
 */
import type * as SecureStoreModule from 'expo-secure-store'

type SecureStore = typeof SecureStoreModule

const KEY_PREFIX = 'agent-live-held-v1'
const MAX = 20
const SID_RE = /^ls_[0-9A-HJKMNP-TV-Z]{26}$/

const storeKeyFor = (ownerDid: string) =>
  `${KEY_PREFIX}.${ownerDid.replace(/[^A-Za-z0-9._-]/g, '_')}`

async function read(s: SecureStore, k: string): Promise<string[]> {
  const raw = await s.getItemAsync(k, {
    keychainAccessible: s.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  })
  if (!raw) return []
  const v = JSON.parse(raw) as unknown
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string')
    : []
}

export async function wasHeldHere(
  ownerDid: string,
  sid: string,
): Promise<boolean> {
  try {
    const s = require('expo-secure-store') as SecureStore
    return (await read(s, storeKeyFor(ownerDid))).includes(sid)
  } catch {
    return false
  }
}

export async function markHeldHere(
  ownerDid: string,
  sid: string,
): Promise<void> {
  if (!SID_RE.test(sid)) return
  try {
    const s = require('expo-secure-store') as SecureStore
    const k = storeKeyFor(ownerDid)
    const sids = (await read(s, k).catch(() => [])).filter(x => x !== sid)
    sids.push(sid)
    await s.setItemAsync(k, JSON.stringify(sids.slice(-MAX)), {
      keychainAccessible: s.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    })
  } catch {
    // Best effort (see above).
  }
}
