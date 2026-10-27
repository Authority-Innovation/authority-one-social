// "Sign in with Authority Signature" for the social app (P2b) — DARK unless
// EXPO_PUBLIC_AO_SIGNATURE_* arms it (see ./config.ts). With the lane dark the
// lifecycle component renders null and nothing else: no effect, no store read,
// no network call.
import {useEffect} from 'react'
import {AppState} from 'react-native'

import {AO_SIGNATURE_CONFIG} from './config'
import {bootAOLifecycle, onAOAppStateChange} from './lifecycle'

export {AOSignatureAccountSection} from './components/AccountSection'
export {AOSignatureShell} from './components/Shell'
export {AOSignatureSignInButton} from './components/SignInButton'
export {captureAOSignatureWebCallback} from './controller'
export {aoSignatureOnPdsLogout} from './controller'
export {useAOSignatureGate} from './hooks'

function ArmedLifecycle() {
  useEffect(() => {
    // Idempotent: StrictMode's double effect joins the same single boot.
    void bootAOLifecycle()
    const sub = AppState.addEventListener('change', onAOAppStateChange)
    return () => sub.remove()
  }, [])
  return null
}

/** Mounted once beside the app Shell (under the session provider). Renders
 *  nothing; while dark it is literally `null` — no hooks, no effects. */
export function AOSignatureLifecycle() {
  if (AO_SIGNATURE_CONFIG === null) return null
  return <ArmedLifecycle />
}
