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

/**
 * The agent label on a community (N1): the config's agent DID. Only present
 * while the runtime's community agent flag is on.
 */
export type CommunityAgent = {
  did: string
  is_agent: true
}

/** A community as the door returns it (`publicConfig` in door.js). */
export type Community = {
  id: string
  name: string
  description: string | null
  /** Header-only accent (N3: never a whole-app reskin). */
  accent: string | null
  /** The consent wording version this community requires to join. */
  wording_version: number | null
  /**
   * Absent while the community agent flag is off; null when on but there is
   * no valid agent slot.
   */
  agent?: CommunityAgent | null
  /** The runtime's refusal code for a misconfigured agent slot. */
  agent_error?: string
  /**
   * Whether the signed-in caller is a current admin of this community. Only an
   * admin may launch (sponsor) the community agent. The runtime does not
   * return this yet, so it is optional and anything but `true` means not an
   * admin (see `isCommunityAdmin`).
   */
  viewerIsAdmin?: boolean
}

/** What a non-member is told before joining (GET /:id/join-info). */
export type CommunityJoinInfo = {
  wording_version: number | null
}

export type CommunityJoinResult = {
  community: Community
  joined: boolean
}

/** A source an agent item cites (`normaliseSources` in agent-slot.js). */
export type CommunityItemSource = {
  title: string | null
  kind: string | null
  ref: string | null
  at: string | null
}

/**
 * One post or reply (`publicItem` in door.js). `is_agent` is runtime-supplied
 * and never inferred from the author; it, `sources` and `no_source` are only
 * present while the community agent flag is on.
 */
export type CommunityItem = {
  id: string
  parentId: string | null
  authorId: string
  text: string
  createdAt: string
  is_agent?: boolean
  sources?: CommunityItemSource[]
  no_source?: boolean
}

export type CommunityTimelinePage = {
  items: CommunityItem[]
  cursor: string | null
}

export type CommunityExport = {
  communityId: string
  items: CommunityItem[]
}

export type AgentGrantState = {
  communityId: string
  on: boolean
}

const COMMUNITIES_PATH = '/app/communities'

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
  return field(res, 'communities', isArray) as CommunitiesResult<Community[]>
}

/** One community's members-only details. */
export async function getCommunity(
  id: string,
): Promise<CommunitiesResult<Community>> {
  if (!validId(id)) return invalid('community id is required')
  const res = await request('GET', [id])
  return field(res, 'community', isObject) as CommunitiesResult<Community>
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
    data: {community: data.community as Community, joined: data.joined},
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
