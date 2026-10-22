// Wiring: the armed config + real fetch/crypto/browser ports → the actions the
// screens call. Nothing here runs while the lane is dark (every entry point
// checks AO_SIGNATURE_CONFIG first).
import {Platform} from 'react-native'

import {
  captureAOSignatureWebCallback,
  getNativeBrowser,
  startWebRedirect,
  takeWebCallback,
} from './browser'
import {type AOClient, createAOClient} from './client'
import {AO_SIGNATURE_CONFIG} from './config'
import {getCryptoPort} from './cryptoPort'
import {AOSignatureError} from './errors'
import {buildAuthorizeUrl, createFlow} from './pkce'
import {onPdsLogout, recordFromRedeem} from './session'
import {
  type AOPdsPort,
  type AOSignInDeps,
  prepareLink,
  redeemCallback,
  signInNative,
} from './signIn'
import {getAOState, setAORecord} from './store'

export {captureAOSignatureWebCallback}

let client: AOClient | null = null

/** The runtime client, or null while dark. */
export function aoClient(): AOClient | null {
  const cfg = AO_SIGNATURE_CONFIG
  if (!cfg) return null
  if (!client) {
    client = createAOClient(cfg.runtimeUrl, (url, init) => fetch(url, init))
  }
  return client
}

function deps(): AOSignInDeps {
  const cfg = AO_SIGNATURE_CONFIG
  const c = aoClient()
  if (!cfg || !c) throw new AOSignatureError('not-configured')
  return {cfg, client: c, crypto: getCryptoPort()}
}

/**
 * "Sign in with Authority Signature" (or, with `pds`, "Link Authority
 * Signature" for the PDS account signed in now). Native resolves when the
 * session is stored; web navigates away and resolves never — the page that
 * comes back finishes in completeWebSignIn.
 */
export async function startAOSignature(
  pds: AOPdsPort | null = null,
): Promise<void> {
  const d = deps()
  const prep = pds ? await prepareLink(d, pds) : null
  if (Platform.OS === 'web') {
    const flow = await createFlow(d.cfg, d.crypto)
    startWebRedirect(buildAuthorizeUrl(d.cfg, flow), {flow, link: prep})
    return new Promise<void>(() => {})
  }
  const result = await signInNative(
    d,
    getNativeBrowser(),
    prep && pds ? {prep, pds} : null,
  )
  await setAORecord(recordFromRedeem(result))
}

/** Web: finish a sign-in/link that Janus just returned from. Null when this
 *  page load was not a Signature callback. */
export async function completeWebSignIn(
  pds: AOPdsPort | null,
): Promise<boolean> {
  if (Platform.OS !== 'web' || !AO_SIGNATURE_CONFIG) return false
  const cb = takeWebCallback()
  if (!cb) return false
  const d = deps()
  const link = cb.pending.link
  if (link && !pds) throw new AOSignatureError('link-mismatch')
  const result = await redeemCallback(
    d,
    cb.pending.flow,
    cb.url,
    link && pds ? {prep: link, pds} : null,
  )
  await setAORecord(recordFromRedeem(result))
  return true
}

/**
 * The social app's PDS session signed out (`did`, or null for every account).
 * Called from the session provider; a no-op while dark or with no AO session.
 */
export function aoSignatureOnPdsLogout(did: string | null): void {
  const c = aoClient()
  if (!c || !getAOState().record) return
  void onPdsLogout(c, did)
}
