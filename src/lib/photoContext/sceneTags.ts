import {type ContextPlace} from '#/lib/contextEngine/types'

/**
 * Photo scene tags (Phase 1) — coarse, on-device-friendly scene labels for a captured
 * photo, plus the PURE fusion that combines a scene with a place to infer an activity
 * (e.g. trailhead + forest photo -> "hiking"). No I/O here; the classifier feeds tags in.
 *
 * CLASSIFIER CHOICE: true scene classification needs image bytes, which the passive EXIF
 * photo sampler deliberately never reads. So tags are produced by the "small vision call"
 * (`sceneClient.fetchSceneTags`) on an EXPLICITLY-captured/shared photo only — the same
 * bytes-leave-by-user-action boundary as the in-chat vision path. This module is the pure
 * vocabulary + fusion brain both sides share; it is what makes the tags useful.
 */

/** The canonical coarse scene vocabulary. Kept small + cheap; extend deliberately. */
export const SCENE_TAGS = [
  'forest',
  'trail',
  'rocks',
  'mountain',
  'water',
  'beach',
  'snow',
  'field',
  'park',
  'urban',
  'indoor',
  'food',
  'people',
  'animal',
  'vehicle',
  'sky',
  'night',
] as const

export type SceneTag = (typeof SCENE_TAGS)[number]

const SCENE_TAG_SET: ReadonlySet<string> = new Set(SCENE_TAGS)

/** Synonyms mapped onto the canonical vocabulary so a noisy classifier still lands. */
const SCENE_SYNONYMS: Record<string, SceneTag> = {
  woods: 'forest',
  woodland: 'forest',
  tree: 'forest',
  trees: 'forest',
  path: 'trail',
  trailhead: 'trail',
  hiking: 'trail',
  rock: 'rocks',
  stone: 'rocks',
  boulder: 'rocks',
  cliff: 'rocks',
  peak: 'mountain',
  mountains: 'mountain',
  hill: 'mountain',
  river: 'water',
  lake: 'water',
  waterfall: 'water',
  falls: 'water',
  sea: 'beach',
  ocean: 'beach',
  coast: 'beach',
  sand: 'beach',
  meadow: 'field',
  grass: 'field',
  garden: 'park',
  city: 'urban',
  street: 'urban',
  building: 'urban',
  inside: 'indoor',
  room: 'indoor',
  restaurant: 'food',
  meal: 'food',
  dog: 'animal',
  cat: 'animal',
  car: 'vehicle',
}

/**
 * Normalize raw classifier labels into the canonical vocabulary: lower-case, map synonyms,
 * keep only known tags, de-dupe, preserve input order. PURE.
 */
export function normalizeSceneTags(raw: unknown): SceneTag[] {
  if (!Array.isArray(raw)) return []
  const out: SceneTag[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const key = item.trim().toLowerCase()
    if (!key) continue
    const tag = SCENE_TAG_SET.has(key) ? (key as SceneTag) : SCENE_SYNONYMS[key]
    if (tag && !seen.has(tag)) {
      seen.add(tag)
      out.push(tag)
    }
  }
  return out
}

/**
 * Fuse a place conclusion with photo scene tags into a coarse ACTIVITY hint — the
 * "trailhead + forest photo -> hiking" inference. Returns undefined when nothing
 * confidently combines. PURE; intentionally conservative.
 */
export function fusePlaceAndScene(input: {
  place?: ContextPlace
  placeRef?: string
  tags: SceneTag[]
}): string | undefined {
  const tags = new Set(input.tags)
  const has = (...t: SceneTag[]) => t.some(x => tags.has(x))
  const ref = input.placeRef?.toLowerCase() ?? ''
  const outdoorPlace =
    input.place === 'out' ||
    input.place === 'venue' ||
    input.place === 'named' ||
    /trail|falls|park|reserve|track|summit|mountain/.test(ref)

  if (has('trail', 'forest', 'mountain', 'rocks') && outdoorPlace)
    return 'hiking'
  if (has('beach', 'water') && outdoorPlace) return 'at the water'
  if (has('snow') && outdoorPlace) return 'in the snow'
  if (has('food')) return 'eating'
  if (has('indoor') && input.place !== 'home') return 'indoors'
  if (has('forest', 'trail', 'mountain', 'rocks', 'field', 'park'))
    return 'outdoors'
  return undefined
}
