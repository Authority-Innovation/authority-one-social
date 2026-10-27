// The sign-in and link ceremonies, platform-neutral. Native runs the authorize
// leg in an in-app browser session and redeems in one go; web leaves the page
// for Janus and finishes on return (completeAfterRedirect).
//
// WHY THE RUNTIME EXCHANGES THE CODE (grant mode, every platform): the runtime
// already re-verifies everything (JWKS, ES256 pin, iss, aud, azp, exp, nonce
// against the SIGNED id_token, same subject, same client) and asks Janus whether
// the session is live. Exchanging on the server means:
//   · no Janus access/refresh/id token ever lands on the device or in a browser;
//   · no JWKS/ES256 verifier has to be shipped in JS (Hermes has no WebCrypto);
//   · Expo web needs no CORS from Janus's token endpoint;
//   · one code path for iOS, Android and web.
// The PKCE verifier still never leaves the app until the redeem, the state is
// checked here byte for byte, and the nonce binds the ID token on the server.
import {type AOClient, type AOLinkCode, type AOLinkProof} from './client'
import {type AOSignatureConfig} from './config'
import {AOSignatureError} from './errors'
import {
  type AOCryptoPort,
  type AOFlow,
  buildAuthorizeUrl,
  checkCallback,
  createFlow,
  grantFor,
} from './pkce'
import {type AORedeemResult} from './wire'

/** The social app's own PDS session, as the link ceremony needs it. */
export interface AOPdsPort {
  current(): {did: string; accessJwt: string} | null
  /** Refresh the PDS session (atproto refreshSession) and return the new one. */
  refresh(): Promise<{did: string; accessJwt: string} | null>
}

export type AOBrowserResult = {type: 'success'; url: string} | {type: 'cancel'}

export interface AONativeBrowserPort {
  authorize(url: string, callbackUrl: string): Promise<AOBrowserResult>
}

export interface AOSignInDeps {
  cfg: AOSignatureConfig
  client: AOClient
  crypto: AOCryptoPort
  now?: () => number
}

/** Link code TTL is 10 min server-side; refuse to start one with a PDS token
 *  that would die first (Studio: refresh when < 15 min remain). */
export const LINK_PDS_MIN_REMAINING_MS = 15 * 60 * 1000

function jwtExpMs(jwt: string): number | null {
  try {
    const part = jwt.split('.')[1]
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const json = globalThis.atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
    const exp = (JSON.parse(json) as {exp?: unknown}).exp
    return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null
  } catch {
    return null
  }
}

export interface AOLinkPrep extends AOLinkCode {
  pdsAccessJwt: string
}

/**
 * LINK STEP 1 (runbook "Linking an existing owner"): from inside the signed-in
 * app, mint the one-time code with the CURRENT PDS session — refreshed first if
 * it would not outlive the code. The same token is kept for step 3.
 */
export async function prepareLink(
  deps: AOSignInDeps,
  pds: AOPdsPort,
): Promise<AOLinkPrep> {
  const now = deps.now ?? Date.now
  let session = pds.current()
  if (!session) throw new AOSignatureError('needs-pds-session')
  const exp = jwtExpMs(session.accessJwt)
  if (exp === null || exp - now() < LINK_PDS_MIN_REMAINING_MS) {
    session = await pds.refresh().catch(() => null)
    if (!session) throw new AOSignatureError('needs-pds-session')
  }
  const code = await deps.client.linkCode(session.accessJwt)
  if (code.did !== session.did) throw new AOSignatureError('link-mismatch')
  return {...code, pdsAccessJwt: session.accessJwt}
}

/** LINK STEP 3 guard, before the redeem: the code is still alive and the app
 *  is still signed in to the account that minted it. */
export function linkProofFor(
  prep: AOLinkPrep,
  pds: AOPdsPort,
  now: number,
): AOLinkProof {
  if (Date.parse(prep.expiresAt) <= now) {
    throw new AOSignatureError('link-code-unusable')
  }
  const current = pds.current()
  if (!current || current.did !== prep.did) {
    throw new AOSignatureError('link-mismatch')
  }
  return {
    pdsAccessJwt: prep.pdsAccessJwt,
    linkCode: prep.linkCode,
    did: prep.did,
  }
}

function callbackError(reason: string): AOSignatureError {
  return new AOSignatureError(reason === 'cancelled' ? 'cancelled' : 'janus')
}

/** Check the callback and redeem. Shared by native and web. */
export async function redeemCallback(
  deps: AOSignInDeps,
  flow: AOFlow,
  callbackUrl: string,
  link: {prep: AOLinkPrep; pds: AOPdsPort} | null,
): Promise<AORedeemResult> {
  const now = deps.now ?? Date.now
  const cb = checkCallback(callbackUrl, flow, now())
  if (!cb.ok) throw callbackError(cb.reason)
  const proof = link ? linkProofFor(link.prep, link.pds, now()) : null
  return deps.client.redeem(grantFor(flow, cb), flow.nonce, proof)
}

/**
 * NATIVE sign-in (or link, when `link` is given — prepareLink must have run).
 * The in-app browser session is non-ephemeral, so an existing Google session
 * at Janus is one tap.
 */
export async function signInNative(
  deps: AOSignInDeps,
  browser: AONativeBrowserPort,
  link: {prep: AOLinkPrep; pds: AOPdsPort} | null = null,
): Promise<AORedeemResult> {
  const {cfg} = deps
  if (!cfg.callbackUrl) throw new AOSignatureError('not-configured')
  const flow = await createFlow(cfg, deps.crypto, (deps.now ?? Date.now)())
  let res: AOBrowserResult
  try {
    res = await browser.authorize(buildAuthorizeUrl(cfg, flow), cfg.callbackUrl)
  } catch {
    throw new AOSignatureError('janus')
  }
  if (res.type !== 'success') throw new AOSignatureError('cancelled')
  return redeemCallback(deps, flow, res.url, link)
}
