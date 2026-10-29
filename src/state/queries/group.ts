/**
 * Authority One Social — Groups data layer (SCAFFOLD, 2026-06-13).
 *
 * Mirrors src/state/queries/list.ts + list-members.ts. Implements the client
 * side of the com.authorityone.group.* lexicon (see groups-lexicon-design.md +
 * /lexicons/com/authorityone/group/*.json at the spike-repo root).
 *
 * Writes  -> com.atproto.repo.createRecord/deleteRecord on the bare PDS
 *            (no AppView needed; same as posting/listitem today).
 * Reads   -> our Authority One AppView XRPC (com.authorityone.group.get*),
 *            NOT the bare PDS and NOT bsky's AppView. Routed through a dedicated
 *            group-AppView service DID (see `callGroupAppView`).
 *
 * STATUS: reads go to the group AppView only when it is configured (see
 * `resolveGroupAppViewProxy`); otherwise they throw GroupAppViewUnavailableError
 * and nothing is sent. The record/response types are generated from /lexicons
 * by `pnpm lexgen` (src/lib/lexicon/generated).
 */
import {
  type AppBskyFeedDefs,
  AtUri,
  type ComAtprotoRepoStrongRef,
} from '@atproto/api'
import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import {uploadBlob} from '#/lib/api'
import {until} from '#/lib/async/until'
import {
  type ComAuthorityoneGroupDefs,
  type ComAuthorityoneGroupGetMemberships,
  type ComAuthorityoneGroupGetTimeline,
  type ComAuthorityoneGroupProfile,
} from '#/lib/lexicon/generated'
import {type ImageMeta} from '#/state/gallery'
import {STALE} from '#/state/queries'
import {useAgent, useSession} from '#/state/session'
import {
  AUTHORITYONE_GROUP_PROXY_DID,
  AUTHORITYONE_GROUP_SERVICE_ID,
} from '#/env'

// ---------------------------------------------------------------------------
// NSIDs (single source of truth; see /lexicons/com/authorityone/group/)
// ---------------------------------------------------------------------------
export const GROUP_PROFILE = 'com.authorityone.group.profile'
export const GROUP_MEMBERSHIP = 'com.authorityone.group.membership'
export const GROUP_POST = 'com.authorityone.group.post'
export const GROUP_INVITE = 'com.authorityone.group.invite'

// ---------------------------------------------------------------------------
// Types, generated from /lexicons (see scripts/lexgen.mjs). Re-exported under
// their original names so callers do not change.
// ---------------------------------------------------------------------------
export type GroupVisibility = ComAuthorityoneGroupDefs.Visibility
export type AdmissionPolicy = ComAuthorityoneGroupDefs.AdmissionPolicy
export type PostingPolicy = ComAuthorityoneGroupDefs.PostingPolicy
export type GroupRole = ComAuthorityoneGroupDefs.Role
export type MembershipStatus = ComAuthorityoneGroupDefs.MembershipStatus
export type GroupView = ComAuthorityoneGroupDefs.GroupView
export type MemberView = ComAuthorityoneGroupDefs.MemberView

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const RQKEY_ROOT = 'group'
export const RQKEY = (uri: string) => [RQKEY_ROOT, uri]
export const TIMELINE_RQKEY = (uri: string) => [RQKEY_ROOT, 'timeline', uri]
export const MEMBERS_RQKEY = (uri: string) => [RQKEY_ROOT, 'members', uri]
export const MY_GROUPS_RQKEY = (did: string) => [RQKEY_ROOT, 'memberships', did]

// ---------------------------------------------------------------------------
// AppView transport helper.
// com.authorityone.group.get* is proxied to our group AppView, named by
// EXPO_PUBLIC_AUTHORITYONE_GROUP_PROXY_DID (+ _SERVICE_ID). Without an explicit
// per-call header the agent would apply its default bsky_appview proxy, so the
// header is always set here. When the DID is unset (or names a bsky service)
// the read is refused with GroupAppViewUnavailableError and nothing is sent.
// ---------------------------------------------------------------------------

/** Thrown, without any network call, when no group AppView is configured. */
export class GroupAppViewUnavailableError extends Error {
  constructor(reason: string) {
    super(`group AppView not available: ${reason}`)
    this.name = 'GroupAppViewUnavailableError'
  }
}

export function isGroupAppViewUnavailableError(
  e: unknown,
): e is GroupAppViewUnavailableError {
  return e instanceof GroupAppViewUnavailableError
}

// Never valid as a group proxy target (contract: never proxy to bsky).
const FORBIDDEN_GROUP_PROXY_DIDS = new Set([
  'did:web:api.bsky.app',
  'did:web:bsky.app',
  'did:web:api.bsky.chat',
  'did:web:api.staging.bsky.dev',
])

/**
 * The `atproto-proxy` header value for group reads, or why there is none.
 * Takes its inputs as args so it can be tested without reloading the env.
 */
export function resolveGroupAppViewProxy({
  did = AUTHORITYONE_GROUP_PROXY_DID,
  serviceId = AUTHORITYONE_GROUP_SERVICE_ID,
}: {did?: string; serviceId?: string} = {}):
  | {ok: true; header: string}
  | {ok: false; reason: string} {
  if (!did) {
    return {ok: false, reason: 'EXPO_PUBLIC_AUTHORITYONE_GROUP_PROXY_DID unset'}
  }
  if (!did.startsWith('did:') || did.includes('#')) {
    return {ok: false, reason: 'group proxy DID is malformed'}
  }
  if (FORBIDDEN_GROUP_PROXY_DIDS.has(did)) {
    return {ok: false, reason: 'group proxy DID is a bsky service'}
  }
  if (!serviceId || serviceId.includes('#') || serviceId.startsWith('bsky_')) {
    return {ok: false, reason: 'group proxy service id is invalid'}
  }
  return {ok: true, header: `${did}#${serviceId}`}
}

async function callGroupAppView<T>(
  agent: ReturnType<typeof useAgent>,
  nsid: string,
  params: Record<string, unknown>,
): Promise<T> {
  const proxy = resolveGroupAppViewProxy()
  if (!proxy.ok) throw new GroupAppViewUnavailableError(proxy.reason)
  const res = await agent.call(nsid, params, undefined, {
    headers: {'atproto-proxy': proxy.header},
  })
  return res.data as T
}

/**
 * Thrown when the group AppView answers getTimeline with a body that does not
 * match the lexicon output (`{cursor?, feed: feedViewPost[]}`).
 */
export class GroupTimelineResponseError extends Error {
  constructor(reason: string) {
    super(`group AppView getTimeline response malformed: ${reason}`)
    this.name = 'GroupTimelineResponseError'
  }
}

const GROUP_TIMELINE_MAX_LIMIT = 100 // lexicon getTimeline.limit maximum

function clampTimelineLimit(limit: number) {
  if (!Number.isFinite(limit)) return 50
  return Math.min(GROUP_TIMELINE_MAX_LIMIT, Math.max(1, Math.floor(limit)))
}

function isUsableFeedViewPost(
  item: unknown,
): item is AppBskyFeedDefs.FeedViewPost {
  if (!item || typeof item !== 'object') return false
  const post = (item as {post?: unknown}).post
  if (!post || typeof post !== 'object') return false
  const {uri, cid} = post as {uri?: unknown; cid?: unknown}
  return (
    typeof uri === 'string' &&
    uri.startsWith('at://') &&
    typeof cid === 'string'
  )
}

/**
 * Maps a raw getTimeline body onto the lexicon output. A body without a
 * `feed` array is an error; individual items that are not post views are
 * dropped so one bad row cannot break the page.
 */
export function mapGroupTimelineResponse(
  data: unknown,
): ComAuthorityoneGroupGetTimeline.OutputSchema {
  if (!data || typeof data !== 'object') {
    throw new GroupTimelineResponseError('body is not an object')
  }
  const {feed, cursor} = data as {feed?: unknown; cursor?: unknown}
  if (!Array.isArray(feed)) {
    throw new GroupTimelineResponseError('feed is not an array')
  }
  return {
    feed: feed.filter(isUsableFeedViewPost),
    ...(typeof cursor === 'string' && cursor ? {cursor} : {}),
  }
}

/**
 * One page of a group's public-tier timeline from our AppView. Plain function
 * so feed APIs (see lib/api/feed/communities.ts) can share the transport.
 *
 * Public tier only: `group` must be an at:// group URI. Members-only
 * communities are addressed by runtime ids and are read through
 * communitiesClient, never through the group AppView, so any other id is
 * refused here before anything is sent.
 */
export async function fetchGroupTimeline(
  agent: ReturnType<typeof useAgent>,
  {group, cursor, limit = 50}: {group: string; cursor?: string; limit?: number},
) {
  const proxy = resolveGroupAppViewProxy()
  if (!proxy.ok) throw new GroupAppViewUnavailableError(proxy.reason)
  if (!group.startsWith('at://')) {
    throw new GroupAppViewUnavailableError(
      'getTimeline is public tier only; group must be an at:// URI',
    )
  }
  const data = await callGroupAppView<unknown>(
    agent,
    'com.authorityone.group.getTimeline',
    {group, limit: clampTimelineLimit(limit), cursor},
  )
  return mapGroupTimelineResponse(data)
}

/** The groups an actor is an effective member of (public tier). */
export function fetchGroupMemberships(
  agent: ReturnType<typeof useAgent>,
  {actor, cursor, limit = 50}: {actor: string; cursor?: string; limit?: number},
) {
  return callGroupAppView<ComAuthorityoneGroupGetMemberships.OutputSchema>(
    agent,
    'com.authorityone.group.getMemberships',
    {actor, limit, cursor},
  )
}

// ===========================================================================
// READS
// ===========================================================================
export function useGroupQuery(uri?: string) {
  const agent = useAgent()
  return useQuery<GroupView, Error>({
    staleTime: STALE.MINUTES.ONE,
    queryKey: RQKEY(uri || ''),
    enabled: !!uri,
    async queryFn() {
      if (!uri) throw new Error('URI not provided')
      const data = await callGroupAppView<{group: GroupView}>(
        agent,
        'com.authorityone.group.getGroup',
        {group: uri},
      )
      return data.group
    },
  })
}

export function useGroupTimelineQuery(uri?: string) {
  const agent = useAgent()
  return useInfiniteQuery<
    {cursor?: string; feed: AppBskyFeedDefs.FeedViewPost[]},
    Error,
    InfiniteData<{cursor?: string; feed: AppBskyFeedDefs.FeedViewPost[]}>,
    ReturnType<typeof TIMELINE_RQKEY>,
    string | undefined
  >({
    queryKey: TIMELINE_RQKEY(uri || ''),
    enabled: !!uri,
    initialPageParam: undefined,
    getNextPageParam: last => last.cursor,
    async queryFn({pageParam}) {
      if (!uri) throw new Error('URI not provided')
      return fetchGroupTimeline(agent, {group: uri, cursor: pageParam})
    },
  })
}

export function useGroupMembersQuery(uri?: string, status?: MembershipStatus) {
  const agent = useAgent()
  return useInfiniteQuery<
    {cursor?: string; group: GroupView; members: MemberView[]},
    Error,
    InfiniteData<{cursor?: string; group: GroupView; members: MemberView[]}>,
    ReturnType<typeof MEMBERS_RQKEY>,
    string | undefined
  >({
    queryKey: MEMBERS_RQKEY(uri || ''),
    enabled: !!uri,
    initialPageParam: undefined,
    getNextPageParam: last => last.cursor,
    async queryFn({pageParam}) {
      if (!uri) throw new Error('URI not provided')
      return callGroupAppView(agent, 'com.authorityone.group.getMembers', {
        group: uri,
        status,
        limit: 50,
        cursor: pageParam,
      })
    },
  })
}

// ===========================================================================
// WRITES
// ===========================================================================
export interface CreateGroupParams {
  name: string
  description?: string
  purpose?: string
  visibility?: GroupVisibility
  admissionPolicy?: AdmissionPolicy
  postingPolicy?: PostingPolicy
  avatar?: ImageMeta | null
  banner?: ImageMeta | null
}

export function useCreateGroupMutation() {
  const {currentAccount} = useSession()
  const agent = useAgent()
  const queryClient = useQueryClient()
  return useMutation<{uri: string; cid: string}, Error, CreateGroupParams>({
    async mutationFn(params) {
      if (!currentAccount) throw new Error('Not signed in')

      const record: ComAuthorityoneGroupProfile.Record = {
        $type: GROUP_PROFILE,
        name: params.name,
        description: params.description,
        purpose: params.purpose,
        visibility: params.visibility,
        admissionPolicy: params.admissionPolicy,
        postingPolicy: params.postingPolicy,
        createdBy: currentAccount.did,
        createdAt: new Date().toISOString(),
      }
      if (params.avatar) {
        const blob = await uploadBlob(
          agent,
          params.avatar.path,
          params.avatar.mime,
        )
        record.avatar = blob.data.blob
      }
      if (params.banner) {
        const blob = await uploadBlob(
          agent,
          params.banner.path,
          params.banner.mime,
        )
        record.banner = blob.data.blob
      }

      const res = await agent.com.atproto.repo.createRecord({
        repo: currentAccount.did,
        collection: GROUP_PROFILE,
        record,
      })

      // Owner auto-joins as owner (write the membership in our own repo).
      await agent.com.atproto.repo.createRecord({
        repo: currentAccount.did,
        collection: GROUP_MEMBERSHIP,
        record: {
          $type: GROUP_MEMBERSHIP,
          subject: {uri: res.data.uri, cid: res.data.cid},
          role: 'com.authorityone.group.defs#owner',
          status: 'com.authorityone.group.defs#active',
          createdAt: new Date().toISOString(),
        },
      })

      // Wait for our AppView to index (same pattern as list create).
      await whenGroupAppViewReady(agent, res.data.uri)
      return res.data
    },
    onSuccess() {
      if (currentAccount) {
        void queryClient.invalidateQueries({
          queryKey: MY_GROUPS_RQKEY(currentAccount.did),
        })
      }
    },
  })
}

export function useJoinGroupMutation() {
  const {currentAccount} = useSession()
  const agent = useAgent()
  const queryClient = useQueryClient()
  return useMutation<{uri: string}, Error, {group: GroupView}>({
    async mutationFn({group}) {
      if (!currentAccount) throw new Error('Not signed in')

      // Status depends on admission policy: open -> active; request/invite ->
      // pending, awaiting an owner-side invite record / approval (see design §4).
      const open = group.admissionPolicy === 'com.authorityone.group.defs#open'
      const res = await agent.com.atproto.repo.createRecord({
        repo: currentAccount.did,
        collection: GROUP_MEMBERSHIP,
        record: {
          $type: GROUP_MEMBERSHIP,
          subject: {uri: group.uri, cid: group.cid},
          role: 'com.authorityone.group.defs#member',
          status: open
            ? 'com.authorityone.group.defs#active'
            : 'com.authorityone.group.defs#pending',
          createdAt: new Date().toISOString(),
        },
      })
      return {uri: res.data.uri}
    },
    onSuccess() {
      if (currentAccount) {
        void queryClient.invalidateQueries({
          queryKey: MY_GROUPS_RQKEY(currentAccount.did),
        })
      }
    },
  })
}

export function useLeaveGroupMutation() {
  const {currentAccount} = useSession()
  const agent = useAgent()
  const queryClient = useQueryClient()
  // membershipUri = at:// URI of the viewer's own membership record (group.viewer.membership)
  return useMutation<void, Error, {membershipUri: string}>({
    async mutationFn({membershipUri}) {
      if (!currentAccount) throw new Error('Not signed in')
      const {rkey} = new AtUri(membershipUri)
      await agent.com.atproto.repo.deleteRecord({
        repo: currentAccount.did,
        collection: GROUP_MEMBERSHIP,
        rkey,
      })
    },
    onSuccess() {
      if (currentAccount) {
        void queryClient.invalidateQueries({
          queryKey: MY_GROUPS_RQKEY(currentAccount.did),
        })
      }
    },
  })
}

/**
 * Associate an existing post to a group's timeline. The composer calls this
 * AFTER creating the underlying app.bsky.feed.post (see groups-lexicon-design
 * §5: post stays standard; association is a separate record).
 * TODO(composer): wire a "post to group" target into the composer so the two
 * writes happen in one user action.
 */
export function usePostToGroupMutation() {
  const {currentAccount} = useSession()
  const agent = useAgent()
  return useMutation<
    {uri: string},
    Error,
    {post: ComAtprotoRepoStrongRef.Main; group: ComAtprotoRepoStrongRef.Main}
  >({
    async mutationFn({post, group}) {
      if (!currentAccount) throw new Error('Not signed in')
      const res = await agent.com.atproto.repo.createRecord({
        repo: currentAccount.did,
        collection: GROUP_POST,
        record: {
          $type: GROUP_POST,
          subject: post,
          group,
          createdAt: new Date().toISOString(),
        },
      })
      return {uri: res.data.uri}
    },
  })
}

// ---------------------------------------------------------------------------
// Poll our AppView until the new group is indexed (mirrors list.ts
// whenAppViewReady). TODO: tighten the predicate once getGroup is live.
// ---------------------------------------------------------------------------
async function whenGroupAppViewReady(
  agent: ReturnType<typeof useAgent>,
  uri: string,
) {
  await until(
    5, // max attempts
    1e3, // 1s between
    (res: GroupView | null) => typeof res?.uri === 'string',
    async () => {
      try {
        const data = await callGroupAppView<{group: GroupView}>(
          agent,
          'com.authorityone.group.getGroup',
          {group: uri},
        )
        return data.group
      } catch {
        return null
      }
    },
  )
}

export function invalidateMyGroups(queryClient: QueryClient, did: string) {
  void queryClient.invalidateQueries({queryKey: MY_GROUPS_RQKEY(did)})
}
