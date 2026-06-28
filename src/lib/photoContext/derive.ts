import {type ContextPlace} from '#/lib/contextEngine/types'
import {fusePlaceAndScene, normalizeSceneTags} from './sceneTags'
import {type PhotoContextConclusion, type PhotoMeta} from './types'

/**
 * Pure derivation for Photo Context. No I/O, no React — the query layer feeds it photo
 * METADATA and it returns a coarse CONCLUSION. Trivially unit-testable.
 */

/**
 * THE OPT-IN GATE. Nothing is read from the photo library unless Photo Context is
 * explicitly enabled AND photo permission is granted. Checked before any query; tested
 * to guarantee "nothing read when off".
 */
export function shouldReadPhotos(state: {
  enabled: boolean
  permissionGranted: boolean
}): boolean {
  return state.enabled === true && state.permissionGranted === true
}

export interface PhotoSummary {
  count: number
  /** Earliest / latest creation time (unix ms); 0 when there are no photos. */
  firstAt: number
  lastAt: number
  /** Coarse centroid of photos that carry EXIF GPS (undefined when none do). */
  centroid?: {lat: number; lng: number}
}

/** Pure metadata summary: count, time window, and a coarse GPS centroid. */
export function summarizePhotos(photos: PhotoMeta[]): PhotoSummary {
  if (photos.length === 0) return {count: 0, firstAt: 0, lastAt: 0}
  let firstAt = Infinity
  let lastAt = -Infinity
  let sumLat = 0
  let sumLng = 0
  let located = 0
  for (const p of photos) {
    if (p.at < firstAt) firstAt = p.at
    if (p.at > lastAt) lastAt = p.at
    if (typeof p.lat === 'number' && typeof p.lng === 'number') {
      sumLat += p.lat
      sumLng += p.lng
      located += 1
    }
  }
  return {
    count: photos.length,
    firstAt,
    lastAt,
    centroid:
      located > 0 ? {lat: sumLat / located, lng: sumLng / located} : undefined,
  }
}

/** Local day key (YYYY-MM-DD) from a Date, using the device's local calendar day. */
export function localDayKey(date: Date): string {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Build the conclusion-only photo event. Returns null for an empty day (nothing to
 * sync). `place`/`placeRef` are resolved by the caller (native reverse-geocode of the
 * centroid); raw per-photo coordinates never reach this conclusion.
 */
export function derivePhotoConclusion(input: {
  photos: PhotoMeta[]
  dayKey: string
  id: string
  place?: ContextPlace
  placeRef?: string
  /** Coarse scene tags from the small vision call (explicit photo only); optional. */
  sceneTags?: string[]
}): PhotoContextConclusion | null {
  if (input.photos.length === 0) return null
  const s = summarizePhotos(input.photos)
  const sceneTags = normalizeSceneTags(input.sceneTags)
  const activityHint = sceneTags.length
    ? fusePlaceAndScene({
        place: input.place,
        placeRef: input.placeRef,
        tags: sceneTags,
      })
    : undefined
  return {
    id: input.id,
    source: 'photos',
    date: input.dayKey,
    count: s.count,
    firstAt: s.firstAt,
    lastAt: s.lastAt,
    place: input.place,
    placeRef: input.placeRef,
    ...(sceneTags.length ? {sceneTags} : {}),
    ...(activityHint ? {activityHint} : {}),
  }
}

/** Short human summary for the UI ("12 photos · near Raleigh"). */
export function describeConclusion(c: PhotoContextConclusion): string {
  const n = `${c.count} photo${c.count === 1 ? '' : 's'}`
  return c.placeRef ? `${n} · near ${c.placeRef}` : n
}
