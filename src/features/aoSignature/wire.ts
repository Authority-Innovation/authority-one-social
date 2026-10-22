// Decoders for the runtime's Signature answers. FAIL-CLOSED: anything that is
// not exactly the v2 shape is an error, never a partial adoption. The
// window-bound PDS `session` the redeemer also returns is never read or kept.
import {AOSignatureError} from './errors'

export const AO_SESSION_PREFIX = 'aos1.'

export interface AOSessionClaims {
  did: string | null
  sid: string | null
  exp: number | null
  /** When Janus last vouched for this person (s). */
  lv: number | null
}

function b64urlDecode(s: string): string | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const bin = globalThis.atob(padded)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

/** `aos1.<b64url(payload)>.<hmacHex>` — exactly three parts. */
export function isAOSessionToken(token: unknown): token is string {
  return (
    typeof token === 'string' &&
    token.startsWith(AO_SESSION_PREFIX) &&
    token.split('.').length === 3 &&
    token.split('.').every(p => p.length > 0)
  )
}

/**
 * The signed-but-not-encrypted payload, read ONLY for client-side decisions
 * ("refresh yet?", "is this the same DID?"). The runtime verifies the HMAC.
 */
export function aoSessionClaims(token: string): AOSessionClaims {
  const empty = {did: null, sid: null, exp: null, lv: null}
  if (!isAOSessionToken(token)) return empty
  const json = b64urlDecode(token.split('.')[1])
  if (!json) return empty
  try {
    const p = JSON.parse(json) as Record<string, unknown>
    const num = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
    return {
      did: typeof p.did === 'string' ? p.did : null,
      sid: typeof p.sid === 'string' ? p.sid : null,
      exp: num(p.exp),
      lv: num(p.lv),
    }
  } catch {
    return empty
  }
}

export interface AOMintedSession {
  token: string
  sid: string
  expiresAt: string
}

/** `{token, sid, epoch, expiresAt}` (ao-session.js mintAoSession). */
export function decodeMintedSession(
  raw: unknown,
  did: string,
  now: number = Date.now(),
  /** A REFRESH re-mints the same sid; any other sid is refused. */
  expectedSid?: string,
): AOMintedSession | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!isAOSessionToken(r.token)) return null
  if (typeof r.sid !== 'string' || !r.sid) return null
  if (typeof r.expiresAt !== 'string') return null
  const exp = Date.parse(r.expiresAt)
  if (!Number.isFinite(exp) || exp <= now) return null
  // Belt: the signed payload must name the same person and session.
  const c = aoSessionClaims(r.token)
  if (c.did !== did || c.sid !== r.sid) return null
  if (expectedSid !== undefined && r.sid !== expectedSid) return null
  return {token: r.token, sid: r.sid, expiresAt: r.expiresAt}
}

export type AORedeemOutcome = 'bound' | 'provisioned' | 'linked'

export interface AORedeemResult {
  outcome: AORedeemOutcome
  did: string
  handle: string | null
  principalId: string | null
  session: AOMintedSession
  primary: string | null
  needsAgent: boolean
}

/**
 * POST /auth/janus/session → the AO session, or a thrown AOSignatureError.
 * `linkDid`: in link mode the answer must be `linked` to exactly the DID the
 * link code was minted for.
 */
export function decodeRedeem(
  json: unknown,
  opts: {linkDid?: string | null; now?: number} = {},
): AORedeemResult {
  if (!json || typeof json !== 'object') {
    throw new AOSignatureError('no-ao-session')
  }
  const r = json as Record<string, unknown>
  const outcome = r.outcome
  if (
    r.ok !== true ||
    (outcome !== 'bound' && outcome !== 'provisioned' && outcome !== 'linked')
  ) {
    throw new AOSignatureError('no-ao-session')
  }
  const did =
    typeof r.did === 'string' && r.did.startsWith('did:') ? r.did : null
  if (!did) throw new AOSignatureError('no-ao-session')
  if (opts.linkDid != null) {
    if (outcome !== 'linked' || did !== opts.linkDid) {
      throw new AOSignatureError('link-mismatch')
    }
  }
  const session = decodeMintedSession(r.aoSession, did, opts.now)
  if (!session) throw new AOSignatureError('no-ao-session')
  const primary = typeof r.primary === 'string' && r.primary ? r.primary : null
  return {
    outcome,
    did,
    handle: typeof r.handle === 'string' && r.handle ? r.handle : null,
    principalId:
      typeof r.principalId === 'string' && r.principalId ? r.principalId : null,
    session,
    primary,
    // No primary ⇒ the picker, whatever the flag says (fail toward the picker).
    needsAgent: r.needsAgent === true || !primary,
  }
}

export interface AOPickerAgent {
  handle: string
  displayName: string | null
  did: string | null
}

export interface AOPickerList {
  agents: AOPickerAgent[]
  primary: string | null
  needsAgent: boolean
}

/** GET /app/agents (v2 shape `{agents, primary, needsAgent}`) or the
 *  introspect GET /auth/ao/session (`agents` are picker entries). */
export function decodePickerList(json: unknown): AOPickerList {
  const r = (json && typeof json === 'object' ? json : {}) as Record<
    string,
    unknown
  >
  const rows = Array.isArray(r.agents) ? r.agents : []
  const seen = new Set<string>()
  const agents: AOPickerAgent[] = []
  for (const raw of rows) {
    const row =
      typeof raw === 'string'
        ? {handle: raw}
        : raw && typeof raw === 'object'
          ? (raw as Record<string, unknown>)
          : null
    if (!row) continue
    const handle = typeof row.handle === 'string' ? row.handle.trim() : ''
    if (!handle || seen.has(handle.toLowerCase())) continue
    seen.add(handle.toLowerCase())
    const name =
      typeof row.displayName === 'string' && row.displayName
        ? row.displayName
        : typeof row.name === 'string' && row.name
          ? row.name
          : typeof row.label === 'string' && row.label
            ? row.label
            : null
    agents.push({
      handle,
      displayName: name,
      did: typeof row.did === 'string' && row.did ? row.did : null,
    })
  }
  const primary = typeof r.primary === 'string' && r.primary ? r.primary : null
  return {agents, primary, needsAgent: r.needsAgent === true || !primary}
}
