import {type Coords, type NearbyPlace} from '#/lib/contextEngine/types'
import {logger} from '#/logger'
import {getSupabaseAccessToken} from './authToken'
import {poiNearbyUrl} from './config'

/**
 * POI proxy client: resolve the nearest NAMED place for a coordinate via the runtime's
 * /app/poi/nearby proxy (self-hosted OSM/Overpass behind it). Used by the Context Engine
 * to label outdoor stops (trailheads/falls/parks) instead of the bare street number Expo's
 * reverse-geocoder returns ("Venue · 3471").
 *
 * Owner-scoped (Supabase bearer). RESILIENT: never throws. Returns the nearest usable
 * named place, or `null` when signed out / unreachable / the proxy isn't deployed yet /
 * there's no named POI — so place resolution degrades to the reverse-geocode/address.
 *
 * Contract (tolerant to field drift): GET /app/poi/nearby?lat=&lon=&radius= ->
 *   {places:[{name, category, distanceM, lat, lon, source}], resolvedAt}
 */

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined
}
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** Normalize one raw POI row (tolerates name/title, distanceM/distance/dist). PURE. */
export function normalizeNearbyPlace(raw: unknown): NearbyPlace | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const name = str(r.name) ?? str(r.title) ?? str(r.label)
  if (!name) return null
  return {
    name,
    category: str(r.category) ?? str(r.type) ?? str(r.kind),
    distanceM: num(r.distanceM) ?? num(r.distance) ?? num(r.dist),
    source: str(r.source) ?? str(r.provider),
  }
}

/**
 * Pick the most relevant named place from the proxy response: nearest by distance when
 * distances are present, else the first (the proxy is expected to return nearest-first).
 * PURE — accepts the parsed `{places:[...]}` (tolerates a bare array too).
 */
export function pickNearestNamed(json: unknown): NearbyPlace | null {
  const rows = Array.isArray(json)
    ? json
    : Array.isArray((json as {places?: unknown})?.places)
      ? (json as {places: unknown[]}).places
      : []
  const places = rows
    .map(normalizeNearbyPlace)
    .filter((p): p is NearbyPlace => p !== null)
  if (places.length === 0) return null
  return places.reduce((best, p) =>
    (p.distanceM ?? Infinity) < (best.distanceM ?? Infinity) ? p : best,
  )
}

async function authHeaders(): Promise<Record<string, string> | null> {
  const token = await getSupabaseAccessToken()
  if (!token) return null
  return {Authorization: `Bearer ${token}`}
}

/** GET /app/poi/nearby — nearest named place, or null. Never throws. */
export async function fetchNearbyPoi(
  coords: Coords,
  radiusM: number,
): Promise<NearbyPlace | null> {
  try {
    const headers = await authHeaders()
    if (!headers) return null
    const res = await fetch(poiNearbyUrl(coords.lat, coords.lng, radiusM), {
      method: 'GET',
      headers,
    })
    if (!res.ok) return null
    return pickNearestNamed(await res.json())
  } catch (e) {
    logger.warn('poi: nearby lookup failed', {safeMessage: String(e)})
    return null
  }
}
