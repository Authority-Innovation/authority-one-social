import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'

import {postContextEvents} from '#/lib/agent-runtime'
import {advanceDwell, derivePlace} from '#/lib/contextEngine/derive'
import {type NormalizedGeocode} from '#/lib/contextEngine/types'
import {logger} from '#/logger'
import {
  appendEvent,
  loadOpenDwell,
  loadPrefs,
  saveOpenDwell,
} from './store'

/**
 * Phase 1.5 background-location controller (iOS/Android). Swaps the Phase 1 SOURCE
 * (foreground interval sampling) for OS background location updates, then runs the
 * SAME pipeline: derivePlace -> advanceDwell -> appendEvent (store) -> postContextEvents
 * (sync to Bob memory). Output stays CONCLUSIONS ONLY (place + dwell); raw coordinates
 * are reduced to a conclusion and discarded inside the task, never stored or synced.
 *
 * BATTERY: balanced accuracy + deferred/coalesced updates + auto-pause. We do NOT use
 * continuous high-accuracy GPS.
 *
 * TODO(CLVisit): expo-location does not expose iOS `CLVisit` (true OS visit detection:
 * arrival/departure with system-grade battery efficiency). This deferred/distance-
 * filtered update path is the pragmatic visit approximation. A small native module
 * wrapping `CLLocationManager.startMonitoringVisits` + `locationManager(_:didVisit:)`
 * would upgrade this to visit-grade fidelity and lower battery; the derive/store/sync
 * pipeline below would be reused unchanged (a visit -> a conclusion).
 */

export const BACKGROUND_LOCATION_TASK = 'authority-one-context-background-location'

function newId(at: number): string {
  return `${at.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeGeocode(g: Location.LocationGeocodedAddress): NormalizedGeocode {
  return {
    name: g.name ?? undefined,
    street: g.street ?? undefined,
    city: g.city ?? undefined,
    region: g.region ?? undefined,
    district: g.district ?? undefined,
  }
}

/**
 * THE BACKGROUND TASK. Defined at module top level so it is registered as soon as this
 * module is evaluated on app launch (including a background launch the OS triggers to
 * deliver a queued location) — `defineTask` must run in global scope, not inside a
 * component. Registering is harmless when background capture is off; the task only
 * fires once `startLocationUpdatesAsync` has been called.
 */
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({data, error}) => {
  if (error) {
    logger.warn('contextEngine: background task error', {
      safeMessage: String(error.message),
    })
    return
  }
  const locations = (data as {locations?: Location.LocationObject[]})?.locations
  if (!locations || locations.length === 0) return

  try {
    // DEFENCE IN DEPTH: re-check the opt-in inside the task. If the user turned
    // background context off after the OS queued this wake, capture nothing.
    const prefs = await loadPrefs()
    if (prefs.backgroundEnabled !== true) return

    const last = locations[locations.length - 1]
    const coords = {lat: last.coords.latitude, lng: last.coords.longitude}
    const geocodes = await Location.reverseGeocodeAsync({
      latitude: coords.lat,
      longitude: coords.lng,
    }).catch(() => [] as Location.LocationGeocodedAddress[])
    const geocode = geocodes[0] ? normalizeGeocode(geocodes[0]) : undefined

    const conclusion = derivePlace({coords, geocode, prefs})
    // Raw coordinates are now discarded — only the conclusion proceeds.
    const now = Date.now()
    const open = await loadOpenDwell()
    const {events, open: nextOpen} = advanceDwell(open, conclusion, now, newId)
    for (const event of events) {
      await appendEvent(event)
      void postContextEvents([event]) // best-effort cross-channel sync; no-ops if unreachable
    }
    await saveOpenDwell(nextOpen)
  } catch (e) {
    logger.warn('contextEngine: background task failed', {safeMessage: String(e)})
  }
})

export function backgroundLocationSupported(): boolean {
  return true
}

export async function getBackgroundPermissionGranted(): Promise<boolean> {
  try {
    return (await Location.getBackgroundPermissionsAsync()).granted
  } catch {
    return false
  }
}

export async function requestBackgroundPermission(): Promise<boolean> {
  try {
    // iOS requires when-in-use before Always can be requested.
    const fg = await Location.requestForegroundPermissionsAsync().catch(() => null)
    if (fg?.granted !== true) return false
    const bg = await Location.requestBackgroundPermissionsAsync().catch(() => null)
    return bg?.granted === true
  } catch {
    return false
  }
}

export async function isBackgroundUpdatesRunning(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
  } catch {
    return false
  }
}

export async function startBackgroundUpdates(): Promise<boolean> {
  try {
    if (await isBackgroundUpdatesRunning()) return true
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      // Battery-light: balanced (not best/high) accuracy, coalesced updates, auto-pause.
      accuracy: Location.Accuracy.Balanced,
      activityType: Location.ActivityType.Other,
      deferredUpdatesInterval: 5 * 60 * 1000, // coalesce wakes to ~5 min
      deferredUpdatesDistance: 120, // ...or ~120 m of movement
      pausesUpdatesAutomatically: true,
      showsBackgroundLocationIndicator: false,
      // Android needs a foreground service for background location; the notification
      // is the transparency surface there.
      foregroundService: {
        notificationTitle: 'All-day place context',
        notificationBody:
          'Recognizing the coarse places you spend time (conclusions only).',
      },
    })
    return true
  } catch (e) {
    logger.warn('contextEngine: startBackgroundUpdates failed', {
      safeMessage: String(e),
    })
    return false
  }
}

export async function stopBackgroundUpdates(): Promise<void> {
  try {
    if (await isBackgroundUpdatesRunning()) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
    }
  } catch (e) {
    logger.warn('contextEngine: stopBackgroundUpdates failed', {
      safeMessage: String(e),
    })
  }
}
