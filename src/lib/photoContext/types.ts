import {type ContextPlace} from '#/lib/contextEngine/types'

/**
 * Photo Context v1 — PRIVACY-FIRST, OPT-IN, METADATA-ONLY.
 *
 * We read only photo METADATA (creation time + EXIF GPS) for today's photos, on-device,
 * and reduce it to a coarse CONCLUSION ("N photos, ~time window, near <place>"). NO image
 * bytes are ever read or uploaded here. The only place an actual image moves is the
 * EXPLICIT per-photo share, which reuses the images-in-chat vision path on user action.
 */

/** Transient per-photo metadata (creation time + optional EXIF GPS). Never persisted. */
export interface PhotoMeta {
  /** Creation time, unix ms. */
  at: number
  /** EXIF GPS, when present (many photos have none). Used only to derive a coarse place. */
  lat?: number
  lng?: number
}

/** Local opt-in pref. OFF by default; SEPARATE from the Context Engine opt-in. */
export interface PhotoContextPrefs {
  enabled: boolean
}

/**
 * A photo-derived CONCLUSION — metadata only, no image content and no per-photo
 * coordinates. Just the count, the day's time window, and an optional coarse place.
 * `source: 'photos'` distinguishes it from location context events on the shared
 * `/app/context/events` path.
 */
export interface PhotoContextConclusion {
  id: string
  source: 'photos'
  /** Local day (YYYY-MM-DD) the scan covered. */
  date: string
  count: number
  /** Earliest / latest photo creation time in the window (unix ms). */
  firstAt: number
  lastAt: number
  /** Coarse place band, if EXIF GPS let us derive one. */
  place?: ContextPlace
  /** Coarse place label (venue name / city), never coordinates. */
  placeRef?: string
}
