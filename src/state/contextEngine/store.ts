import AsyncStorage from '@react-native-async-storage/async-storage'

import {
  type ContextEvent,
  type ContextPrefs,
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

export const DEFAULT_PREFS: ContextPrefs = {enabled: false, backgroundEnabled: false}

export async function loadPrefs(): Promise<ContextPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    const p = JSON.parse(raw) as Partial<ContextPrefs>
    return {
      enabled: p.enabled === true,
      backgroundEnabled: p.backgroundEnabled === true,
      home: p.home,
      work: p.work,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export async function savePrefs(prefs: ContextPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch (e) {
    logger.warn('contextEngine: savePrefs failed', {safeMessage: String(e)})
  }
}

export async function loadEvents(): Promise<ContextEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(EVENTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ContextEvent[]) : []
  } catch {
    return []
  }
}

async function saveEvents(events: ContextEvent[]): Promise<void> {
  try {
    await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(events))
  } catch (e) {
    logger.warn('contextEngine: saveEvents failed', {safeMessage: String(e)})
  }
}

/** Prepend a new conclusion (newest-first), capped at MAX_EVENTS. */
export async function appendEvent(event: ContextEvent): Promise<ContextEvent[]> {
  const events = [event, ...(await loadEvents())].slice(0, MAX_EVENTS)
  await saveEvents(events)
  return events
}

export async function deleteEvent(id: string): Promise<ContextEvent[]> {
  const events = (await loadEvents()).filter(e => e.id !== id)
  await saveEvents(events)
  return events
}

export async function clearEvents(): Promise<void> {
  try {
    await AsyncStorage.removeItem(EVENTS_KEY)
  } catch (e) {
    logger.warn('contextEngine: clearEvents failed', {safeMessage: String(e)})
  }
}

// ── Phase 1.5: open-dwell persistence (background visit detection) ──────────────

export async function loadOpenDwell(): Promise<OpenDwell | null> {
  try {
    const raw = await AsyncStorage.getItem(OPEN_DWELL_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as Partial<OpenDwell>
    if (typeof d?.place !== 'string' || typeof d?.startAt !== 'number') return null
    return {
      place: d.place,
      placeRef: d.placeRef,
      confidence: typeof d.confidence === 'number' ? d.confidence : 0.2,
      startAt: d.startAt,
    }
  } catch {
    return null
  }
}

export async function saveOpenDwell(dwell: OpenDwell): Promise<void> {
  try {
    await AsyncStorage.setItem(OPEN_DWELL_KEY, JSON.stringify(dwell))
  } catch (e) {
    logger.warn('contextEngine: saveOpenDwell failed', {safeMessage: String(e)})
  }
}

export async function clearOpenDwell(): Promise<void> {
  try {
    await AsyncStorage.removeItem(OPEN_DWELL_KEY)
  } catch (e) {
    logger.warn('contextEngine: clearOpenDwell failed', {safeMessage: String(e)})
  }
}
