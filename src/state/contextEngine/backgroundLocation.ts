/**
 * Phase 1.5 background-location controller — WEB / non-native stub. Background place
 * context is native-only; on web everything reports unsupported / no-ops. The real
 * implementation (expo-location background updates + the TaskManager visit task) lives
 * in `backgroundLocation.native.ts`.
 */

export const BACKGROUND_LOCATION_TASK = 'authority-one-context-background-location'

export function backgroundLocationSupported(): boolean {
  return false
}

export function getBackgroundPermissionGranted(): Promise<boolean> {
  return Promise.resolve(false)
}

export function requestBackgroundPermission(): Promise<boolean> {
  return Promise.resolve(false)
}

export function startBackgroundUpdates(): Promise<boolean> {
  return Promise.resolve(false)
}

export function stopBackgroundUpdates(): Promise<void> {
  return Promise.resolve()
}

export function isBackgroundUpdatesRunning(): Promise<boolean> {
  return Promise.resolve(false)
}
