// AO session lifecycle: adopt a redeem, slide (refresh), Janus re-verify,
// sign out, sign out everywhere, self-unlink. Policy is PURE (tested); the
// actions take the client they call.
import {msg} from '@lingui/core/macro'

import {type AOClient} from './client'
import {AOSignatureError} from './errors'
import {type AORecord, getAOState, patchAORecord, setAORecord} from './store'
import {type AORedeemResult, aoSessionClaims} from './wire'

/** Slide at most twice a day (Studio AOSessionRenewal). */
export const REFRESH_EVERY_MS = 12 * 3600 * 1000
/** The runtime's default AO_SESSION_LIVENESS_S (24 h): past it a refresh is
 *  refused with `janus-reverify`, so don't spend the call. */
export const LIVENESS_MS = 24 * 3600 * 1000
/** After a network/5xx refresh failure, pause proactive refresh. */
export const REFRESH_BACKOFF_MS = 15 * 60 * 1000

export function recordFromRedeem(
  r: AORedeemResult,
  now: number = Date.now(),
): AORecord {
  return {
    v: 1,
    token: r.session.token,
    sid: r.session.sid,
    did: r.did,
    handle: r.handle,
    expiresAt: r.session.expiresAt,
    primary: r.primary,
    needsAgent: r.needsAgent,
    refreshedAt: now,
    reverify: false,
  }
}

export type RefreshDecision = 'none' | 'refresh' | 'reverify'

/** PURE. What the proactive renewal should do right now. */
export function refreshDecision(
  record: AORecord | null,
  now: number,
  backoffUntil: number = 0,
): RefreshDecision {
  if (!record || record.reverify) return 'none'
  if (Date.parse(record.expiresAt) <= now) return 'none'
  const {lv} = aoSessionClaims(record.token)
  if (lv !== null && now - lv * 1000 > LIVENESS_MS) return 'reverify'
  if (now < backoffUntil) return 'none'
  return now - record.refreshedAt >= REFRESH_EVERY_MS ? 'refresh' : 'none'
}

const SESSION_ENDED = msg`Your Authority Signature session ended — sign in again.`

export type RefreshOutcome =
  | 'refreshed'
  | 'reverify'
  | 'ended'
  | 'backoff'
  | 'skipped'

/**
 * Slide the session once. Outcomes:
 *  · 200 → the new token replaces the old (same sid);
 *  · 401 `janus-reverify` → marked; the token keeps working until its exp;
 *  · any other 401 → the session is over (signed out, revoked, epoch bumped):
 *    cleared here, the person is told;
 *  · network / 5xx → `backoff` (the caller pauses; the session is kept).
 */
export async function refreshAOSession(
  client: AOClient,
  now: number = Date.now(),
): Promise<RefreshOutcome> {
  const record = getAOState().record
  if (!record) return 'skipped'
  try {
    const minted = await client.refresh(record.token, record.did)
    await patchAORecord({
      token: minted.token,
      sid: minted.sid,
      expiresAt: minted.expiresAt,
      refreshedAt: now,
      reverify: false,
    })
    return 'refreshed'
  } catch (e) {
    if (
      e instanceof AOSignatureError &&
      e.kind === 'refused' &&
      e.status === 401
    ) {
      if (e.code === 'janus-reverify') {
        await patchAORecord({reverify: true})
        return 'reverify'
      }
      await setAORecord(null, SESSION_ENDED)
      return 'ended'
    }
    return 'backoff'
  }
}

/**
 * The runtime answered 401 to a request carrying the AO bearer. Refresh once;
 * a refusal ends the session (Studio's 401 ladder). Network failures keep it.
 */
export async function repairAOUnauthorized(
  client: AOClient,
): Promise<RefreshOutcome> {
  return refreshAOSession(client)
}

/**
 * Sign out of Signature on this device: revoke this session's sid at the
 * runtime, then forget it. The device forgets it even when the runtime can't be
 * reached (the person asked to be signed out); `serverConfirmed` says which.
 *
 * Janus `logout?scope=local` is NOT called: this app never holds a Janus token
 * (the runtime does the code exchange — see the report), so there is nothing on
 * the device for Janus to revoke.
 */
export async function signOutAO(
  client: AOClient,
): Promise<{serverConfirmed: boolean}> {
  const record = getAOState().record
  if (!record) return {serverConfirmed: true}
  let serverConfirmed = true
  try {
    await client.signout(record.token)
  } catch {
    serverConfirmed = false
  }
  await setAORecord(null)
  return {serverConfirmed}
}

/** Every AO session of this person dies at once (epoch bump). The device signs
 *  out only AFTER the runtime confirms; a failure throws and keeps the session. */
export async function signOutEverywhereAO(client: AOClient): Promise<void> {
  const record = getAOState().record
  if (!record) return
  await client.signoutEverywhere(record.token)
  await setAORecord(null)
}

/** Owner self-unlink: this Signature identity stops signing in to this account
 *  (every later redeem is refused) and every AO session ends. After confirm only. */
export async function unlinkAO(client: AOClient): Promise<void> {
  const record = getAOState().record
  if (!record) return
  await client.unlink(record.token)
  await setAORecord(null)
}

/**
 * The social app's PDS account signed out. If the AO session belongs to that
 * account (or every account signed out), sign it out too — leaving the
 * runtime bearer behind for a person who just signed out would be a surprise.
 */
export async function onPdsLogout(
  client: AOClient,
  did: string | null,
): Promise<void> {
  const record = getAOState().record
  if (!record) return
  if (did !== null && record.did !== did) return
  await signOutAO(client)
}

/**
 * Re-read the session from the runtime (GET /auth/ao/session): picks up a
 * primary chosen elsewhere, and notices a session that was ended elsewhere
 * (signed out everywhere, unlinked, revoked) — a 401 here is the end.
 * Network / 5xx failures change nothing.
 */
export async function syncAOSession(client: AOClient): Promise<void> {
  const record = getAOState().record
  if (!record) return
  try {
    const s = await client.introspect(record.token)
    if (s.did && s.did !== record.did) {
      await setAORecord(null, SESSION_ENDED)
      return
    }
    await patchAORecord({primary: s.primary, needsAgent: s.needsAgent})
  } catch (e) {
    if (
      e instanceof AOSignatureError &&
      e.kind === 'refused' &&
      e.status === 401
    ) {
      await setAORecord(null, SESSION_ENDED)
    }
  }
}

/**
 * The runtime answered 403 `not-provisioned` to an /app/* call made with the
 * AO bearer: the person has no primary agent (any more) — back to the picker.
 * No-op without an AO session (the PDS path's 403 handling is unchanged).
 */
export function noteAONotProvisioned(): void {
  const record = getAOState().record
  if (!record || record.needsAgent) return
  void patchAORecord({needsAgent: true, primary: null})
}

/** The picker finished: this is the person's primary now. */
export async function adoptPrimary(primary: string): Promise<void> {
  await patchAORecord({primary, needsAgent: false})
}
