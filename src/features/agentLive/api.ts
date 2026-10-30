/**
 * Agent Live client: the owner's /live/sessions calls on the agent runtime.
 *
 * IDENTITY (ruling 3; design r2 §6 step 2, R3, X-TOK-1). The bearer is the
 * only identity this client sends, and the runtime derives the owner from it.
 * No request carries the owner's DID, an `ownerDid`, `did`, `identity`, `tk`
 * or any other identity field, in the body, the query or the path. The query
 * string is always empty. Bodies are built field by field, so a caller can't
 * smuggle a key through.
 *
 * The one DID that goes out is `agentDid` on the start call: the AGENT the
 * owner asks to go live with. The runtime honours it only when the bearer's
 * owner owns that agent, and answers a bare 404 otherwise (piece 1, X-ROOM-1).
 * That reading of ruling 3 is recorded as an assumption in the task report.
 *
 * Shapes follow piece 1's route (runtime branch
 * coord/fix-top-priority-agent-live-piec-a9c94a0f @ 6302e102,
 * src/live/tenant/live-routes.js). That route is not on deploy/dev-communities
 * yet, so the fixtures are labelled as piece 1's, not Dev's.
 *
 * The join token is held in memory by the caller only. Nothing here logs a
 * token, a DID or a response body, and nothing persists to disk. NEVER throws.
 */
import {getAgentRuntimeAccessToken} from '#/lib/agent-runtime/authToken'
import {AGENT_RUNTIME_BASE_URL} from '#/lib/agent-runtime/config'
import {logger} from '#/logger'

export type LiveError =
  | {kind: 'signed_out'}
  | {kind: 'invalid_argument'}
  | {kind: 'not_found'}
  | {kind: 'unavailable'; status: number}
  | {kind: 'http'; status: number}
  | {kind: 'network'}
  | {kind: 'bad_response'}

export type LiveResult<T> = {ok: true; data: T} | {ok: false; error: LiveError}

/** POST /live/sessions. */
export type LiveSession = {
  sid: string
  region: string
  wsUrl: string
  /** The owner's LiveKit join token (`owner:<sid>:<ok>`, at most 5 min). */
  token: string
  expiresAt: number
  consentRequired: string[]
  recordPolicy: string
  reused: boolean
}

/** POST /live/sessions/:sid/token. */
export type LiveToken = {token: string; expiresAt: number}

// The runtime's own patterns (piece 1, src/live/tenant/keys.js).
const SID_RE = /^ls_[0-9A-HJKMNP-TV-Z]{26}$/
const DID_RE = /^did:[a-z0-9]+:[A-Za-z0-9._:%-]{1,200}$/

const LIVE_PATH = '/live/sessions'

export async function startLiveSession({
  agentDid,
}: {
  agentDid: string
}): Promise<LiveResult<LiveSession>> {
  if (typeof agentDid !== 'string' || !DID_RE.test(agentDid)) {
    return {ok: false, error: {kind: 'invalid_argument'}}
  }
  const res = await post([], {agentDid})
  if (!res.ok) return res
  const s = readSession(res.data)
  return s ? {ok: true, data: s} : badResponse()
}

/**
 * A fresh owner join token for this session: on reconnect, and with
 * `camera: true` once the owner turns the camera on (the only way the token
 * gains the CAMERA source).
 */
export async function requestLiveToken({
  sid,
  camera = false,
}: {
  sid: string
  camera?: boolean
}): Promise<LiveResult<LiveToken>> {
  if (!SID_RE.test(sid)) return {ok: false, error: {kind: 'invalid_argument'}}
  const res = await post([sid, 'token'], {camera: camera === true})
  if (!res.ok) return res
  const t = readToken(res.data)
  return t ? {ok: true, data: t} : badResponse()
}

export async function endLiveSession({
  sid,
}: {
  sid: string
}): Promise<LiveResult<null>> {
  if (!SID_RE.test(sid)) return {ok: false, error: {kind: 'invalid_argument'}}
  const res = await post([sid, 'end'])
  return res.ok ? {ok: true, data: null} : res
}

async function post(
  parts: string[],
  body?: Record<string, string | boolean>,
): Promise<LiveResult<unknown>> {
  try {
    const bearer = await getAgentRuntimeAccessToken()
    if (!bearer) return {ok: false, error: {kind: 'signed_out'}}
    const path = [LIVE_PATH, ...parts.map(encodeURIComponent)].join('/')
    const url = AGENT_RUNTIME_BASE_URL.replace(/\/+$/, '') + path
    const headers: Record<string, string> = {Authorization: `Bearer ${bearer}`}
    if (body) headers['Content-Type'] = 'application/json'
    const res = await fetch(url, {
      method: 'POST',
      headers,
      ...(body ? {body: JSON.stringify(body)} : {}),
    })
    if (res.status === 401) return {ok: false, error: {kind: 'signed_out'}}
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

function badResponse(): {ok: false; error: LiveError} {
  return {ok: false, error: {kind: 'bad_response'}}
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function readToken(x: unknown): LiveToken | null {
  if (!isObject(x)) return null
  const {token, expiresAt} = x
  if (typeof token !== 'string' || !token) return null
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null
  return {token, expiresAt}
}

function readSession(x: unknown): LiveSession | null {
  if (!isObject(x)) return null
  const t = readToken(x)
  const {sid, region, wsUrl, consentRequired, recordPolicy, reused} = x
  if (!t) return null
  if (typeof sid !== 'string' || !SID_RE.test(sid)) return null
  if (typeof region !== 'string' || !region) return null
  if (typeof wsUrl !== 'string' || !/^wss?:\/\//.test(wsUrl)) return null
  if (
    !Array.isArray(consentRequired) ||
    !consentRequired.every(c => typeof c === 'string')
  ) {
    return null
  }
  if (typeof recordPolicy !== 'string') return null
  return {
    sid,
    region,
    wsUrl,
    token: t.token,
    expiresAt: t.expiresAt,
    consentRequired: consentRequired as string[],
    recordPolicy,
    reused: reused === true,
  }
}
