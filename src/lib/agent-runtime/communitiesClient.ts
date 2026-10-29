/**
 * COMMUNITIES client - /app/communities[/:id/...] on the agent runtime.
 *
 * Members-tier community content (posts, replies, exports) is only ever
 * reached through this client. It never calls the PDS: no
 * com.atproto.repo.* writes and no uploadBlob. Every URL is built from
 * AGENT_RUNTIME_BASE_URL.
 *
 * Tenancy is decided by the runtime. The client never sends a tenant id. The
 * only identifiers it sends are the community id (in the path) and, where an
 * operation needs one, a post id (in the path). Request bodies are built field
 * by field so a caller-supplied object can't smuggle extra keys through.
 *
 * Mirrors groupMirrorClient.ts: bearer from the shared runtime token helper,
 * typed results, NEVER throws. Signed-out, non-2xx, network and malformed
 * responses all come back as a typed `CommunitiesError`.
 */
import {
  type DoorAgentGrant,
  type DoorCommunity,
  type DoorCommunityAgent,
  type DoorExport,
  type DoorItem,
  type DoorItemSource,
  type DoorJoinInfo,
  type DoorRoster,
  type DoorRosterEntry,
  type DoorTimelinePage,
} from '#/lib/communities/doorContract'
import {logger} from '#/logger'
import {getAgentRuntimeAccessToken} from './authToken'
import {AGENT_RUNTIME_BASE_URL} from './config'

export type CommunitiesError =
  | {kind: 'signed_out'}
  | {kind: 'invalid_argument'; message: string}
  | {kind: 'http'; status: number; message?: string}
  | {kind: 'network'; message?: string}
  | {kind: 'bad_response'; message?: string}

export type CommunitiesResult<T> =
  | {ok: true; data: T}
  | {ok: false; error: CommunitiesError}

// The response shapes are the door contract, declared once in doorContract.
// The client re-exports them under its own names; only `Community` differs,
// by reading `viewer_is_admin` into `viewerIsAdmin` (see readCommunity).
export type CommunityAgent = DoorCommunityAgent

/** A community as the door returns it (`publicConfig` in door.js). */
export type Community = Omit<DoorCommunity, 'viewer_is_admin'> & {
  /**
   * True only when the runtime says the signed-in caller is a current admin
   * of this community (`viewer_is_admin`). Absent means not an admin.
   */
  viewerIsAdmin?: boolean
}

export type CommunityJoinInfo = DoorJoinInfo

export type CommunityJoinResult = {
  community: Community
  joined: boolean
}

export type CommunityItemSource = DoorItemSource
export type CommunityItem = DoorItem
export type CommunityTimelinePage = DoorTimelinePage
export type CommunityExport = DoorExport
export type CommunityRosterEntry = DoorRosterEntry
export type CommunityThreadRoster = DoorRoster
export type AgentGrantState = DoorAgentGrant

const COMMUNITIES_PATH = '/app/communities'

/**
 * Reads the runtime's `viewer_is_admin` into `viewerIsAdmin`, true only for a
 * literal boolean true. A payload without `viewer_is_admin` passes through
 * without the field (absent means not an admin), and a `viewerIsAdmin` key
 * sent by anything else is dropped so it can never grant admin by itself.
 */
function readCommunity(raw: Record<string, unknown>): Community {
  const {viewerIsAdmin: _ignored, ...rest} = raw
  const community = rest as Community
  return 'viewer_is_admin' in raw
    ? {...community, viewerIsAdmin: raw.viewer_is_admin === true}
    : community
}

/**
 * Builds the URL from encoded path parts. Called inside `request`'s try block
 * because encodeURIComponent throws on a lone surrogate.
 */
function communityUrl(parts: string[], query?: Record<string, string>): string {
  const path = [COMMUNITIES_PATH, ...parts.map(encodeURIComponent)].join('/')
  const qs = query
    ? Object.entries(query)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
    : ''
  return `${AGENT_RUNTIME_BASE_URL}${path}${qs ? `?${qs}` : ''}`
}

function errMsg(e: unknown): string | undefined {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return undefined
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function invalid(message: string): {ok: false; error: CommunitiesError} {
  return {ok: false, error: {kind: 'invalid_argument', message}}
}

function badResponse(message: string): {ok: false; error: CommunitiesError} {
  return {ok: false, error: {kind: 'bad_response', message}}
}

function validId(id: unknown): id is string {
  return typeof id === 'string' && id.trim().length > 0
}

/**
 * One authenticated runtime request. Returns the parsed JSON body (or null for
 * an empty body) on 2xx, a typed error otherwise. Never throws: the URL is
 * built inside the try, so an id that can't be encoded comes back as
 * `invalid_argument` rather than a thrown URIError.
 */
async function request(
  method: 'GET' | 'POST' | 'DELETE',
  parts: string[],
  body?: Record<string, unknown>,
  query?: Record<string, string>,
): Promise<CommunitiesResult<unknown>> {
  try {
    const url = communityUrl(parts, query)
    const token = await getAgentRuntimeAccessToken()
    if (!token) return {ok: false, error: {kind: 'signed_out'}}
    const headers: Record<string, string> = {Authorization: `Bearer ${token}`}
    if (body) headers['Content-Type'] = 'application/json'
    const res = await fetch(url, {
      method,
      headers,
      ...(body ? {body: JSON.stringify(body)} : {}),
    })
    if (res.status === 401) return {ok: false, error: {kind: 'signed_out'}}
    if (!res.ok) {
      return {
        ok: false,
        error: {
          kind: 'http',
          status: res.status,
          message: await readError(res),
        },
      }
    }
    const text = await res.text()
    if (!text) return {ok: true, data: null}
    try {
      return {ok: true, data: JSON.parse(text) as unknown}
    } catch {
      return badResponse('response was not JSON')
    }
  } catch (e) {
    // Checked by name: an error from another realm fails instanceof.
    if (isObject(e) && e.name === 'URIError') {
      return invalid('id could not be encoded')
    }
    logger.warn('communities: request failed', {safeMessage: errMsg(e)})
    return {ok: false, error: {kind: 'network', message: errMsg(e)}}
  }
}

async function readError(res: Response): Promise<string | undefined> {
  try {
    const data = (await res.json()) as unknown
    if (isObject(data) && typeof data.error === 'string') return data.error
    if (isObject(data) && typeof data.message === 'string') return data.message
  } catch {
    // Non-JSON error body; the status alone is enough.
  }
  return undefined
}

function field<T>(
  result: CommunitiesResult<unknown>,
  key: string,
  check: (v: unknown) => v is T,
): CommunitiesResult<T> {
  if (!result.ok) return result
  const data = result.data
  if (!isObject(data) || !check(data[key])) {
    return badResponse(`missing or malformed "${key}"`)
  }
  return {ok: true, data: data[key]}
}

const isArray = (v: unknown): v is unknown[] => Array.isArray(v)
const isBool = (v: unknown): v is boolean => typeof v === 'boolean'
const isVersion = (v: unknown): v is number | null =>
  v === null || (typeof v === 'number' && Number.isFinite(v))

function done(result: CommunitiesResult<unknown>): CommunitiesResult<null> {
  return result.ok ? {ok: true, data: null} : result
}

/** Communities the signed-in person belongs to. */
export async function listMyCommunities(): Promise<
  CommunitiesResult<Community[]>
> {
  const res = await request('GET', [])
  const list = field(res, 'communities', isArray)
  if (!list.ok) return list
  return {
    ok: true,
    data: list.data.map(c =>
      isObject(c) ? readCommunity(c) : (c as Community),
    ),
  }
}

/** One community's members-only details. */
export async function getCommunity(
  id: string,
): Promise<CommunitiesResult<Community>> {
  if (!validId(id)) return invalid('community id is required')
  const res = await request('GET', [id])
  const community = field(res, 'community', isObject)
  if (!community.ok) return community
  return {ok: true, data: readCommunity(community.data)}
}

/**
 * The consent wording version a non-member must accept before `join`. The
 * runtime answers the same body for every id, so this never confirms that a
 * community exists.
 */
export async function getJoinInfo(
  id: string,
): Promise<CommunitiesResult<CommunityJoinInfo>> {
  if (!validId(id)) return invalid('community id is required')
  const res = await request('GET', [id, 'join-info'])
  const version = field(res, 'wording_version', isVersion)
  return version.ok
    ? {ok: true, data: {wording_version: version.data}}
    : version
}

/** Join, recording consent to the given wording version. */
export async function join(
  id: string,
  consentVersion: number,
): Promise<CommunitiesResult<CommunityJoinResult>> {
  if (!validId(id)) return invalid('community id is required')
  if (typeof consentVersion !== 'number' || !Number.isFinite(consentVersion)) {
    return invalid('consent version is required')
  }
  const res = await request('POST', [id, 'join'], {consentVersion})
  if (!res.ok) return res
  const data = res.data
  if (!isObject(data) || !isObject(data.community) || !isBool(data.joined)) {
    return badResponse('missing or malformed "community" or "joined"')
  }
  return {
    ok: true,
    data: {community: readCommunity(data.community), joined: data.joined},
  }
}

/** Leave a community. */
export async function leave(id: string): Promise<CommunitiesResult<null>> {
  if (!validId(id)) return invalid('community id is required')
  return done(await request('POST', [id, 'leave']))
}

/** One page of the members-only timeline. */
export async function getTimeline(
  id: string,
  cursor?: string,
): Promise<CommunitiesResult<CommunityTimelinePage>> {
  if (!validId(id)) return invalid('community id is required')
  const res = await request(
    'GET',
    [id, 'timeline'],
    undefined,
    cursor ? {cursor} : undefined,
  )
  const items = field(res, 'items', isArray)
  if (!items.ok) return items
  const data = res.ok && isObject(res.data) ? res.data : {}
  return {
    ok: true,
    data: {
      items: items.data as CommunityItem[],
      cursor: typeof data.cursor === 'string' ? data.cursor : null,
    },
  }
}

/**
 * The roster of one thread (GET /:id/posts/:postId/roster): the member
 * authors of the post and its replies, plus the community agent. The runtime
 * matches the route only while its community agent flag is on. Malformed
 * entries are dropped.
 */
export async function getThreadRoster(
  id: string,
  postId: string,
): Promise<CommunitiesResult<CommunityThreadRoster>> {
  if (!validId(id)) return invalid('community id is required')
  if (!validId(postId)) return invalid('post id is required')
  const res = await request('GET', [id, 'posts', postId, 'roster'])
  const roster = field(res, 'roster', isArray)
  if (!roster.ok) return roster
  const entries: CommunityRosterEntry[] = []
  for (const e of roster.data) {
    if (!isObject(e) || !validId(e.id)) continue
    entries.push({
      id: e.id,
      did: typeof e.did === 'string' && e.did ? e.did : null,
      is_agent: e.is_agent === true,
    })
  }
  return {ok: true, data: {postId, roster: entries}}
}

/** New members-only post. */
export async function post(
  id: string,
  text: string,
): Promise<CommunitiesResult<CommunityItem>> {
  if (!validId(id)) return invalid('community id is required')
  if (typeof text !== 'string' || !text.trim()) {
    return invalid('post text is required')
  }
  const res = await request('POST', [id, 'posts'], {text})
  return field(res, 'item', isObject) as CommunitiesResult<CommunityItem>
}

/** Reply to a members-only post. */
export async function reply(
  id: string,
  parent: string,
  text: string,
): Promise<CommunitiesResult<CommunityItem>> {
  if (!validId(id)) return invalid('community id is required')
  if (!validId(parent)) return invalid('parent post id is required')
  if (typeof text !== 'string' || !text.trim()) {
    return invalid('reply text is required')
  }
  const res = await request('POST', [id, 'posts', parent, 'replies'], {text})
  return field(res, 'item', isObject) as CommunitiesResult<CommunityItem>
}

/** Delete one of the caller's own posts. The runtime enforces ownership. */
export async function deleteMine(
  id: string,
  postId: string,
): Promise<CommunitiesResult<null>> {
  if (!validId(id)) return invalid('community id is required')
  if (!validId(postId)) return invalid('post id is required')
  return done(await request('DELETE', [id, 'posts', postId]))
}

/** Export the caller's own content in this community. */
export async function exportMine(
  id: string,
): Promise<CommunitiesResult<CommunityExport>> {
  if (!validId(id)) return invalid('community id is required')
  const res = await request('GET', [id, 'export'])
  if (!res.ok) return res
  const data = res.data
  if (
    !isObject(data) ||
    typeof data.communityId !== 'string' ||
    !Array.isArray(data.items)
  ) {
    return badResponse('missing or malformed "communityId" or "items"')
  }
  return {
    ok: true,
    data: {communityId: data.communityId, items: data.items as CommunityItem[]},
  }
}

function grantState(
  res: CommunitiesResult<unknown>,
): CommunitiesResult<AgentGrantState> {
  if (!res.ok) return res
  const data = res.data
  if (
    !isObject(data) ||
    typeof data.communityId !== 'string' ||
    !isBool(data.on)
  ) {
    return badResponse('missing or malformed "communityId" or "on"')
  }
  return {ok: true, data: {communityId: data.communityId, on: data.on}}
}

/** Whether the caller lets the community agent read their content. */
export async function getAgentGrant(
  id: string,
): Promise<CommunitiesResult<AgentGrantState>> {
  if (!validId(id)) return invalid('community id is required')
  return grantState(await request('GET', [id, 'agent-grant']))
}

/** Turn the community agent's access to the caller's content on or off. */
export async function setAgentGrant(
  id: string,
  on: boolean,
): Promise<CommunitiesResult<AgentGrantState>> {
  if (!validId(id)) return invalid('community id is required')
  if (typeof on !== 'boolean') return invalid('grant must be on or off')
  return grantState(await request('POST', [id, 'agent-grant'], {on}))
}

/**
 * Launch (sponsor) the community agent. Admin-only: the runtime decides, and
 * refuses anyone who is not a current admin. The app only offers the control
 * to an admin (`isCommunityAdmin` in `#/features/communityAgent`). No body
 * is sent.
 */
export async function launchCommunityAgent(
  id: string,
): Promise<CommunitiesResult<null>> {
  if (!validId(id)) return invalid('community id is required')
  return done(await request('POST', [id, 'agent', 'launch']))
}
