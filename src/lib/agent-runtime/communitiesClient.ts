/**
 * COMMUNITIES client - /app/communities[/:id/...] on the agent runtime.
 *
 * Members-tier community content (posts, replies, media refs, exports) is only
 * ever reached through this client. It never calls the PDS: no
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

export type CommunityRole = 'owner' | 'moderator' | 'member'

export type Community = {
  id: string
  name: string
  description?: string | null
  /** Header-only accent (N3: never a whole-app reskin). */
  accent?: string | null
  /** The community's agent, from the community config (N1). */
  agentDid?: string | null
  memberCount?: number
  /** The caller's role, absent when the caller is not a member. */
  role?: CommunityRole | null
  /** Consent version the caller must accept to join. */
  consentVersion?: string | null
  /** Whether the caller lets the community agent read their content. */
  agentGrant?: boolean
}

export type CommunityMembership = {
  communityId: string
  role: CommunityRole
  consentVersion: string
  joinedAt?: string | null
}

/**
 * A reference to media already held by the runtime's members-only store. This
 * client never uploads media anywhere; it only names what the runtime holds.
 */
export type CommunityMediaRef = {
  mediaId: string
  alt?: string
}

export type CommunityPostAuthor = {
  displayName: string
  avatar?: string | null
  /** Runtime-supplied agent flag (N1). Never inferred from a handle. */
  is_agent: boolean
}

export type CommunityPost = {
  id: string
  author: CommunityPostAuthor
  body: string
  media?: CommunityMediaRef[]
  parentId?: string | null
  createdAt: string
  mine?: boolean
}

export type CommunityTimelinePage = {
  posts: CommunityPost[]
  cursor?: string
}

export type CommunityExport = {
  communityId: string
  generatedAt?: string
  posts: CommunityPost[]
}

export type AgentGrantState = {
  agentGrant: boolean
}

const COMMUNITIES_ENDPOINT = `${AGENT_RUNTIME_BASE_URL}/app/communities`

function communityUrl(id: string, ...rest: string[]): string {
  return [COMMUNITIES_ENDPOINT, id, ...rest].map(encodeSegment).join('/')
}

function encodeSegment(segment: string, index: number): string {
  // The first segment is the base endpoint; everything after is a path part.
  return index === 0 ? segment : encodeURIComponent(segment)
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
 * an empty body) on 2xx, a typed error otherwise. Never throws.
 */
async function request(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  body?: Record<string, unknown>,
): Promise<CommunitiesResult<unknown>> {
  try {
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

function done(result: CommunitiesResult<unknown>): CommunitiesResult<null> {
  return result.ok ? {ok: true, data: null} : result
}

/** Communities the signed-in person belongs to. */
export async function listMyCommunities(): Promise<
  CommunitiesResult<Community[]>
> {
  const res = await request('GET', COMMUNITIES_ENDPOINT)
  return field(res, 'communities', isArray) as CommunitiesResult<Community[]>
}

/** One community's public-to-members details. */
export async function getCommunity(
  id: string,
): Promise<CommunitiesResult<Community>> {
  if (!validId(id)) return invalid('community id is required')
  const res = await request('GET', communityUrl(id))
  return field(res, 'community', isObject) as CommunitiesResult<Community>
}

/** Join, recording consent to the given consent version. */
export async function join(
  id: string,
  consentVersion: string,
): Promise<CommunitiesResult<CommunityMembership>> {
  if (!validId(id)) return invalid('community id is required')
  if (!validId(consentVersion)) return invalid('consent version is required')
  const res = await request('POST', communityUrl(id, 'join'), {consentVersion})
  return field(
    res,
    'membership',
    isObject,
  ) as CommunitiesResult<CommunityMembership>
}

/** Leave a community. */
export async function leave(id: string): Promise<CommunitiesResult<null>> {
  if (!validId(id)) return invalid('community id is required')
  return done(await request('POST', communityUrl(id, 'leave')))
}

/** One page of the members-only timeline. */
export async function getTimeline(
  id: string,
  cursor?: string,
): Promise<CommunitiesResult<CommunityTimelinePage>> {
  if (!validId(id)) return invalid('community id is required')
  const base = communityUrl(id, 'timeline')
  const url = cursor ? `${base}?cursor=${encodeURIComponent(cursor)}` : base
  const res = await request('GET', url)
  const posts = field(res, 'posts', isArray)
  if (!posts.ok) return posts
  const data = res.ok && isObject(res.data) ? res.data : {}
  return {
    ok: true,
    data: {
      posts: posts.data as CommunityPost[],
      ...(typeof data.cursor === 'string' ? {cursor: data.cursor} : {}),
    },
  }
}

function mediaRefs(
  media: CommunityMediaRef[] | undefined,
): CommunityMediaRef[] {
  if (!Array.isArray(media)) return []
  return media
    .filter(m => isObject(m) && validId(m.mediaId))
    .map(m => (m.alt ? {mediaId: m.mediaId, alt: m.alt} : {mediaId: m.mediaId}))
}

/** New members-only post. Media are refs into the runtime's store. */
export async function post(
  id: string,
  body: string,
  media?: CommunityMediaRef[],
): Promise<CommunitiesResult<CommunityPost>> {
  if (!validId(id)) return invalid('community id is required')
  if (typeof body !== 'string') return invalid('post body is required')
  const refs = mediaRefs(media)
  if (!body.trim() && refs.length === 0) return invalid('post is empty')
  const res = await request('POST', communityUrl(id, 'posts'), {
    body,
    media: refs,
  })
  return field(res, 'post', isObject) as CommunitiesResult<CommunityPost>
}

/** Reply to a members-only post. */
export async function reply(
  id: string,
  parent: string,
  body: string,
): Promise<CommunitiesResult<CommunityPost>> {
  if (!validId(id)) return invalid('community id is required')
  if (!validId(parent)) return invalid('parent post id is required')
  if (typeof body !== 'string' || !body.trim()) {
    return invalid('reply body is required')
  }
  const res = await request(
    'POST',
    communityUrl(id, 'posts', parent, 'replies'),
    {body},
  )
  return field(res, 'post', isObject) as CommunitiesResult<CommunityPost>
}

/** Delete one of the caller's own posts. The runtime enforces ownership. */
export async function deleteMine(
  id: string,
  postId: string,
): Promise<CommunitiesResult<null>> {
  if (!validId(id)) return invalid('community id is required')
  if (!validId(postId)) return invalid('post id is required')
  return done(await request('DELETE', communityUrl(id, 'posts', postId)))
}

/** Export the caller's own content in this community. */
export async function exportMine(
  id: string,
): Promise<CommunitiesResult<CommunityExport>> {
  if (!validId(id)) return invalid('community id is required')
  const res = await request('GET', communityUrl(id, 'export'))
  if (!res.ok) return res
  if (!isObject(res.data) || !Array.isArray(res.data.posts)) {
    return badResponse('missing or malformed "posts"')
  }
  return {ok: true, data: res.data as CommunityExport}
}

/** Turn the community agent's access to the caller's content on or off. */
export async function setAgentGrant(
  id: string,
  on: boolean,
): Promise<CommunitiesResult<AgentGrantState>> {
  if (!validId(id)) return invalid('community id is required')
  if (typeof on !== 'boolean') return invalid('grant must be on or off')
  const res = await request('PUT', communityUrl(id, 'agent-grant'), {on})
  const grant = field(res, 'agentGrant', isBool)
  return grant.ok ? {ok: true, data: {agentGrant: grant.data}} : grant
}
