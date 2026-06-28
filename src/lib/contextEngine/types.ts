/**
 * Context Engine — PHASE 1 (LOCATION ONLY). Privacy-first, opt-in.
 *
 * NO microphone / audio / transcription / vision. We sample location only while the
 * app is open (when-in-use), reduce each sample to a COARSE conclusion on-device,
 * and store ONLY the conclusion — never raw coordinates. Raw coords exist only
 * transiently in memory while deriving a place, then are discarded.
 */

/** Coarse place conclusion. Never a precise address. */
export type ContextPlace = 'home' | 'work' | 'venue' | 'out' | 'unknown'

/**
 * A derived context event — a CONCLUSION, not raw data. `placeRef` is a coarse
 * human label (venue name / city), never coordinates.
 */
export interface ContextEvent {
  id: string
  /** Unix ms when the conclusion was recorded. */
  at: number
  place: ContextPlace
  /** Coarse label (e.g. venue name or city). No coordinates. */
  placeRef?: string
  /** Phase-1 attention is place-dwell only (no audio-derived activity). */
  attention: {durationMin: number}
  /** 0..1 confidence in the place conclusion. */
  confidence: number
  /** Always exactly ['location'] in Phase 1. */
  sources: ['location']
}

/**
 * A user-designated reference point (e.g. "set current location as Home"). Stored
 * LOCALLY ONLY for on-device matching — never synced. This is the only coordinate
 * the engine persists, and only because the user explicitly anchored it.
 */
export interface Anchor {
  lat: number
  lng: number
  label?: string
}

/** Local opt-in prefs + anchors. `enabled` defaults OFF. */
export interface ContextPrefs {
  /** Phase 1: when-in-use (foreground) capture opt-in. OFF by default. */
  enabled: boolean
  /**
   * Phase 1.5: SEPARATE, higher opt-in for all-day BACKGROUND place context
   * (Always location + background updates). OFF by default and independent of
   * `enabled` — turning it on requests the Always permission and starts background
   * visit detection; turning it off stops it. Phase 1 foreground behavior is
   * unaffected either way.
   */
  backgroundEnabled?: boolean
  home?: Anchor
  work?: Anchor
}

/**
 * Phase 1.5 open-dwell state, persisted across background task wakes (the task is
 * stateless between invocations). Conclusion-only — NO coordinates. `startAt` is when
 * we arrived at this place; on departure (place change) we flush a ContextEvent with
 * the elapsed dwell.
 */
export interface OpenDwell {
  place: ContextPlace
  placeRef?: string
  confidence: number
  /** Unix ms when this place dwell began. */
  startAt: number
  /**
   * Unix ms of the latest sample still attributed to this dwell. The dwell duration is
   * startAt..lastAt, so a place is only logged once this exceeds the dwell threshold
   * (instantaneous "0 min" drive-bys are never committed).
   */
  lastAt?: number
  /**
   * Coarse anchor coords of this dwell and the last sample's coords — LOCAL transient
   * working state only (used to decide "still here" by proximity and to detect motion
   * across wakes). NEVER copied into a ContextEvent; events stay conclusion-only.
   */
  anchor?: Coords
  lastCoords?: Coords
}

export interface Coords {
  lat: number
  lng: number
}

/** Coarse reverse-geocode fields (from expo-location), used to derive a place. */
export interface NormalizedGeocode {
  name?: string
  street?: string
  city?: string
  region?: string
  district?: string
}
