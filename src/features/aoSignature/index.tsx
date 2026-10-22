// "Sign in with Authority Signature" for the social app (P2b) — DARK unless
// EXPO_PUBLIC_AO_SIGNATURE_* arms it (see ./config.ts). With the lane dark the
// lifecycle component renders null and nothing else: no effect, no store read,
// no network call.
import {useEffect, useRef} from 'react'
import {AppState} from 'react-native'

import {AO_SIGNATURE_CONFIG} from './config'
import {aoClient, completeWebSignIn} from './controller'
import {AOSignatureError, aoSignatureErrorWords} from './errors'
import {persistedPdsPort} from './hooks'
import {
  REFRESH_BACKOFF_MS,
  refreshAOSession,
  refreshDecision,
  syncAOSession,
} from './session'
import {singleFlight} from './singleFlight'
import {
  getAOState,
  loadAOSession,
  patchAORecordIf,
  sessionRef,
  setAORecord,
} from './store'

export {AOSignatureAccountSection} from './components/AccountSection'
export {AOSignatureShell} from './components/Shell'
export {AOSignatureSignInButton} from './components/SignInButton'
export {captureAOSignatureWebCallback} from './controller'
export {aoSignatureOnPdsLogout} from './controller'
export {useAOSignatureGate} from './hooks'

/** Re-read the session from the runtime at most this often on foreground. */
const SYNC_EVERY_MS = 10 * 60 * 1000

function ArmedLifecycle() {
  const backoffUntil = useRef(0)
  const lastSync = useRef(0)

  useEffect(() => {
    let cancelled = false
    const tickOnce = singleFlight(async () => {
      const client = aoClient()
      if (!client || cancelled) return
      const now = Date.now()
      const record = getAOState().record
      const d = refreshDecision(record, now, backoffUntil.current)
      if (d === 'reverify' && record) {
        await patchAORecordIf(sessionRef(record), {reverify: true})
      } else if (d === 'refresh') {
        const out = await refreshAOSession(client, now)
        if (out === 'backoff') backoffUntil.current = now + REFRESH_BACKOFF_MS
      }
      if (getAOState().record && now - lastSync.current >= SYNC_EVERY_MS) {
        lastSync.current = now
        await syncAOSession(client)
      }
    })
    const boot = async () => {
      await loadAOSession()
      try {
        await completeWebSignIn(persistedPdsPort)
      } catch (e) {
        // A one-shot notice the sign-in button / shell shows.
        await setAORecord(
          getAOState().record,
          aoSignatureErrorWords(
            e instanceof AOSignatureError ? e : new AOSignatureError('janus'),
          ),
        )
      }
      await tickOnce()
    }
    // ONE flight at a time: the boot run and any AppState `active` tick that
    // fires during it share a single refresh/sync, never two in parallel.
    let booted = false
    // `finally`: a boot that failed still lets later foreground ticks run.
    void boot()
      .catch(() => {})
      .finally(() => {
        booted = true
      })
    const sub = AppState.addEventListener('change', next => {
      if (next !== 'active') return
      // During boot, the boot's own tick covers it.
      if (booted) void tickOnce()
    })
    return () => {
      cancelled = true
      sub.remove()
    }
  }, [])

  return null
}

/** Mounted once beside the app Shell (under the session provider). Renders
 *  nothing; while dark it is literally `null` — no hooks, no effects. */
export function AOSignatureLifecycle() {
  if (AO_SIGNATURE_CONFIG === null) return null
  return <ArmedLifecycle />
}
