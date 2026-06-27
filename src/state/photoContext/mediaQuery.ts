import {type ContextPlace} from '#/lib/contextEngine/types'
import {type PhotoMeta} from '#/lib/photoContext/types'

/**
 * Photo Context media access — WEB / non-native stub. The photo library is native-only;
 * the real implementation (expo-media-library metadata query + reverse-geocode) lives in
 * `mediaQuery.native.ts`. Everything here reports unsupported / empty.
 */

export type PhotoPermission = 'granted' | 'limited' | 'denied' | 'unavailable'

export function photoMediaSupported(): boolean {
  return false
}

export function getPhotoPermission(): Promise<PhotoPermission> {
  return Promise.resolve('unavailable')
}

export function requestPhotoPermission(): Promise<PhotoPermission> {
  return Promise.resolve('unavailable')
}

export function queryTodaysPhotoMeta(): Promise<PhotoMeta[]> {
  return Promise.resolve([])
}

export function resolvePlace(_coords: {
  lat: number
  lng: number
}): Promise<{place: ContextPlace; placeRef?: string} | undefined> {
  return Promise.resolve(undefined)
}
