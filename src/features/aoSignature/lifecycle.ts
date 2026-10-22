// The armed lifecycle, outside React: ONE boot per app run (idempotent —
// StrictMode's double effect, a remount, or a second caller all get the same
// promise, so the device store is read and a web callback redeemed once) and
// a single-flight refresh/sync tick on foreground, only after boot settled.
import {logger} from '#/logger'
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

/** Re-read the session from the runtime at most this often on foreground. */
const SYNC_EVERY_MS = 10 * 60 * 1000

let backoffUntil = 0
let lastSync = 0
let booted = false
let bootPromise: Promise<void> | null = null

/** What may be logged about a failure: its kind/status/code, never a token. */
function safe(e: unknown): string {
  if (e instanceof AOSignatureError) return e.message // `kind:status:code`
  return e instanceof Error ? e.name : typeof e
}

const tick = singleFlight(async () => {
  const client = aoClient()
  if (!client) return
  const now = Date.now()
  const record = getAOState().record
  const d = refreshDecision(record, now, backoffUntil)
  if (d === 'reverify' && record) {
    await patchAORecordIf(sessionRef(record), {reverify: true})
  } else if (d === 'refresh') {
    const out = await refreshAOSession(client, now)
    if (out === 'backoff') backoffUntil = now + REFRESH_BACKOFF_MS
  }
  if (getAOState().record && now - lastSync >= SYNC_EVERY_MS) {
    lastSync = now
    await syncAOSession(client)
  }
})

async function boot(): Promise<void> {
  await loadAOSession()
  try {
    await completeWebSignIn(persistedPdsPort)
  } catch (e) {
    logger.warn('aoSignature: web sign-in did not complete', {
      safeMessage: safe(e),
    })
    // A one-shot notice the sign-in button / shell shows.
    await setAORecord(
      getAOState().record,
      aoSignatureErrorWords(
        e instanceof AOSignatureError ? e : new AOSignatureError('janus'),
      ),
    )
  }
  await tick()
}

/** Start (or join) the one boot. Never rejects; a failure is logged, and
 *  foreground ticks still run afterwards. */
export function bootAOLifecycle(): Promise<void> {
  if (!bootPromise) {
    bootPromise = boot()
      .catch(e => {
        logger.warn('aoSignature: boot failed', {safeMessage: safe(e)})
      })
      .finally(() => {
        booted = true
      })
  }
  return bootPromise
}

/** AppState listener: a foreground ticks once boot has settled (during boot,
 *  the boot's own tick covers it). Overlapping ticks share one flight. */
export function onAOAppStateChange(next: string): void {
  if (next !== 'active' || !booted) return
  void tick().catch(e => {
    logger.warn('aoSignature: refresh tick failed', {safeMessage: safe(e)})
  })
}

/** Test seam. */
export function _resetAOLifecycleForTests(): void {
  backoffUntil = 0
  lastSync = 0
  booted = false
  bootPromise = null
}
