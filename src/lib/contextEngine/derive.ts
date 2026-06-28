import {
  type Anchor,
  type ContextEvent,
  type ContextPlace,
  type ContextPrefs,
  type Coords,
  type NormalizedGeocode,
  type OpenDwell,
} from './types'

/**
 * Pure place-derivation + dwell logic for the Context Engine. No I/O, no React —
 * the provider feeds it sampled coords + a reverse-geocode and it returns a coarse
 * CONCLUSION. Trivially unit-testable.
 */

/** Great-circle distance between two coordinates, in meters. */
export function haversineMeters(a: Coords, b: Coords): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Radius (m) within which a sample counts as "at" a user-set home/work anchor. */
export const ANCHOR_RADIUS_M = 160

/** Match a sample against the user's home/work anchors. */
export function matchAnchor(
  coords: Coords,
  prefs: ContextPrefs,
  radiusM = ANCHOR_RADIUS_M,
): 'home' | 'work' | undefined {
  const near = (anchor?: Anchor) =>
    !!anchor &&
    haversineMeters(coords, {lat: anchor.lat, lng: anchor.lng}) <= radiusM
  if (near(prefs.home)) return 'home'
  if (near(prefs.work)) return 'work'
  return undefined
}

/**
 * A coarse venue/place conclusion + confidence. Order of preference:
 *   1. user-set home/work anchor (high confidence)
 *   2. a named place from reverse-geocode that isn't just the street -> 'venue'
 *   3. a city -> 'out'
 *   4. nothing -> 'unknown'
 */
export function derivePlace(input: {
  coords: Coords
  geocode?: NormalizedGeocode
  prefs: ContextPrefs
}): {place: ContextPlace; placeRef?: string; confidence: number} {
  const anchor = matchAnchor(input.coords, input.prefs)
  if (anchor) {
    const ref =
      anchor === 'home' ? input.prefs.home?.label : input.prefs.work?.label
    return {place: anchor, placeRef: ref, confidence: 0.9}
  }
  const g = input.geocode
  const name = g?.name?.trim()
  const street = g?.street?.trim()
  // A POI name distinct from the street suggests a venue (bar/arena/cafe/etc.).
  if (name && name !== street) {
    return {place: 'venue', placeRef: name, confidence: 0.6}
  }
  const city = g?.city?.trim() || g?.district?.trim() || g?.region?.trim()
  if (city) {
    return {place: 'out', placeRef: city, confidence: 0.4}
  }
  return {place: 'unknown', confidence: 0.2}
}

/** Dwell duration in whole minutes (>= 0). */
export function dwellMinutes(startAt: number, endAt: number): number {
  return Math.max(0, Math.round((endAt - startAt) / 60_000))
}

/** Whether the new conclusion is a different place than the previous one. */
export function placeChanged(
  prev: {place: ContextPlace; placeRef?: string} | null,
  next: {place: ContextPlace; placeRef?: string},
): boolean {
  if (!prev) return true
  return prev.place !== next.place || prev.placeRef !== next.placeRef
}

/** Build a normalized, conclusion-only ContextEvent. */
export function buildContextEvent(input: {
  id: string
  at: number
  place: ContextPlace
  placeRef?: string
  confidence: number
  durationMin: number
}): ContextEvent {
  return {
    id: input.id,
    at: input.at,
    place: input.place,
    placeRef: input.placeRef,
    attention: {durationMin: input.durationMin},
    confidence: input.confidence,
    sources: ['location'],
  }
}

/**
 * THE OPT-IN GATE. Nothing is captured unless the engine is explicitly enabled AND
 * when-in-use location permission is granted. Used by the provider before any
 * sampling; tested to guarantee "nothing captured when off".
 */
export function shouldCapture(state: {
  enabled: boolean
  permissionGranted: boolean
}): boolean {
  return state.enabled === true && state.permissionGranted === true
}

/**
 * Phase 1.5 BACKGROUND opt-in gate. The all-day background path captures NOTHING
 * unless the (separate, higher) background opt-in is explicitly on AND the Always
 * permission is granted. Checked both before starting background updates and inside
 * the background task itself (defence in depth), and tested to guarantee "nothing
 * captured in the background when off".
 */
export function shouldCaptureBackground(state: {
  backgroundEnabled: boolean
  backgroundPermissionGranted: boolean
}): boolean {
  return (
    state.backgroundEnabled === true &&
    state.backgroundPermissionGranted === true
  )
}

/**
 * Tunable thresholds for dwell-based logging + transit suppression. A "place" is only
 * worth logging when the user is STATIONARY and DWELLS — driving past a string of
 * addresses must never produce venue entries. All values are conservative defaults;
 * adjust here in one spot.
 */
export const CONTEXT_TUNING = {
  /** At/above this speed we treat the user as in transit (m/s). 2.5 ~ 9 km/h: above a
   *  brisk walk, so driving/cycling is suppressed but pacing around a venue is not. */
  movingSpeedMps: 2.5,
  /** Samples within this distance of the dwell anchor count as the SAME place (m).
   *  "Same place" is geographic, NOT the reverse-geocoded address string (which changes
   *  every few meters while moving). */
  dwellRadiusM: 75,
  /** Minimum time stationary at one place before it is worth logging (ms). Below this a
   *  dwell is a drive-by / pass-through and is discarded, never written as an event. */
  minDwellMs: 3 * 60_000,
}

export type ContextTuning = typeof CONTEXT_TUNING

/** One location sample reduced for the dwell engine: where, how fast, and the place. */
export interface DwellSample {
  coords: Coords
  /** GPS speed in m/s when known. expo-location reports null/-1 when unavailable. */
  speedMps?: number | null
  conclusion: {place: ContextPlace; placeRef?: string; confidence: number}
}

/**
 * Is the user in transit (moving) at this sample? Prefers the GPS-reported speed; when
 * that's unavailable (null/-1) falls back to displacement-over-time vs the previous
 * sample. The sequential-addresses + "0 min" pattern is exactly what this suppresses.
 * PURE.
 */
export function isInTransit(
  speedMps: number | null | undefined,
  prev: {coords: Coords; at: number} | undefined,
  now: number,
  coords: Coords,
  movingSpeedMps: number = CONTEXT_TUNING.movingSpeedMps,
): boolean {
  if (typeof speedMps === 'number' && speedMps >= 0) {
    return speedMps >= movingSpeedMps
  }
  if (prev && now > prev.at) {
    const dtSec = (now - prev.at) / 1000
    const speed = haversineMeters(coords, prev.coords) / Math.max(1, dtSec)
    return speed >= movingSpeedMps
  }
  return false
}

/**
 * Close an open dwell into a ContextEvent — but ONLY if it accrued at least the dwell
 * threshold. A too-short dwell (drive-by / pass-through) yields no event. PURE.
 */
export function closeDwell(
  open: OpenDwell | null,
  now: number,
  idFor: (at: number) => string,
  tuning: ContextTuning = CONTEXT_TUNING,
): ContextEvent[] {
  if (!open) return []
  const lastAt = open.lastAt ?? open.startAt
  if (lastAt - open.startAt < tuning.minDwellMs) return []
  return [
    buildContextEvent({
      id: idFor(now),
      at: now,
      place: open.place,
      placeRef: open.placeRef,
      confidence: open.confidence,
      durationMin: dwellMinutes(open.startAt, lastAt),
    }),
  ]
}

/**
 * Dwell transition (PURE) with motion suppression + a dwell threshold. Given the open
 * dwell and a fresh sample (coords, speed, conclusion), decide what to record:
 *   - MOVING (transit) -> log NOTHING. Close out a prior dwell only if it already met
 *     the threshold; carry no open place while in motion. This is what stops the
 *     "new Venue every 1-2 s while driving" stream.
 *   - STATIONARY, no open dwell -> open one anchored here (not yet loggable).
 *   - STATIONARY, within dwellRadius of the anchor -> SAME place; keep accruing.
 *   - STATIONARY, beyond the radius -> arrived somewhere new: close the old dwell (if it
 *     met the threshold) and open a fresh one here.
 * Stateless so the background task can drive it across wakes from the persisted dwell.
 * `idFor` injects id generation for determinism + testability.
 */
export function advanceDwell(
  open: OpenDwell | null,
  sample: DwellSample,
  now: number,
  idFor: (at: number) => string,
  tuning: ContextTuning = CONTEXT_TUNING,
): {events: ContextEvent[]; open: OpenDwell | null} {
  const {coords, speedMps, conclusion} = sample
  const prev =
    open?.lastCoords && typeof open.lastAt === 'number'
      ? {coords: open.lastCoords, at: open.lastAt}
      : undefined

  // TRANSIT: suppress all place logging. Emit a prior dwell only if it already qualified.
  if (isInTransit(speedMps, prev, now, coords, tuning.movingSpeedMps)) {
    return {events: closeDwell(open, now, idFor, tuning), open: null}
  }

  const fresh: OpenDwell = {
    place: conclusion.place,
    placeRef: conclusion.placeRef,
    confidence: conclusion.confidence,
    startAt: now,
    lastAt: now,
    anchor: coords,
    lastCoords: coords,
  }

  if (!open) return {events: [], open: fresh}

  // "Same place" is geographic proximity to the anchor (NOT the address string). Fall
  // back to the place/ref match for an open dwell that predates coord tracking.
  const samePlace = open.anchor
    ? haversineMeters(coords, open.anchor) <= tuning.dwellRadiusM
    : !placeChanged(open, conclusion)

  if (samePlace) {
    // Keep accruing; adopt a higher-confidence conclusion (e.g. anchor match arrives).
    const better = conclusion.confidence > open.confidence
    return {
      events: [],
      open: {
        ...open,
        place: better ? conclusion.place : open.place,
        placeRef: better ? conclusion.placeRef : open.placeRef,
        confidence: Math.max(open.confidence, conclusion.confidence),
        lastAt: now,
        anchor: open.anchor ?? coords,
        lastCoords: coords,
      },
    }
  }

  // Moved (while stationary) to a new spot -> close the old dwell if it qualified.
  return {events: closeDwell(open, now, idFor, tuning), open: fresh}
}
