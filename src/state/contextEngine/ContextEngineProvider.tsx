import {createContext, useContext, useEffect, useRef, useState} from 'react'
import * as Location from 'expo-location'

import {
  deleteContextEvent,
  fetchRecentContext,
  postContextEvents,
} from '#/lib/agent-runtime'
import {getCurrentState} from '#/lib/appState'
import {
  advanceDwell,
  closeDwell,
  derivePlace,
  isInTransit,
  shouldCapture,
  shouldCaptureBackground,
} from '#/lib/contextEngine/derive'
import {
  type ContextEvent,
  type ContextPrefs,
  type NormalizedGeocode,
  type OpenDwell,
} from '#/lib/contextEngine/types'
import {logger} from '#/logger'
import {IS_NATIVE} from '#/env'
import {
  backgroundLocationSupported,
  getBackgroundPermissionGranted,
  requestBackgroundPermission,
  startBackgroundUpdates,
  stopBackgroundUpdates,
} from './backgroundLocation'
import {
  appendEvent,
  clearEvents,
  DEFAULT_PREFS,
  deleteEvent as deleteEventFromStore,
  loadEvents,
  loadPrefs,
  savePrefs,
} from './store'

/**
 * Drives the Context Engine: foreground (when-in-use) location sampling while the
 * app is active and the user has opted in, reduced to coarse conclusions and stored
 * locally (+ best-effort synced). NOTHING is captured unless explicitly enabled AND
 * permission granted (the opt-in gate). No background modes / entitlements.
 */

const CAPTURE_INTERVAL_MS = 4 * 60 * 1000 // battery-light foreground sampling

interface ContextEngineApi {
  prefs: ContextPrefs
  events: ContextEvent[]
  permissionGranted: boolean
  /** True when actively capturing (enabled + permission). Drives the UI indicator. */
  active: boolean
  setEnabled: (on: boolean) => void
  setHome: () => void
  setWork: () => void
  deleteEvent: (id: string) => void
  clearAll: () => void
  refresh: () => void
  // ── Phase 1.5: all-day BACKGROUND place context (separate, higher opt-in) ──
  /** Whether background place context is even possible on this platform. */
  backgroundSupported: boolean
  /** Always-location permission granted. */
  backgroundPermissionGranted: boolean
  /** True when background capture is actively running (opt-in + Always permission). */
  backgroundActive: boolean
  setBackgroundEnabled: (on: boolean) => void
}

const Context = createContext<ContextEngineApi>({
  prefs: DEFAULT_PREFS,
  events: [],
  permissionGranted: false,
  active: false,
  setEnabled: () => {},
  setHome: () => {},
  setWork: () => {},
  deleteEvent: () => {},
  clearAll: () => {},
  refresh: () => {},
  backgroundSupported: false,
  backgroundPermissionGranted: false,
  backgroundActive: false,
  setBackgroundEnabled: () => {},
})

function newId(at: number): string {
  return `${at.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeGeocode(
  g: Location.LocationGeocodedAddress,
): NormalizedGeocode {
  return {
    name: g.name ?? undefined,
    street: g.street ?? undefined,
    city: g.city ?? undefined,
    region: g.region ?? undefined,
    district: g.district ?? undefined,
  }
}

export function ContextEngineProvider({children}: React.PropsWithChildren<{}>) {
  const [prefs, setPrefs] = useState<ContextPrefs>(DEFAULT_PREFS)
  const [events, setEvents] = useState<ContextEvent[]>([])
  const [permissionGranted, setPermissionGranted] = useState(false)
  // Phase 1.5: Always-location permission, tracked separately from when-in-use.
  const [backgroundPermissionGranted, setBackgroundPermissionGranted] =
    useState(false)

  // Latest prefs for async mutators (avoids stale closures without effect churn).
  const prefsRef = useRef(prefs)
  useEffect(() => {
    prefsRef.current = prefs
  }, [prefs])

  // Open dwell: the place we're currently "in". Conclusion + transient working coords
  // (anchor/last sample) used for proximity + motion gating; never written to an event.
  const openRef = useRef<OpenDwell | null>(null)

  // Initial local load + permission check.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [p, ev] = await Promise.all([loadPrefs(), loadEvents()])
      if (cancelled) return
      setPrefs(p)
      setEvents(ev)
      if (IS_NATIVE && p.enabled) {
        const perm = await Location.getForegroundPermissionsAsync().catch(
          () => null,
        )
        if (!cancelled) setPermissionGranted(perm?.granted === true)
      }
      // Phase 1.5: if background context was left on, re-check Always permission and
      // (re)start the background updates so they survive an app/device restart.
      if (IS_NATIVE && p.backgroundEnabled) {
        const bg = await getBackgroundPermissionGranted()
        if (cancelled) return
        setBackgroundPermissionGranted(bg)
        if (bg) void startBackgroundUpdates()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const active = shouldCapture({enabled: prefs.enabled, permissionGranted})
  const backgroundActive = shouldCaptureBackground({
    backgroundEnabled: prefs.backgroundEnabled === true,
    backgroundPermissionGranted,
  })

  const recordEvent = (ev: ContextEvent) => {
    void (async () => {
      const next = await appendEvent(ev)
      setEvents(next)
      void postContextEvents([ev]) // best-effort sync; no-ops if unreachable
    })()
  }

  const flushOpenDwell = () => {
    const open = openRef.current
    if (!open) return
    // Only commit if the dwell met the threshold (no instantaneous "0 min" entries).
    for (const ev of closeDwell(open, Date.now(), newId)) recordEvent(ev)
    openRef.current = null
  }

  // Capture loop: only runs when actively capturing.
  useEffect(() => {
    if (!IS_NATIVE || !active) {
      flushOpenDwell()
      return
    }
    let cancelled = false
    const sample = async () => {
      if (getCurrentState() !== 'active') return
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        })
        if (cancelled) return
        const coords = {lat: pos.coords.latitude, lng: pos.coords.longitude}
        const now = Date.now()
        const open = openRef.current
        // In transit -> nothing gets logged, so skip the reverse-geocode (battery/cost).
        const prev =
          open?.lastCoords && typeof open.lastAt === 'number'
            ? {coords: open.lastCoords, at: open.lastAt}
            : undefined
        const moving = isInTransit(pos.coords.speed, prev, now, coords)
        let geocode: NormalizedGeocode | undefined
        if (!moving) {
          const geos = await Location.reverseGeocodeAsync({
            latitude: coords.lat,
            longitude: coords.lng,
          }).catch(() => [] as Location.LocationGeocodedAddress[])
          if (cancelled) return
          geocode = geos[0] ? normalizeGeocode(geos[0]) : undefined
        }
        const concl = derivePlace({coords, geocode, prefs: prefsRef.current})
        // Raw coords stay transient (open-dwell working state only) — never recorded.
        const {events, open: nextOpen} = advanceDwell(
          open,
          {coords, speedMps: pos.coords.speed, conclusion: concl},
          now,
          newId,
        )
        openRef.current = nextOpen
        for (const ev of events) recordEvent(ev)
      } catch (e) {
        logger.warn('contextEngine: sample failed', {safeMessage: String(e)})
      }
    }
    void sample()
    const id = setInterval(() => void sample(), CAPTURE_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- flushOpenDwell/recordEvent are stable; prefs read via ref
  }, [active])

  const setEnabled = (on: boolean) => {
    void (async () => {
      if (on && IS_NATIVE) {
        const perm = await Location.requestForegroundPermissionsAsync().catch(
          () => null,
        )
        setPermissionGranted(perm?.granted === true)
      }
      const next: ContextPrefs = {...prefsRef.current, enabled: on}
      setPrefs(next)
      await savePrefs(next)
    })()
  }

  // Phase 1.5: the separate, higher background opt-in. Requests Always permission and
  // starts/stops the OS background updates. Persists the intent even if permission is
  // denied (the toggle then reads "on, needs permission"; backgroundActive stays false).
  const setBackgroundEnabled = (on: boolean) => {
    void (async () => {
      if (on) {
        const granted = IS_NATIVE ? await requestBackgroundPermission() : false
        setBackgroundPermissionGranted(granted)
        if (granted) await startBackgroundUpdates()
      } else {
        await stopBackgroundUpdates()
      }
      const next: ContextPrefs = {...prefsRef.current, backgroundEnabled: on}
      setPrefs(next)
      await savePrefs(next)
    })()
  }

  const setAnchor = (which: 'home' | 'work') => {
    void (async () => {
      if (!IS_NATIVE) return
      try {
        let granted = (await Location.getForegroundPermissionsAsync()).granted
        if (!granted) {
          granted = (await Location.requestForegroundPermissionsAsync()).granted
          setPermissionGranted(granted)
        }
        if (!granted) return
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        })
        const next: ContextPrefs = {
          ...prefsRef.current,
          [which]: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            label: which === 'home' ? 'Home' : 'Work',
          },
        }
        setPrefs(next)
        await savePrefs(next)
      } catch (e) {
        logger.warn('contextEngine: setAnchor failed', {safeMessage: String(e)})
      }
    })()
  }

  const deleteEvent = (id: string) => {
    void (async () => {
      const next = await deleteEventFromStore(id)
      setEvents(next)
      void deleteContextEvent(id)
    })()
  }

  const clearAll = () => {
    void (async () => {
      const current = await loadEvents()
      await clearEvents()
      setEvents([])
      for (const e of current) void deleteContextEvent(e.id)
    })()
  }

  const refresh = () => {
    void (async () => {
      const [local, remote] = await Promise.all([
        loadEvents(),
        fetchRecentContext(),
      ])
      const byId = new Map<string, ContextEvent>()
      for (const e of remote) byId.set(e.id, e)
      for (const e of local) byId.set(e.id, e) // local wins
      setEvents([...byId.values()].sort((a, b) => b.at - a.at))
    })()
  }

  const value: ContextEngineApi = {
    prefs,
    events,
    permissionGranted,
    active,
    setEnabled,
    setHome: () => setAnchor('home'),
    setWork: () => setAnchor('work'),
    deleteEvent,
    clearAll,
    refresh,
    backgroundSupported: IS_NATIVE && backgroundLocationSupported(),
    backgroundPermissionGranted,
    backgroundActive,
    setBackgroundEnabled,
  }

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useContextEngine(): ContextEngineApi {
  return useContext(Context)
}
