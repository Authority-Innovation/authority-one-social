// PKCE S256 + state + nonce for the Janus authorize leg, and the callback check.
// PURE apart from the injected crypto port (randomness + SHA-256), so every
// rule here is unit-tested without a device.
import {type AOSignatureConfig} from './config'

export interface AOCryptoPort {
  randomBytes(n: number): Uint8Array
  sha256(input: string): Promise<Uint8Array>
}

/** One sign-in attempt. Never persisted on native (held in memory for the
 *  length of the in-app browser session); on web it rides sessionStorage for
 *  the redirect round trip only (see browser.web.ts). */
export interface AOFlow {
  verifier: string
  challenge: string
  state: string
  nonce: string
  redirectUri: string
  clientId: string
  createdAt: number
}

export function base64url(bytes: Uint8Array): string {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    out += abc[(n >> 18) & 63] + abc[(n >> 12) & 63]
    out += abc[(n >> 6) & 63] + abc[n & 63]
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = bytes[i] << 16
    out += abc[(n >> 18) & 63] + abc[(n >> 12) & 63]
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8)
    out += abc[(n >> 18) & 63] + abc[(n >> 12) & 63] + abc[(n >> 6) & 63]
  }
  return out
}

/** RFC 7636 §4.1: 43–128 chars of [A-Za-z0-9-._~] (the runtime checks the same). */
export const PKCE_VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/
/** The runtime bounce's random part: base64url, 1–128 chars. */
const STATE_RANDOM_RE = /^[A-Za-z0-9_-]{1,128}$/

/**
 * The state the runtime bounce recognises: `as.<scheme>.<random>` on native
 * (janus-bounce.js markedScheme — exactly three dot parts, allow-listed
 * scheme). Web has no bounce, so its state is the bare random part.
 */
export function mintState(
  cfg: Pick<AOSignatureConfig, 'scheme'>,
  random: string,
): string {
  if (!STATE_RANDOM_RE.test(random)) throw new Error('bad state random')
  return cfg.scheme ? `as.${cfg.scheme}.${random}` : random
}

export async function createFlow(
  cfg: AOSignatureConfig,
  crypto: AOCryptoPort,
  now: number = Date.now(),
): Promise<AOFlow> {
  const verifier = base64url(crypto.randomBytes(32)) // 43 chars
  const challenge = base64url(await crypto.sha256(verifier))
  return {
    verifier,
    challenge,
    state: mintState(cfg, base64url(crypto.randomBytes(24))),
    nonce: base64url(crypto.randomBytes(24)),
    redirectUri: cfg.redirectUri,
    clientId: cfg.clientId,
    createdAt: now,
  }
}

export function buildAuthorizeUrl(
  cfg: AOSignatureConfig,
  flow: AOFlow,
): string {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: flow.clientId,
    redirect_uri: flow.redirectUri,
    scope: cfg.scopes,
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: flow.challenge,
    code_challenge_method: 'S256',
  })
  if (cfg.audience) q.set('audience', cfg.audience)
  return `${cfg.authorizeUrl}?${q.toString()}`
}

export type AOCallback =
  | {ok: true; code: string; callbackState: string}
  | {
      ok: false
      reason: 'cancelled' | 'janus-error' | 'state-mismatch' | 'bad-callback'
      detail?: string
    }

/** A flow older than this is refused before any network call (Janus codes
 *  are short-lived; the web pending record is wiped past it too). */
export const FLOW_MAX_AGE_MS = 10 * 60 * 1000

/**
 * Check what came back from Janus (via the bounce on native, directly on web).
 * Exactly one `state`, byte-equal to the one this attempt minted; an `error=`
 * (a cancel at Google, a consent refusal) is reported as such; no code ⇒ refused.
 */
export function checkCallback(
  url: string,
  flow: AOFlow,
  now: number = Date.now(),
): AOCallback {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return {ok: false, reason: 'bad-callback'}
  }
  const states = u.searchParams.getAll('state')
  if (states.length !== 1 || states[0] !== flow.state) {
    return {ok: false, reason: 'state-mismatch'}
  }
  if (now - flow.createdAt > FLOW_MAX_AGE_MS) {
    return {ok: false, reason: 'bad-callback', detail: 'expired'}
  }
  const err = u.searchParams.get('error')
  if (err) {
    return {
      ok: false,
      reason: err === 'access_denied' ? 'cancelled' : 'janus-error',
      detail: err,
    }
  }
  const codes = u.searchParams.getAll('code')
  if (codes.length !== 1 || !codes[0])
    return {ok: false, reason: 'bad-callback'}
  return {ok: true, code: codes[0], callbackState: states[0]}
}

/** The runtime's server-side exchange body (janus-ao.js exchangeGrant). */
export interface AOGrant {
  code: string
  code_verifier: string
  code_challenge_method: 'S256'
  redirect_uri: string
  state: string
  callback_state: string
  client_id: string
}

export function grantFor(
  flow: AOFlow,
  cb: {code: string; callbackState: string},
): AOGrant {
  return {
    code: cb.code,
    code_verifier: flow.verifier,
    code_challenge_method: 'S256',
    redirect_uri: flow.redirectUri,
    state: flow.state,
    callback_state: cb.callbackState,
    client_id: flow.clientId,
  }
}
