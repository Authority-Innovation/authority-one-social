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

export async function loadPhotoPrefs(): Promise<PhotoContextPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PHOTO_PREFS
    const p = JSON.parse(raw) as Partial<PhotoContextPrefs>
    return {enabled: p.enabled === true}
  } catch {
    return DEFAULT_PHOTO_PREFS
  }
}

export async function savePhotoPrefs(prefs: PhotoContextPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch (e) {
    logger.warn('photoContext: savePrefs failed', {safeMessage: String(e)})
  }
}

export async function loadLastConclusion(): Promise<PhotoContextConclusion | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as Partial<PhotoContextConclusion>
    if (typeof c?.id !== 'string' || typeof c?.count !== 'number') return null
    return c as PhotoContextConclusion
  } catch {
    return null
  }
}

export async function saveLastConclusion(
  conclusion: PhotoContextConclusion,
): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_KEY, JSON.stringify(conclusion))
  } catch (e) {
    logger.warn('photoContext: saveLastConclusion failed', {safeMessage: String(e)})
  }
}

export async function clearLastConclusion(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LAST_KEY)
  } catch (e) {
    logger.warn('photoContext: clearLastConclusion failed', {safeMessage: String(e)})
  }
}
