// JS side of the local expo-ao-auth-session module (iOS only): the Signature
// authorize leg in ASWebAuthenticationSession with a CLAIMED https callback.
// See ios/ExpoAOAuthSessionModule.swift and README.md.
//
// Loaded lazily by src/features/aoSignature/browser.ts only once an https
// sign-in starts, so a dark build (or an OTA update onto a binary without the
// module) never touches the native side.
import {requireOptionalNativeModule} from 'expo-modules-core'

export type AOAuthSessionResult =
  | {type: 'success'; url: string}
  | {type: 'cancel'}

export interface AOAuthSessionNative {
  isSupported(): boolean
  authorizeHttps(
    url: string,
    host: string,
    path: string,
  ): Promise<{type?: unknown; url?: unknown}>
}

/** Why an https sign-in could not even start (mapped to a user error). */
export class AOAuthSessionUnavailable extends Error {
  constructor(public reason: 'no-module' | 'unsupported-os' | 'bad-callback') {
    super(`ao auth session unavailable: ${reason}`)
    this.name = 'AOAuthSessionUnavailable'
  }
}

/**
 * The exact host + path the OS session must match, from the configured
 * callback URL. Only a plain https URL on the default port, without
 * credentials, query or fragment, qualifies. PURE.
 */
export function httpsCallbackTarget(
  callbackUrl: string,
): {host: string; path: string} | null {
  let u: URL
  try {
    u = new URL(callbackUrl)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' || !u.hostname) return null
  if (u.port || u.username || u.password || u.search || u.hash) return null
  if (callbackUrl.includes('?') || callbackUrl.includes('#')) return null
  if (!u.pathname.startsWith('/') || u.pathname === '/') return null
  return {host: u.hostname, path: u.pathname}
}

let cached: AOAuthSessionNative | null | undefined

function loadNative(): AOAuthSessionNative | null {
  if (cached === undefined) {
    cached =
      requireOptionalNativeModule<AOAuthSessionNative>('ExpoAOAuthSession')
  }
  return cached
}

/**
 * Run the authorize leg and resolve with the callback URL (success) or a
 * cancel. Throws AOAuthSessionUnavailable when it cannot start here; any
 * native failure rejects (the caller maps both to a sign-in error).
 * `native` is a test seam.
 */
export async function authorizeWithHttpsCallback(
  url: string,
  callbackUrl: string,
  native: AOAuthSessionNative | null = loadNative(),
): Promise<AOAuthSessionResult> {
  const target = httpsCallbackTarget(callbackUrl)
  if (!target) throw new AOAuthSessionUnavailable('bad-callback')
  if (!native) throw new AOAuthSessionUnavailable('no-module')
  if (!native.isSupported()) {
    throw new AOAuthSessionUnavailable('unsupported-os')
  }
  const res = await native.authorizeHttps(url, target.host, target.path)
  return res.type === 'success' && typeof res.url === 'string'
    ? {type: 'success', url: res.url}
    : {type: 'cancel'}
}

/** Test seam. */
export function _resetAOAuthSessionForTests(): void {
  cached = undefined
}
