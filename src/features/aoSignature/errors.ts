// Honest words for every refusal on the Signature lane. The mapping mirrors
// Authority Studio's (capture-engine AOSignInError.message / AOAgentPickerModel
// .words) so both apps say the same thing for the same server answer.
import {type MessageDescriptor} from '@lingui/core'
import {msg} from '@lingui/core/macro'

export type AOSignatureErrorKind =
  /** The runtime answered non-2xx: status + its `code` (else `error`) string. */
  | 'refused'
  /** A 200 without an `aos1.` session for a `did:` — the runtime is not armed
   *  for v2. Never adopted, never downgraded to the PDS token. */
  | 'no-ao-session'
  /** A link redeem that did not come back `linked` to the DID that minted the code. */
  | 'link-mismatch'
  /** The link code is spent, expired, or minted for a different PDS session. */
  | 'link-code-unusable'
  /** The person closed the Signature sheet (or Janus said access_denied). */
  | 'cancelled'
  /** Janus returned an error, or the callback failed the state check. */
  | 'janus'
  /** Linking needs the app's own PDS sign-in first. */
  | 'needs-pds-session'
  | 'transport'
  | 'not-configured'

export class AOSignatureError extends Error {
  readonly kind: AOSignatureErrorKind
  readonly status: number
  readonly code: string

  constructor(kind: AOSignatureErrorKind, status = 0, code = '') {
    super(code ? `${kind}:${status}:${code}` : kind)
    this.name = 'AOSignatureError'
    this.kind = kind
    this.status = status
    this.code = code
  }

  /** A runtime refusal as the error the app acts on: 403 `link-code-invalid`
   *  is "start the link again"; everything else keeps its status and code. */
  static fromResponse(status: number, code: string): AOSignatureError {
    if (code === 'link-code-invalid') {
      return new AOSignatureError('link-code-unusable', status, code)
    }
    return new AOSignatureError('refused', status, code)
  }
}

/** The runtime's `{code}` (else `{error}`) string — `code` wins, as in Studio
 *  (`{error:'reverify', code:'janus-reverify'}` is a reverify, not "reverify"). */
export function runtimeErrorCode(body: unknown): string {
  if (!body || typeof body !== 'object') return ''
  const b = body as Record<string, unknown>
  if (typeof b.code === 'string' && b.code) return b.code
  if (typeof b.error === 'string') return b.error
  return ''
}

const TRY_AGAIN = msg`Authority One couldn't finish signing you in just now — try again in a moment.`
const INVITE_ONLY = msg`Authority One is invite-only right now — ask for your email to be added.`
const LINK_AGAIN = msg`That link took too long — start the link again from your account.`

/** Sign-in / link / account-action words. */
export function aoSignatureErrorWords(error: unknown): MessageDescriptor {
  if (!(error instanceof AOSignatureError)) {
    return msg`Something went wrong — try again.`
  }
  switch (error.kind) {
    case 'not-configured':
      return msg`Authority Signature sign-in isn't available in this build.`
    case 'no-ao-session':
      return msg`Authority One isn't accepting Authority Signature sign-ins yet.`
    case 'link-mismatch':
      return msg`That Signature sign-in didn't link to this account — nothing was changed.`
    case 'link-code-unusable':
      return LINK_AGAIN
    case 'cancelled':
      return msg`Sign-in was cancelled.`
    case 'janus':
      return msg`Authority Signature couldn't finish signing you in — try again.`
    case 'needs-pds-session':
      return msg`Sign in with your Authority One handle first, then link Authority Signature.`
    case 'transport':
      return msg`Couldn't reach Authority One — check your connection.`
    case 'refused':
      break
  }
  const {status, code} = error
  switch (code) {
    case 'owner-exists':
      return msg`Your email already has an Authority One account. Sign in with your handle and app password, then link Authority Signature from your account.`
    case 'already-bound':
      return msg`That Signature identity is already linked to a different Authority One account.`
    case 'unlinked-contact-support':
      return msg`This Signature identity was unlinked from Authority One. Contact support to link it again.`
    case 'full-session-required':
      return msg`Linking needs a fresh link code — start the link again from your account.`
    case 'not-a-person':
      return msg`Agent accounts can't sign in with Authority Signature.`
    case 'not-an-owner':
      return msg`This account has no agents on Authority One yet, so there is nothing to link.`
    case 'rate-limited':
      return msg`Too many link attempts — wait a little, then try again.`
    case 'link-code-invalid':
      return LINK_AGAIN
    case 'no-verified-email':
      return msg`Your Signature account needs a verified email first — verify it at id.authorityx.com, then try again.`
    case 'not-allowlisted':
      return INVITE_ONLY
    case 'provision-failed':
      return msg`Authority One couldn't set up your account just now — nothing was created. Try again in a moment.`
    case 'janus-reverify':
      return msg`Continue with Authority Signature to stay signed in.`
    case 'unavailable':
    case 'ao-session-unavailable':
    case 'session-unavailable':
    case 'allowlist-unavailable':
      return TRY_AGAIN
  }
  if (status === 429)
    return msg`Too many tries — wait a little, then try again.`
  if (status === 401)
    return msg`Your Authority Signature sign-in wasn't accepted.`
  if (status >= 500) return TRY_AGAIN
  if (status === 403) return INVITE_ONLY
  return msg`Couldn't finish signing in (${status}).`
}

/** Agent-picker words (Studio AOAgentPickerModel.words), falling back to the
 *  sign-in words for everything else. */
export function aoPickerErrorWords(error: unknown): MessageDescriptor {
  if (error instanceof AOSignatureError && error.kind === 'refused') {
    if (error.status === 402) {
      return msg`You've already made your free agent — choose one below.`
    }
    if (error.code === 'not-your-agent')
      return msg`That agent isn't one of yours.`
    if (error.code === 'invalid-handle') {
      return msg`That name can't be used — try letters and numbers.`
    }
    if (error.code === 'not-provisioned') {
      return msg`Choose or create an agent to continue.`
    }
    if (error.status === 401) return msg`Your session ended — sign in again.`
  }
  return aoSignatureErrorWords(error)
}
