/**
 * Agent Live client: the owner's /live calls on the agent runtime.
 *
 * CONTRACT. feat/agent-live-r2-workers-v2 @ 9fc23bd, R2 contract rev 4 (contains
 * agent-live/integration), src/live/tenant/live-routes.js and
 * live-consent-routes.js. The response shapes in __fixtures__/live.json are
 * what those routes answered (scripts/agentLive/generateLiveFixtures.mjs), not
 * hand-written.
 *
 *   POST /live/sessions               {agentDid, devicePubKey?}
 *     → {sid, region, wsUrl, token|null, expiresAt|null, popRequired,
 *        consentRequired, recordPolicy, reused, consentMissing?}
 *   POST /live/sessions/:sid/consent  {decisions, textVersion, textSha256, devicePubKey?}
 *     → {admitted, missing, token|null, expiresAt|null, popRequired, agent}
 *   POST /live/sessions/:sid/token    {camera, devicePubKey?}
 *     → {token, expiresAt, popRequired}   403 {error: consent_required}
 *   POST /live/join/prove             {token, sig}   (no bearer)
 *     → {ok, token, expiresAt}: a fresh, proven token. Join with THAT one;
 *       the proven one is traded and never joins (R2 v2, review bfc09869)
 *   POST /live/sessions/:sid/end      → {ok}  (idempotent)
 *
 * IDENTITY (ruling 3; design r2 §6 step 2, R3, X-TOK-1). The bearer is the
 * only identity this client sends, and the runtime derives the owner from it.
 * No request carries the owner's DID, an `ownerDid`, `did`, `identity`, `tk`
 * or any other identity field, in the body, the query or the path. The query
 * string is always empty. Bodies are built field by field, so a caller can't
 * smuggle a key through. The one DID that goes out is `agentDid` on the start
 * call: the AGENT the owner asks to go live with.
 *
 * OWNER SCOPE. A session belongs to the account that started it. `captureLiveAuth`
 * pins that account (its DID and its bearer at start); every later call for the
 * session passes it back, and goes out with that account's bearer even when
 * the app has since switched account or signed out (the end call on unmount
 * runs after the tree has already moved on). While the same account is still
 * signed in, its current bearer is used, so a refreshed session keeps working.
 *
 * The join token and the bearer are held in memory by the caller only. Nothing
 * here logs a token, a DID or a response body, and nothing persists to disk.
 * NEVER throws.
 */
import {getAgentRuntimeAccessToken} from '#/lib/agent-runtime/authToken'
import {AGENT_RUNTIME_BASE_URL} from '#/lib/agent-runtime/config'
import {logger} from '#/logger'
import * as persisted from '#/state/persisted'

export type LiveError =
  | {kind: 'signed_out'}
  | {kind: 'invalid_argument'}
  | {kind: 'not_found'}
  | {kind: 'consent_required'}
  | {kind: 'bad_proof'}
  /**
   * The server accepted the proof but returned no exchanged token: it predates
   * the new join flow (runtime R2 v2), so Live can't join on it.
   */
  | {kind: 'server_outdated'}
  | {kind: 'unavailable'; status: number}
  | {kind: 'http'; status: number}
  | {kind: 'network'}
  | {kind: 'bad_response'}

export type LiveResult<T> = {ok: true; data: T} | {ok: false; error: LiveError}

/**
 * The account a session belongs to, pinned when it starts. Memory only. The
 * bearer is refreshed on every call while that account is still the signed-in
 * one, so after a sign-out or switch the last good one is used (review
 * 679a9d48 H2 item 3).
 */
export type LiveAuth = {readonly ownerDid: string; bearer: string}

/** A LiveKit join token for the owner (at most 60 s, single use). */
export type LiveJoin = {
  token: string
  expiresAt: number
  /** Bound to this device's key: prove it (proveLiveJoin) before joining. */
  popRequired: boolean
}

/** POST /live/sessions. */
export type LiveSession = {
  sid: string
  region: string
  wsUrl: string
  /** Null until the owner has decided every consent kind (F9). */
  join: LiveJoin | null
  consentRequired: string[]
  recordPolicy: string
  /** The owner already had this session open (maybe on another device). */
  reused: boolean
}

/** POST /live/sessions/:sid/consent. */
export type LiveConsentResult = {
  admitted: boolean
  missing: string[]
  join: LiveJoin | null
  /**
   * The agent's job: 'started' or 'running', else why it isn't
   * ('not_started', 'not_configured', 'not_found', 'unavailable',
   * 'no_consent'); null if the reply has none.
   */
  agent: string | null
}

export type LiveDecision = 'given' | 'refused'

// The runtime's own patterns (src/live/tenant/keys.js, edge/edge-crypto.js,
// consent/kinds.js, live-consent-routes.js).
const SID_RE = /^ls_[0-9A-HJKMNP-TV-Z]{26}$/
const DID_RE = /^did:[a-z0-9]+:[A-Za-z0-9._:%-]{1,200}$/
const PUBKEY_RE = /^[A-Za-z0-9_-]{43}$/
const KIND_RE = /^[a-z_]{1,40}$/
const TEXT_VERSION_RE = /^[A-Za-z0-9._-]{1,40}$/
const SHA256_HEX_RE = /^[0-9a-f]{64}$/
const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
const SIG_RE = /^[A-Za-z0-9_-]{86}$/

const LIVE_PATH = '/live/sessions'

/**
 * The signed-in account and its bearer, for a session about to start. Null
 * when nobody is signed in.
 */
export async function captureLiveAuth(): Promise<LiveAuth | null> {
  try {
    const did = persisted.get('session')?.currentAccount?.did
    const bearer = await getAgentRuntimeAccessToken()
    if (!did || !DID_RE.test(did) || !bearer) return null
    return {ownerDid: did, bearer}
  } catch {
    return null
  }
}

export async function startLiveSession({
  agentDid,
  auth,
  devicePubKey,
}: {
  agentDid: string
  auth: LiveAuth
  devicePubKey?: string | null
}): Promise<LiveResult<LiveSession>> {
  if (typeof agentDid !== 'string' || !DID_RE.test(agentDid)) {
    return {ok: false, error: {kind: 'invalid_argument'}}
  }
  const pk = pubKeyOrNull(devicePubKey)
  if (pk === undefined) return {ok: false, error: {kind: 'invalid_argument'}}
  const res = await post(
    [],
    auth,
    {agentDid, ...(pk ? {devicePubKey: pk} : {})},
    LIVE_START_TIMEOUT_MS,
  )
  if (!res.ok) return res
  const s = readSession(res.data)
  return s ? {ok: true, data: s} : badResponse()
}

/**
 * The owner's own consent sheet (design §6 step 3). Every kind in `decisions`
 * is `given` or `refused`; "don't record" is a valid answer. Once the owner has
 * decided every required kind, the reply carries their join token.
 */
export async function submitLiveConsent({
  sid,
  auth,
  decisions,
  textVersion,
  textSha256,
  devicePubKey,
}: {
  sid: string
  auth: LiveAuth
  decisions: Record<string, LiveDecision>
  textVersion: string
  /**
   * Per kind decided, the SHA-256 (hex) of the exact words the owner was
   * shown (review r404 d). The runtime refuses words it doesn't hold for
   * `textVersion` (text_mismatch).
   */
  textSha256: Record<string, string>
  devicePubKey?: string | null
}): Promise<LiveResult<LiveConsentResult>> {
  if (!SID_RE.test(sid) || !TEXT_VERSION_RE.test(textVersion)) {
    return {ok: false, error: {kind: 'invalid_argument'}}
  }
  const pk = pubKeyOrNull(devicePubKey)
  if (pk === undefined) return {ok: false, error: {kind: 'invalid_argument'}}
  const clean: Record<string, LiveDecision> = {}
  for (const [kind, d] of Object.entries(decisions)) {
    if (!KIND_RE.test(kind) || (d !== 'given' && d !== 'refused')) {
      return {ok: false, error: {kind: 'invalid_argument'}}
    }
    clean[kind] = d
  }
  // A hash for every kind decided, and nothing else: no decision goes out
  // without the words it was made on.
  const shown: Record<string, string> = {}
  for (const kind of Object.keys(clean)) {
    const h = Object.hasOwn(textSha256, kind) ? textSha256[kind] : undefined
    if (typeof h !== 'string' || !SHA256_HEX_RE.test(h)) {
      return {ok: false, error: {kind: 'invalid_argument'}}
    }
    shown[kind] = h
  }
  const res = await post(
    [sid, 'consent'],
    auth,
    {
      decisions: clean,
      textVersion,
      textSha256: shown,
      ...(pk ? {devicePubKey: pk} : {}),
    },
    LIVE_START_TIMEOUT_MS,
  )
  if (!res.ok) return res
  const c = readConsent(res.data)
  return c ? {ok: true, data: c} : badResponse()
}

/**
 * A fresh owner join token for this session: on reconnect, and with
 * `camera: true` once the owner turns the camera on (the only way the token
 * gains the CAMERA source). 403 consent_required: the owner's consent is no
 * longer complete (withdrawn).
 */
export async function requestLiveToken({
  sid,
  auth,
  camera = false,
  devicePubKey,
}: {
  sid: string
  auth: LiveAuth
  camera?: boolean
  devicePubKey?: string | null
}): Promise<LiveResult<LiveJoin>> {
  if (!SID_RE.test(sid)) return {ok: false, error: {kind: 'invalid_argument'}}
  const pk = pubKeyOrNull(devicePubKey)
  if (pk === undefined) return {ok: false, error: {kind: 'invalid_argument'}}
  const res = await post([sid, 'token'], auth, {
    camera: camera === true,
    ...(pk ? {devicePubKey: pk} : {}),
  })
  if (!res.ok) return res
  const t = readJoin(res.data)
  return t ? {ok: true, data: t} : badResponse()
}

/**
 * The device-key proof for a bound join token (smoke F7 control c). The proof
 * always trades (R2 contract rev 4, runtime feat/agent-live-r2-workers-v2 @
 * 9fc23bd; there is no prove-only path): the proven token is traded for the prover's own
 * fresh, proven token, returned only here. The app joins with the RETURNED
 * token; the one it proved never joins, so a copy of it is worthless. Carries
 * no bearer: the token and the signature are the request.
 */
export async function proveLiveJoin({
  token,
  sig,
}: {
  token: string
  sig: string
}): Promise<LiveResult<{token: string; expiresAt: number}>> {
  if (!JWT_RE.test(token) || !SIG_RE.test(sig)) {
    return {ok: false, error: {kind: 'invalid_argument'}}
  }
  // R2 rev 4: the proof always trades the token; `exchange` is not sent.
  const res = await send('/live/join/prove', null, {token, sig})
  if (!res.ok) return res
  // No token back means the exchange didn't happen: never join on the proven
  // one (it would be refused, or be a copy-holder's race).
  if (!isObject(res.data) || res.data.ok !== true) return badResponse()
  const {token: fresh, expiresAt} = res.data
  // A plain {ok: true}: the proof was accepted the old way. This server has
  // no exchange (before runtime R2 v2), so say so instead of a generic error.
  if (fresh === undefined && expiresAt === undefined) {
    return {ok: false, error: {kind: 'server_outdated'}}
  }
  if (typeof fresh !== 'string' || !JWT_RE.test(fresh) || fresh === token) {
    return badResponse()
  }
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) {
    return badResponse()
  }
  return {ok: true, data: {token: fresh, expiresAt}}
}

export async function endLiveSession({
  sid,
  auth,
}: {
  sid: string
  auth: LiveAuth
}): Promise<LiveResult<null>> {
  if (!SID_RE.test(sid)) return {ok: false, error: {kind: 'invalid_argument'}}
  const res = await post([sid, 'end'], auth)
  return res.ok ? {ok: true, data: null} : res
}

/** undefined: present but malformed. */
function pubKeyOrNull(
  pk: string | null | undefined,
): string | null | undefined {
  if (pk === undefined || pk === null) return null
  return typeof pk === 'string' && PUBKEY_RE.test(pk) ? pk : undefined
}

/**
 * The bearer for `auth`'s account: its current one while it is still the
 * signed-in account, else the one pinned at start.
 */
async function bearerFor(auth: LiveAuth): Promise<string> {
  try {
    if (persisted.get('session')?.currentAccount?.did === auth.ownerDid) {
      const current = await getAgentRuntimeAccessToken()
      if (current) auth.bearer = current
      return auth.bearer
    }
  } catch {}
  return auth.bearer
}

function post(
  parts: string[],
  auth: LiveAuth,
  body?: Record<string, unknown>,
  timeoutMs = LIVE_REQUEST_TIMEOUT_MS,
): Promise<LiveResult<unknown>> {
  if (!auth || !auth.bearer || !DID_RE.test(auth.ownerDid)) {
    return Promise.resolve({ok: false, error: {kind: 'signed_out'}})
  }
  const path = [LIVE_PATH, ...parts.map(encodeURIComponent)].join('/')
  return send(path, auth, body, timeoutMs)
}

/**
 * Every Live request gives up after this long, as a network error (review
 * d8f8f16e H2): a server that accepts and never answers must not hold the
 * owner on "Ending…" for the platform's own timeout.
 */
export const LIVE_REQUEST_TIMEOUT_MS = 10_000
/**
 * Start and consent can launch the agent's job before they answer (review
 * 563477989 K5): a longer bound, still finite.
 */
export const LIVE_START_TIMEOUT_MS = 30_000

async function send(
  path: string,
  auth: LiveAuth | null,
  body?: Record<string, unknown>,
  timeoutMs = LIVE_REQUEST_TIMEOUT_MS,
): Promise<LiveResult<unknown>> {
  const abort = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  // Raced rather than trusting the abort alone: the body read can hang too.
  const timedOut = new Promise<LiveResult<unknown>>(resolve => {
    timer = setTimeout(() => {
      abort.abort()
      logger.warn('agentLive: request timed out')
      resolve({ok: false, error: {kind: 'network'}})
    }, timeoutMs)
  })
  try {
    return await Promise.race([
      request(path, auth, abort.signal, body),
      timedOut,
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function request(
  path: string,
  auth: LiveAuth | null,
  signal: AbortSignal,
  body?: Record<string, unknown>,
): Promise<LiveResult<unknown>> {
  try {
    const headers: Record<string, string> = {}
    if (auth) headers.Authorization = `Bearer ${await bearerFor(auth)}`
    if (body) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${AGENT_RUNTIME_BASE_URL}${path}`, {
      method: 'POST',
      headers,
      signal,
      ...(body ? {body: JSON.stringify(body)} : {}),
    })
    if (res.status === 401) {
      // /live/join/prove answers 401 for a bad proof; the owner routes for a
      // bearer the runtime doesn't accept.
      return {
        ok: false,
        error: auth ? {kind: 'signed_out'} : {kind: 'bad_proof'},
      }
    }
    if (res.status === 403 && (await errorCode(res)) === 'consent_required') {
      return {ok: false, error: {kind: 'consent_required'}}
    }
    if (res.status === 404) return {ok: false, error: {kind: 'not_found'}}
    if (res.status === 503) {
      return {ok: false, error: {kind: 'unavailable', status: res.status}}
    }
    if (!res.ok) return {ok: false, error: {kind: 'http', status: res.status}}
    try {
      return {ok: true, data: JSON.parse(await res.text()) as unknown}
    } catch {
      return badResponse()
    }
  } catch {
    // The error text is not logged: it could echo the request.
    logger.warn('agentLive: request failed')
    return {ok: false, error: {kind: 'network'}}
  }
}

async function errorCode(res: Response): Promise<string | null> {
  try {
    const j = JSON.parse(await res.text()) as unknown
    return isObject(j) && typeof j.error === 'string' ? j.error : null
  } catch {
    return null
  }
}

function badResponse(): {ok: false; error: LiveError} {
  return {ok: false, error: {kind: 'bad_response'}}
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function isStringList(x: unknown): x is string[] {
  return Array.isArray(x) && x.every(c => typeof c === 'string')
}

/** A join token, null when the reply has none, undefined when it is malformed. */
function readJoinField(
  x: Record<string, unknown>,
): LiveJoin | null | undefined {
  const {token, expiresAt, popRequired} = x
  if (token === null || token === undefined) {
    return expiresAt === null || expiresAt === undefined ? null : undefined
  }
  if (typeof token !== 'string' || !JWT_RE.test(token)) return undefined
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt))
    return undefined
  return {token, expiresAt, popRequired: popRequired === true}
}

function readJoin(x: unknown): LiveJoin | null {
  if (!isObject(x)) return null
  return readJoinField(x) ?? null
}

function readSession(x: unknown): LiveSession | null {
  if (!isObject(x)) return null
  const join = readJoinField(x)
  const {sid, region, wsUrl, consentRequired, recordPolicy, reused} = x
  if (join === undefined) return null
  if (typeof sid !== 'string' || !SID_RE.test(sid)) return null
  if (typeof region !== 'string' || !region) return null
  if (typeof wsUrl !== 'string' || !/^wss?:\/\//.test(wsUrl)) return null
  if (!isStringList(consentRequired)) return null
  if (typeof recordPolicy !== 'string') return null
  // A session with no token must be one awaiting consent: never connect
  // without one, never skip the sheet when the runtime says it is missing.
  if (!join && x.consentMissing !== true) return null
  return {
    sid,
    region,
    wsUrl,
    join: x.consentMissing === true ? null : join,
    consentRequired,
    recordPolicy,
    reused: reused === true,
  }
}

function readConsent(x: unknown): LiveConsentResult | null {
  if (!isObject(x)) return null
  const join = readJoinField(x)
  if (join === undefined) return null
  if (typeof x.admitted !== 'boolean' || !isStringList(x.missing)) return null
  return {
    admitted: x.admitted,
    missing: x.missing,
    join: x.admitted ? join : null,
    agent: typeof x.agent === 'string' ? x.agent : null,
  }
}
