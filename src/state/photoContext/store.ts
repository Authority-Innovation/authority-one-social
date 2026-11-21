import AsyncStorage from '@react-native-async-storage/async-storage'

import {
  type PhotoContextConclusion,
  type PhotoContextPrefs,
} from '#/lib/photoContext/types'
import {logger} from '#/logger'

/**
 * Local-first store for Photo Context. Holds ONLY the opt-in pref and the last derived
 * CONCLUSION (for the UI) — never photo metadata, never image content. Dedicated
 * AsyncStorage namespace, easy to wipe. Every call is resilient (never throws).
 */

const PREFS_KEY = '@authorityOne/photoContext/prefs'
const LAST_KEY = '@authorityOne/photoContext/lastConclusion'

export const DEFAULT_PHOTO_PREFS: PhotoContextPrefs = {enabled: false}

/**
 * SOC-01: keys are namespaced by the account DID so one account's opt-in and
 * conclusions are never visible to another account on the same device. With no
 * signed-in account, reads return defaults and writes are dropped.
 */
function scoped(base: string, did: string | undefined): string | null {
  return did ? `${base}:${did}` : null
}

/**
 * One-time migration of the old device-wide keys: the first account to load adopts
 * them (never overwriting its own data), then they are removed.
 */
export async function adoptLegacyPhotoData(
  did: string | undefined,
): Promise<void> {
  if (!did) return
  for (const base of [PREFS_KEY, LAST_KEY]) {
    try {
      const raw = await AsyncStorage.getItem(base)
      if (raw == null) continue
      const key = `${base}:${did}`
      if ((await AsyncStorage.getItem(key)) == null) {
        await AsyncStorage.setItem(key, raw)
      }
      await AsyncStorage.removeItem(base)
    } catch (e) {
      logger.warn('photoContext: adoptLegacyPhotoData failed', {
        safeMessage: String(e),
      })
    }
  }
}

export async function loadPhotoPrefs(
  did: string | undefined,
): Promise<PhotoContextPrefs> {
  const key = scoped(PREFS_KEY, did)
  if (!key) return DEFAULT_PHOTO_PREFS
  try {
    const raw = await AsyncStorage.getItem(key)
    if (!raw) return DEFAULT_PHOTO_PREFS
    const p = JSON.parse(raw) as Partial<PhotoContextPrefs>
    return {enabled: p.enabled === true}
  } catch {
    return DEFAULT_PHOTO_PREFS
  }
}

export async function savePhotoPrefs(
  did: string | undefined,
  prefs: PhotoContextPrefs,
): Promise<void> {
  const key = scoped(PREFS_KEY, did)
  if (!key) return
  try {
    await AsyncStorage.setItem(key, JSON.stringify(prefs))
  } catch (e) {
    logger.warn('photoContext: savePrefs failed', {safeMessage: String(e)})
  }
}

export async function loadLastConclusion(
  did: string | undefined,
): Promise<PhotoContextConclusion | null> {
  const key = scoped(LAST_KEY, did)
  if (!key) return null
  try {
    const raw = await AsyncStorage.getItem(key)
    if (!raw) return null
    const c = JSON.parse(raw) as Partial<PhotoContextConclusion>
    if (typeof c?.id !== 'string' || typeof c?.count !== 'number') return null
    return c as PhotoContextConclusion
  } catch {
    return null
  }
}

export async function saveLastConclusion(
  did: string | undefined,
  conclusion: PhotoContextConclusion,
): Promise<void> {
  const key = scoped(LAST_KEY, did)
  if (!key) return
  try {
    await AsyncStorage.setItem(key, JSON.stringify(conclusion))
  } catch (e) {
    logger.warn('photoContext: saveLastConclusion failed', {safeMessage: String(e)})
  }
}

export async function clearLastConclusion(
  did: string | undefined,
): Promise<void> {
  const key = scoped(LAST_KEY, did)
  if (!key) return
  try {
    await AsyncStorage.removeItem(key)
  } catch (e) {
    logger.warn('photoContext: clearLastConclusion failed', {safeMessage: String(e)})
  }
}
