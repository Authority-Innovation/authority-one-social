import * as Location from 'expo-location'
import * as MediaLibrary from 'expo-media-library'

import {derivePlace} from '#/lib/contextEngine/derive'
import {type ContextPlace} from '#/lib/contextEngine/types'
import {type PhotoMeta} from '#/lib/photoContext/types'
import {logger} from '#/logger'

/**
 * Photo Context media access (iOS/Android). METADATA ONLY: creation time + EXIF GPS for
 * TODAY's photos. We never read image bytes / localUri / base64 here — the only place an
 * image moves is the explicit per-photo share (images-in-chat). Reverse-geocoding the
 * coarse centroid reuses expo-location + the Context Engine's `derivePlace`.
 */

export type PhotoPermission = 'granted' | 'limited' | 'denied' | 'unavailable'

// Cap the per-asset location lookups (getAssetInfoAsync) so a big roll stays cheap.
// Count + time window come from the asset list directly and cover ALL of today's photos.
const LOCATION_SAMPLE = 30

export function photoMediaSupported(): boolean {
  return true
}

function toPermission(res: {
  granted: boolean
  accessPrivileges?: string
}): PhotoPermission {
  if (res.accessPrivileges === 'limited') return 'limited'
  if (res.granted) return 'granted'
  return 'denied'
}

export async function getPhotoPermission(): Promise<PhotoPermission> {
  try {
    return toPermission(await MediaLibrary.getPermissionsAsync())
  } catch {
    return 'denied'
  }
}

export async function requestPhotoPermission(): Promise<PhotoPermission> {
  try {
    // writeOnly=false: read access. On iOS the user may grant LIMITED (selected photos),
    // which we accept — limited is the privacy-preferred grant.
    return toPermission(await MediaLibrary.requestPermissionsAsync(false))
  } catch {
    return 'denied'
  }
}

function startOfTodayMs(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Today's photos as METADATA ONLY (creation time + sampled EXIF GPS). */
export async function queryTodaysPhotoMeta(): Promise<PhotoMeta[]> {
  try {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: MediaLibrary.MediaType.photo,
      createdAfter: startOfTodayMs(),
      first: 1000,
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    })
    const photos: PhotoMeta[] = []
    for (let i = 0; i < page.assets.length; i++) {
      const asset = page.assets[i]
      const meta: PhotoMeta = {at: asset.creationTime}
      // Location is only on the detailed info; sample the most recent N. This reads
      // METADATA (location), never the image bytes.
      if (i < LOCATION_SAMPLE) {
        try {
          const info = await MediaLibrary.getAssetInfoAsync(asset)
          if (info.location) {
            meta.lat = info.location.latitude
            meta.lng = info.location.longitude
          }
        } catch {
          // ignore per-asset info failures
        }
      }
      photos.push(meta)
    }
    return photos
  } catch (e) {
    logger.warn('photoContext: query failed', {safeMessage: String(e)})
    return []
  }
}

/** Reverse-geocode the coarse centroid into a place band + label (coords discarded). */
export async function resolvePlace(coords: {
  lat: number
  lng: number
}): Promise<{place: ContextPlace; placeRef?: string} | undefined> {
  try {
    const geos = await Location.reverseGeocodeAsync({
      latitude: coords.lat,
      longitude: coords.lng,
    }).catch(() => [] as Location.LocationGeocodedAddress[])
    const g = geos[0]
    const geocode = g
      ? {
          name: g.name ?? undefined,
          street: g.street ?? undefined,
          city: g.city ?? undefined,
          region: g.region ?? undefined,
          district: g.district ?? undefined,
        }
      : undefined
    // Reuse the Context Engine place derivation (no anchors -> venue/out/unknown).
    const concl = derivePlace({coords, geocode, prefs: {enabled: false}})
    return {place: concl.place, placeRef: concl.placeRef}
  } catch {
    return undefined
  }
}
