import AsyncStorage from '@react-native-async-storage/async-storage'

import {
  type ContextEvent,
  type ContextPrefs,
  type LabeledPlace,
  type OpenDwell,
} from '#/lib/contextEngine/types'
import {logger} from '#/logger'

/**
 * Local-first store for the Context Engine. Prefs (opt-in + home/work anchors) and
 * the derived event log live in a DEDICATED AsyncStorage namespace — isolated from
 * the main app store and easy to wipe. Anchors never leave the device; the event
 * log holds only conclusions. Every call is resilient (never throws).
 */

const PREFS_KEY = '@authorityOne/contextEngine/prefs'
const EVENTS_KEY = '@authorityOne/contextEngine/events'
// Phase 1.5: the open dwell, persisted so the (stateless) background task can compute
// dwell across wakes. Conclusion-only, no coordinates.
const OPEN_DWELL_KEY = '@authorityOne/contextEngine/openDwell'
const MAX_EVENTS = 200

/**
 * SOC-01: every key is namespaced by the account DID (as agent-config.ts does), so one
 * account's opt-in, places and history are never visible to another account on the
 * same device. With no signed-in account there is no key: reads return defaults and
 * writes are dropped.
 */
function scoped(base: string, did: string | undefined): string | null {
  return did ? `${base}:${did}` : null
}

/**
 * One-time migration of data written under the old device-wide keys: the first
 * account to load adopts it (never overwriting its own), then the legacy keys are
 * removed so no other account can pick it up.
 */
export async function adoptLegacyContextData(
  did: string | undefined,
): Promise<void> {
  if (!did) return
  for (const base of [PREFS_KEY, EVENTS_KEY, OPEN_DWELL_KEY]) {
    try {
      const raw = await AsyncStorage.getItem(base)
      if (raw == null) continue
      const key = `${base}:${did}`
      if ((await AsyncStorage.getItem(key)) == null) {
        await AsyncStorage.setItem(key, raw)
      }
      await AsyncStorage.removeItem(base)
    } catch (e) {
      logger.warn('contextEngine: adoptLegacyContextData failed', {
        safeMessage: String(e),
      })
    }
  }
}

export const DEFAULT_PREFS: ContextPrefs = {
  enabled: false,
  backgroundEnabled: false,
  places: [],
}

/** Keep only well-formed labeled places (id/name/lat/lon/radiusM). On-device only. */
function sanitizePlaces(raw: unknown): LabeledPlace[] {
  if (!Array.isArray(raw)) return []
  const out: LabeledPlace[] = []
  for (const v of raw) {
    if (!v || typeof v !== 'object') continue
    const p = v as Record<string, unknown>
    if (
      typeof p.id === 'string' &&
      typeof p.name === 'string' &&
      typeof p.lat === 'number' &&
      typeof p.lon === 'number'
    ) {
      out.push({
        id: p.id,
        name: p.name,
        lat: p.lat,
        lon: p.lon,
        radiusM:
          typeof p.radiusM === 'number' && p.radiusM > 0 ? p.radiusM : 120,
        ...(typeof p.savedAt === 'number' ? {savedAt: p.savedAt} : {}),
      })
    }
  }
  return out
}

export async function loadPrefs(did: string | undefined): Promise<ContextPrefs> {
  const key = scoped(PREFS_KEY, did)
  if (!key) return DEFAULT_PREFS
  try {
    const raw = await AsyncStorage.getItem(key)
    if (!raw) return DEFAULT_PREFS
    const p = JSON.parse(raw) as Partial<ContextPrefs>
    return {
      enabled: p.enabled === true,
      backgroundEnabled: p.backgroundEnabled === true,
      home: p.home,
      work: p.work,
      places: sanitizePlaces(p.places),
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export async function savePrefs(
  did: string | undefined,
  prefs: ContextPrefs,
): Promise<void> {
  const key = scoped(PREFS_KEY, did)
  if (!key) return
  try {
    await AsyncStorage.setItem(key, JSON.stringify(prefs))
  } catch (e) {
    logger.warn('contextEngine: savePrefs failed', {safeMessage: String(e)})
  }
}

export async function loadEvents(
  did: string | undefined,
): Promise<ContextEvent[]> {
  const key = scoped(EVENTS_KEY, did)
  if (!key) return []
  try {
    const raw = await AsyncStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ContextEvent[]) : []
  } catch {
    return []
  }
}

async function saveEvents(
  did: string | undefined,
  events: ContextEvent[],
): Promise<void> {
  const key = scoped(EVENTS_KEY, did)
  if (!key) return
  try {
    await AsyncStorage.setItem(key, JSON.stringify(events))
  } catch (e) {
    logger.warn('contextEngine: saveEvents failed', {safeMessage: String(e)})
  }
}

/** Prepend a new conclusion (newest-first), capped at MAX_EVENTS. */
export async function appendEvent(
  did: string | undefined,
  event: ContextEvent,
): Promise<ContextEvent[]> {
  if (!did) return []
  const events = [event, ...(await loadEvents(did))].slice(0, MAX_EVENTS)
  await saveEvents(did, events)
  return events
}

export async function deleteEvent(
  did: string | undefined,
  id: string,
): Promise<ContextEvent[]> {
  const events = (await loadEvents(did)).filter(e => e.id !== id)
  await saveEvents(did, events)
  return events
}

export async function clearEvents(did: string | undefined): Promise<void> {
  const key = scoped(EVENTS_KEY, did)
  if (!key) return
  try {
    await AsyncStorage.removeItem(key)
  } catch (e) {
    logger.warn('contextEngine: clearEvents failed', {safeMessage: String(e)})
  }
}

// ── Phase 1.5: open-dwell persistence (background visit detection) ──────────────

function asCoords(v: unknown): {lat: number; lng: number} | undefined {
  if (!v || typeof v !== 'object') return undefined
  const c = v as {lat?: unknown; lng?: unknown}
  return typeof c.lat === 'number' && typeof c.lng === 'number'
    ? {lat: c.lat, lng: c.lng}
    : undefined
}

export async function loadOpenDwell(
  did: string | undefined,
): Promise<OpenDwell | null> {
  const key = scoped(OPEN_DWELL_KEY, did)
  if (!key) return null
  try {
    const raw = await AsyncStorage.getItem(key)
    if (!raw) return null
    const d = JSON.parse(raw) as Partial<OpenDwell>
    if (typeof d?.place !== 'string' || typeof d?.startAt !== 'number')
      return null
    return {
      place: d.place,
      placeRef: d.placeRef,
      confidence: typeof d.confidence === 'number' ? d.confidence : 0.2,
      startAt: d.startAt,
      // Transient motion/dwell working state (carried across background wakes).
      lastAt: typeof d.lastAt === 'number' ? d.lastAt : undefined,
      anchor: asCoords(d.anchor),
      lastCoords: asCoords(d.lastCoords),
    }
  } catch {
    return null
  }
}

export async function saveOpenDwell(
  did: string | undefined,
  dwell: OpenDwell,
): Promise<void> {
  const key = scoped(OPEN_DWELL_KEY, did)
  if (!key) return
  try {
    await AsyncStorage.setItem(key, JSON.stringify(dwell))
  } catch (e) {
    logger.warn('contextEngine: saveOpenDwell failed', {safeMessage: String(e)})
  }
}

export async function clearOpenDwell(did: string | undefined): Promise<void> {
  const key = scoped(OPEN_DWELL_KEY, did)
  if (!key) return
  try {
    await AsyncStorage.removeItem(key)
  } catch (e) {
    logger.warn('contextEngine: clearOpenDwell failed', {
      safeMessage: String(e),
    })
  }
}
