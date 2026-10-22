// The AO session on this device: one record, held in memory for synchronous
// reads (the agent-runtime bearer provider is synchronous at heart), mirrored to
// the platform store (device-only secure store on native, nothing on web).
//
// DARK: with the lane unarmed nothing here is ever loaded or written, and
// `aoRuntimeBearer` always answers null — the PDS bearer path is untouched.
import {type MessageDescriptor} from '@lingui/core'

import {AO_SIGNATURE_CONFIG, isAOSignatureArmed} from './config'
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from './storage'
import {aoSessionClaims, isAOSessionToken} from './wire'

export interface AORecord {
  v: 1
  token: string
  sid: string
  did: string
  handle: string | null
  expiresAt: string
  primary: string | null
  needsAgent: boolean
  /** When this device last minted/refreshed the token (ms). */
  refreshedAt: number
  /** The runtime said `janus-reverify`: the token works until its exp, but it
   *  can no longer slide without a fresh Signature sign-in. */
  reverify: boolean
}

export interface AOState {
  /** The platform store has been read (always true on web / when dark). */
  loaded: boolean
  record: AORecord | null
  /** A one-shot message for the person ("your session ended"). */
  notice: MessageDescriptor | null
}

let state: AOState = {loaded: !isAOSignatureArmed(), record: null, notice: null}
const listeners = new Set<() => void>()

export function getAOState(): AOState {
  return state
}

export function subscribeAO(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function emit(next: Partial<AOState>) {
  state = {...state, ...next}
  for (const fn of listeners) fn()
}

/** Strict decode of a stored record; anything off-shape, expired, or whose
 *  signed payload names another DID/sid is dropped (signed out). PURE. */
export function decodeRecord(
  raw: string | null,
  now: number = Date.now(),
): AORecord | null {
  if (!raw) return null
  let r: Record<string, unknown>
  try {
    r = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
  if (!r || r.v !== 1 || !isAOSessionToken(r.token)) return null
  if (typeof r.did !== 'string' || !r.did.startsWith('did:')) return null
  if (typeof r.sid !== 'string' || typeof r.expiresAt !== 'string') return null
  const exp = Date.parse(r.expiresAt)
  if (!Number.isFinite(exp) || exp <= now) return null
  const c = aoSessionClaims(r.token)
  if (c.did !== r.did || c.sid !== r.sid) return null
  return {
    v: 1,
    token: r.token,
    sid: r.sid,
    did: r.did,
    handle: typeof r.handle === 'string' ? r.handle : null,
    expiresAt: r.expiresAt,
    primary: typeof r.primary === 'string' && r.primary ? r.primary : null,
    needsAgent:
      r.needsAgent === true || !(typeof r.primary === 'string' && r.primary),
    refreshedAt: typeof r.refreshedAt === 'number' ? r.refreshedAt : 0,
    reverify: r.reverify === true,
  }
}

/** Read the platform store once at boot. No-op while dark. */
export async function loadAOSession(now: number = Date.now()): Promise<void> {
  if (!isAOSignatureArmed() || state.loaded) return
  let record: AORecord | null = null
  try {
    record = decodeRecord(await readStoredSession(), now)
  } catch {
    record = null
  }
  if (!record) await clearStoredSession().catch(() => {})
  emit({loaded: true, record})
}

export async function setAORecord(
  record: AORecord | null,
  notice: MessageDescriptor | null = null,
): Promise<void> {
  if (!isAOSignatureArmed()) return
  emit({record, notice, loaded: true})
  try {
    if (record) await writeStoredSession(JSON.stringify(record))
    else await clearStoredSession()
  } catch {
    // The in-memory session still serves this launch; the next launch starts
    // signed out of Signature (fail toward signed-out, never toward a stale copy).
  }
}

export async function patchAORecord(patch: Partial<AORecord>): Promise<void> {
  if (!state.record) return
  await setAORecord({...state.record, ...patch}, state.notice)
}

/** The session an async action started from (its identity: sid + token). */
export interface AOSessionRef {
  sid: string
  token: string
  did: string
}

export function sessionRef(r: AORecord): AOSessionRef {
  return {sid: r.sid, token: r.token, did: r.did}
}

/** Is `ref` still the session on this device? A late network answer for a
 *  session that was since replaced (another sign-in, another account) or
 *  cleared must never touch the record that is there now. */
export function isCurrentSession(ref: AOSessionRef): boolean {
  const r = state.record
  return !!r && r.sid === ref.sid && r.token === ref.token
}

/** Is the session on this device still the SIGN-IN `ref` started from (same
 *  sid + did), even if a refresh has since rotated its token? This is the
 *  test for USER-initiated ends (sign out, sign out everywhere, unlink): the
 *  runtime revoked the sid, so every token of that sid must go. */
export function isSameSignIn(ref: AOSessionRef): boolean {
  const r = state.record
  return !!r && r.sid === ref.sid && r.did === ref.did
}

/** Clear the record if it is still the same sign-in (sid + did), whatever
 *  token a refresh rotated in meanwhile. */
export async function clearAORecordIfSignIn(
  ref: AOSessionRef,
  notice: MessageDescriptor | null = null,
): Promise<boolean> {
  if (!isSameSignIn(ref)) return false
  await setAORecord(null, notice)
  return true
}

/** Patch the record only if it is still the session `ref` names. */
export async function patchAORecordIf(
  ref: AOSessionRef,
  patch: Partial<AORecord>,
): Promise<boolean> {
  if (!isCurrentSession(ref)) return false
  await patchAORecord(patch)
  return true
}

/** Clear the record only if it is still the session `ref` names. */
export async function clearAORecordIf(
  ref: AOSessionRef,
  notice: MessageDescriptor | null = null,
): Promise<boolean> {
  if (!isCurrentSession(ref)) return false
  await setAORecord(null, notice)
  return true
}

export function clearAONotice(): void {
  if (state.notice) emit({notice: null})
}

/**
 * The bearer the agent-runtime clients send, when the AO session should be it:
 * the lane is armed, a live record exists, and it belongs to the person signed
 * in to the social app (or nobody is — the Signature-only shell). A PDS account
 * with a DIFFERENT DID keeps its own PDS bearer: one person's AO session never
 * speaks for another account. Null ⇒ the caller uses the PDS token as before.
 *
 * `targetUrl`: where the caller is about to send it. The AO bearer goes ONLY
 * to the pinned runtime origin (the config refuses to arm unless that is the
 * agent runtime); any other host — e.g. a separately configured game server
 * (EXPO_PUBLIC_GAME_SERVER_URL) — gets null and so the PDS token, as before.
 * An unparseable target is treated as foreign.
 */
export function aoRuntimeBearer(
  pdsDid: string | null | undefined,
  now: number = Date.now(),
  targetUrl?: string,
): string | null {
  if (!isAOSignatureArmed()) return null
  if (targetUrl !== undefined && !isPinnedRuntime(targetUrl)) return null
  const r = state.record
  if (!r) return null
  if (Date.parse(r.expiresAt) <= now) return null
  if (pdsDid && pdsDid !== r.did) return null
  return r.token
}

function isPinnedRuntime(url: string): boolean {
  const pinned = AO_SIGNATURE_CONFIG?.runtimeUrl
  if (!pinned) return false
  try {
    return new URL(url).origin === new URL(pinned).origin
  } catch {
    return false
  }
}

/** Test seam. */
export function _resetAOStoreForTests(next?: Partial<AOState>) {
  state = {loaded: !isAOSignatureArmed(), record: null, notice: null, ...next}
  listeners.clear()
}
