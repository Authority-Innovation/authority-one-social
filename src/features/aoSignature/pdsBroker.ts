// The Community timeline for a person signed in ONLY with Authority Signature
// (Signature rollout P5). The device never holds a PDS password or refresh
// token for them: the runtime trades their AO session for a SHORT-LIVED PDS
// accessJwt (POST /auth/ao/pds-session), and the app comes back for a new one
// before it expires or when the PDS says 401.
//
// An account the runtime holds no credential for (an existing account linked by
// an operator) answers 409 `pds-credential-unavailable`, `next: 'self-mint'`.
// The person then CONNECTS their Community account once: one full password
// sign-in to their PDS, handed to the runtime (POST /auth/ao/pds-credential)
// for that single call, then ended. The password and the full session are never
// stored here.
import {type AOClient, type AOFetch} from './client'
import {AOSignatureError, runtimeErrorCode} from './errors'
import {type AORecord} from './store'
import {type AOPdsSession} from './wire'

/** Come back this long before the runtime-stated expiry. */
export const PDS_SESSION_EARLY_MS = 60_000
/** When the runtime could not state an expiry, keep a token at most this long. */
export const PDS_SESSION_UNSTATED_TTL_MS = 5 * 60_000

export interface PdsBroker {
  /** A live PDS accessJwt for `record`'s DID (cached; one request at a time). */
  get(record: AORecord): Promise<AOPdsSession>
  /** Drop the cached token (the PDS said 401, or the person connected). */
  invalidate(): void
}

export function createPdsBroker(
  client: AOClient,
  now: () => number = Date.now,
): PdsBroker {
  let cached: {sid: string; session: AOPdsSession; keepUntil: number} | null =
    null
  let inflight: {sid: string; p: Promise<AOPdsSession>} | null = null
  return {
    get(record) {
      if (cached && cached.sid === record.sid && cached.keepUntil > now()) {
        return Promise.resolve(cached.session)
      }
      if (inflight && inflight.sid === record.sid) return inflight.p
      const sid = record.sid
      const p = client
        .pdsSession(record.token, record.did)
        .then(session => {
          const keepUntil =
            session.expiresAt !== null
              ? session.expiresAt - PDS_SESSION_EARLY_MS
              : now() + PDS_SESSION_UNSTATED_TTL_MS
          cached = {sid, session, keepUntil}
          return session
        })
        .finally(() => {
          if (inflight?.p === p) inflight = null
        })
      inflight = {sid, p}
      return p
    },
    invalidate() {
      cached = null
    },
  }
}

/** Does this broker refusal mean "connect your Community account once"? */
export function needsCommunityConnect(error: unknown): boolean {
  return (
    error instanceof AOSignatureError &&
    error.kind === 'refused' &&
    error.code === 'pds-credential-unavailable'
  )
}

async function xrpc(
  doFetch: AOFetch,
  url: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<Record<string, unknown> | null> {
  let res
  try {
    res = await doFetch(url, {
      method: 'POST',
      headers:
        body === undefined
          ? headers
          : {...headers, 'Content-Type': 'application/json'},
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new AOSignatureError('transport')
  }
  const json = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  if (!res.ok) {
    throw new AOSignatureError(
      'refused',
      res.status,
      res.status === 401 ? 'pds-session-invalid' : runtimeErrorCode(json),
    )
  }
  return json
}

/**
 * "Connect your Community account": one full PDS sign-in for THIS person, used
 * for the runtime's self-mint call only, then ended at the PDS. Resolves when
 * the runtime holds the credential; the broker cache is dropped so the next
 * get() picks it up.
 */
export async function connectCommunityAccount(input: {
  client: AOClient
  record: AORecord
  service: string
  identifier: string
  password: string
  doFetch: AOFetch
  broker?: PdsBroker
}): Promise<void> {
  const base = input.service.replace(/\/+$/, '')
  const full = await xrpc(
    input.doFetch,
    `${base}/xrpc/com.atproto.server.createSession`,
    {},
    {identifier: input.identifier.trim(), password: input.password},
  )
  const accessJwt = typeof full?.accessJwt === 'string' ? full.accessJwt : ''
  const refreshJwt = typeof full?.refreshJwt === 'string' ? full.refreshJwt : ''
  const did = typeof full?.did === 'string' ? full.did : ''
  if (!accessJwt) throw new AOSignatureError('refused', 502, 'unavailable')
  try {
    // Belt: the runtime checks this too, but never hand over someone else's.
    if (did !== input.record.did) {
      throw new AOSignatureError('refused', 403, 'not-your-account')
    }
    await input.client.pdsCredential(input.record.token, accessJwt)
    input.broker?.invalidate()
  } finally {
    // End the full session whatever happened: it was only for this call.
    if (refreshJwt) {
      await xrpc(
        input.doFetch,
        `${base}/xrpc/com.atproto.server.deleteSession`,
        {Authorization: `Bearer ${refreshJwt}`},
      ).catch(() => {})
    }
  }
}
