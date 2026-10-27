// Native persistence for the AO session: expo-secure-store (iOS Keychain /
// Android Keystore-backed), DEVICE-ONLY — `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`
// keeps the record out of iCloud Keychain and encrypted backups, so a restored
// phone starts signed out of Signature (the Studio rule). The module is
// required LAZILY: nothing here runs while the lane is dark.
import type * as SecureStoreModule from 'expo-secure-store'

type SecureStore = typeof SecureStoreModule

const KEY = 'ao-signature-session-v1'

function secureStore(): SecureStore {
  // Lazy native module: never loaded while the lane is dark.
  return require('expo-secure-store') as SecureStore
}

function options(s: SecureStore) {
  return {keychainAccessible: s.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY}
}

export const AO_STORAGE_PERSISTS = true

export async function readStoredSession(): Promise<string | null> {
  const s = secureStore()
  return s.getItemAsync(KEY, options(s))
}

export async function writeStoredSession(value: string): Promise<void> {
  const s = secureStore()
  await s.setItemAsync(KEY, value, options(s))
}

export async function clearStoredSession(): Promise<void> {
  const s = secureStore()
  await s.deleteItemAsync(KEY, options(s))
}
