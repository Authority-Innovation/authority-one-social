// ─────────────────────────────────────────────────────────────────────────────
// "Sign in with Authority Signature" (P2b) — build-time configuration.
//
// DARK BY DEFAULT. Every value below is a PUBLIC identifier (issuer, client id,
// URLs, scheme) read from EXPO_PUBLIC_AO_SIGNATURE_* at build time; none is a
// secret. When any required value for the CURRENT platform is missing or
// malformed, `AO_SIGNATURE_CONFIG` is null and:
//   · no Signature button, picker, shell or account section renders;
//   · nothing calls Janus or the runtime's /auth/* routes;
//   · the native modules this lane uses (expo-crypto, expo-secure-store) are
//     never required, so an over-the-air JS update can never touch them on a
//     binary that lacks them;
//   · the agent-runtime bearer stays the PDS accessJwt, byte for byte.
//
// Required to arm (per platform):
//   EXPO_PUBLIC_AO_SIGNATURE_ISSUER          Janus issuer, EXACT (https)
//   EXPO_PUBLIC_AO_SIGNATURE_RUNTIME_URL     the runtime that redeems; must be the
//                                            SAME origin as the agent runtime the
//                                            app already talks to (the aos1 bearer
//                                            is only ever sent there)
//   iOS:     EXPO_PUBLIC_AO_SIGNATURE_CLIENT_ID_IOS
//   Android: EXPO_PUBLIC_AO_SIGNATURE_CLIENT_ID_ANDROID
//   native:  EXPO_PUBLIC_AO_SIGNATURE_SCHEME       authorityone | authorityone-dev
//            EXPO_PUBLIC_AO_SIGNATURE_APP_REDIRECT_URI   the runtime bounce (https)
//   web:     EXPO_PUBLIC_AO_SIGNATURE_CLIENT_ID_WEB
//            EXPO_PUBLIC_AO_SIGNATURE_WEB_REDIRECT_URI   this web app's callback (https)
// Optional:
//   EXPO_PUBLIC_AO_SIGNATURE_AUTHORIZE_BASE  branded authorize host (default: issuer)
//   EXPO_PUBLIC_AO_SIGNATURE_AUDIENCE        sent as `audience=` on authorize
// ─────────────────────────────────────────────────────────────────────────────
import {Platform} from 'react-native'

import {AGENT_RUNTIME_BASE_URL} from '#/lib/agent-runtime/config'

/** The bounce allow-list on the runtime (src/janus-bounce.js) for this app. */
export const AO_SIGNATURE_SCHEMES = [
  'authorityone',
  'authorityone-dev',
] as const
export type AOSignatureScheme = (typeof AO_SIGNATURE_SCHEMES)[number]

export type AOSignaturePlatform = 'ios' | 'android' | 'web'

export interface AOSignatureConfig {
  platform: AOSignaturePlatform
  issuer: string
  /** `{authorizeBase}/oauth/authorize` — Janus's branded host, else the issuer. */
  authorizeUrl: string
  clientId: string
  runtimeUrl: string
  /** The exact https redirect Janus allow-lists (and the runtime's
   *  JANUS_AO_REDIRECT_URIS must contain): the bounce on native, the web
   *  app's own callback on web. */
  redirectUri: string
  /** Native only: the custom scheme the runtime bounces to. */
  scheme: AOSignatureScheme | null
  /** Native only: what the in-app browser session waits for. */
  callbackUrl: string | null
  audience: string | null
  scopes: string
}

/** Raw env, read with STATIC member access so Expo inlines each value. */
export interface AOSignatureEnv {
  issuer?: string
  authorizeBase?: string
  runtimeUrl?: string
  clientIdIos?: string
  clientIdAndroid?: string
  clientIdWeb?: string
  scheme?: string
  appRedirectUri?: string
  webRedirectUri?: string
  audience?: string
}

export function readAOSignatureEnv(): AOSignatureEnv {
  return {
    issuer: process.env.EXPO_PUBLIC_AO_SIGNATURE_ISSUER,
    authorizeBase: process.env.EXPO_PUBLIC_AO_SIGNATURE_AUTHORIZE_BASE,
    runtimeUrl: process.env.EXPO_PUBLIC_AO_SIGNATURE_RUNTIME_URL,
    clientIdIos: process.env.EXPO_PUBLIC_AO_SIGNATURE_CLIENT_ID_IOS,
    clientIdAndroid: process.env.EXPO_PUBLIC_AO_SIGNATURE_CLIENT_ID_ANDROID,
    clientIdWeb: process.env.EXPO_PUBLIC_AO_SIGNATURE_CLIENT_ID_WEB,
    scheme: process.env.EXPO_PUBLIC_AO_SIGNATURE_SCHEME,
    appRedirectUri: process.env.EXPO_PUBLIC_AO_SIGNATURE_APP_REDIRECT_URI,
    webRedirectUri: process.env.EXPO_PUBLIC_AO_SIGNATURE_WEB_REDIRECT_URI,
    audience: process.env.EXPO_PUBLIC_AO_SIGNATURE_AUDIENCE,
  }
}

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** An absolute https URL with no query/fragment, or null. Trailing slashes are
 *  kept verbatim: the issuer and redirect comparisons are EXACT strings. */
function httpsUrl(raw: string): string | null {
  if (!raw) return null
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' || !u.host) return null
  if (u.search || u.hash || raw.includes('?') || raw.includes('#')) return null
  return raw
}

function originOf(raw: string): string | null {
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}

/**
 * The armed config for `platform`, or null (dark). PURE + tested. Fail-closed:
 * anything partial, non-https or off-allow-list ⇒ null, never a half-armed lane.
 * `agentRuntimeUrl` is the runtime the existing /app/* clients call — the AO
 * bearer replaces their token, so it must name the same origin.
 */
export function parseAOSignatureConfig(
  env: AOSignatureEnv,
  platform: string,
  agentRuntimeUrl: string,
): AOSignatureConfig | null {
  if (platform !== 'ios' && platform !== 'android' && platform !== 'web') {
    return null
  }
  const issuer = httpsUrl(clean(env.issuer))
  const runtimeRaw = httpsUrl(clean(env.runtimeUrl).replace(/\/+$/, ''))
  if (!issuer || !runtimeRaw) return null
  const runtimeOrigin = originOf(runtimeRaw)
  if (!runtimeOrigin || runtimeOrigin !== originOf(agentRuntimeUrl)) return null
  const authorizeBase = clean(env.authorizeBase)
    ? httpsUrl(clean(env.authorizeBase))
    : issuer
  if (!authorizeBase) return null
  const audience = clean(env.audience) || null

  const clientId = clean(
    platform === 'ios'
      ? env.clientIdIos
      : platform === 'android'
        ? env.clientIdAndroid
        : env.clientIdWeb,
  )
  if (!clientId || /\s|,/.test(clientId)) return null

  let redirectUri: string | null
  let scheme: AOSignatureScheme | null = null
  let callbackUrl: string | null = null
  if (platform === 'web') {
    redirectUri = httpsUrl(clean(env.webRedirectUri))
  } else {
    redirectUri = httpsUrl(clean(env.appRedirectUri))
    const s = clean(env.scheme)
    if (!(AO_SIGNATURE_SCHEMES as readonly string[]).includes(s)) return null
    scheme = s as AOSignatureScheme
    // The runtime bounce keeps the PATH of the https callback it received and
    // swaps the origin for the scheme (janus-bounce.js bounceTarget).
    const path = redirectUri ? new URL(redirectUri).pathname : ''
    if (
      path !== '/auth/janus/app-callback' &&
      path !== '/auth/janus/android-callback'
    ) {
      return null
    }
    callbackUrl = `${scheme}://auth/janus/app-callback`
  }
  if (!redirectUri) return null

  return {
    platform,
    issuer,
    authorizeUrl: `${authorizeBase.replace(/\/+$/, '')}/oauth/authorize`,
    clientId,
    runtimeUrl: runtimeRaw,
    redirectUri,
    scheme,
    callbackUrl,
    audience,
    scopes: 'openid email profile',
  }
}

/** THE switch. Null ⇒ the whole lane is dark (the default). */
export const AO_SIGNATURE_CONFIG: AOSignatureConfig | null =
  parseAOSignatureConfig(
    readAOSignatureEnv(),
    Platform.OS,
    AGENT_RUNTIME_BASE_URL,
  )

export function isAOSignatureArmed(): boolean {
  return AO_SIGNATURE_CONFIG !== null
}
