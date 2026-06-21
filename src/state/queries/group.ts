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
 *            group-AppView service DID (see TODO on `callGroupAppView`).
 *
 * STATUS: interfaces + flow are real; every network call is TODO-marked and the
 * record/response types are hand-written stand-ins.
 *   TODO(codegen): replace the local interfaces below with @atproto/lex-cli
 *   output (ComAuthorityoneGroup*) once the lexicons are wired into codegen.
 *   See groups-lexicon-design.md §7 open question #4.
 */
import {
  type AppBskyActorDefs,
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
import {type ImageMeta} from '#/state/gallery'
import {STALE} from '#/state/queries'
import {useAgent, useSession} from '#/state/session'

// ---------------------------------------------------------------------------
// NSIDs (single source of truth; see /lexicons/com/authorityone/group/)
// ---------------------------------------------------------------------------
export const GROUP_PROFILE = 'com.authorityone.group.profile'
export const GROUP_MEMBERSHIP = 'com.authorityone.group.membership'
export const GROUP_POST = 'com.authorityone.group.post'
export const GROUP_INVITE = 'com.authorityone.group.invite'

// ---------------------------------------------------------------------------
// Hand-written types — TODO(codegen): replace with generated lexicon types.
// ---------------------------------------------------------------------------
export type GroupVisibility =
  | 'com.authorityone.group.defs#public'
  | 'com.authorityone.group.defs#unlisted'
  | 'com.authorityone.group.defs#visPrivate'
export type AdmissionPolicy =
  | 'com.authorityone.group.defs#open'
  | 'com.authorityone.group.defs#request'
  | 'com.authorityone.group.defs#inviteOnly'
  | 'com.authorityone.group.defs#closed'
export type PostingPolicy =
  | 'com.authorityone.group.defs#postMembers'
  | 'com.authorityone.group.defs#postAdmins'
  | 'com.authorityone.group.defs#postAnyone'
export type GroupRole =
  | 'com.authorityone.group.defs#member'
  | 'com.authorityone.group.defs#moderator'
  | 'com.authorityone.group.defs#admin'
  | 'com.authorityone.group.defs#owner'
export type MembershipStatus =
  | 'com.authorityone.group.defs#active'
  | 'com.authorityone.group.defs#pending'
  | 'com.authorityone.group.defs#invited'
  | 'com.authorityone.group.defs#banned'
  | 'com.authorityone.group.defs#left'

export interface GroupView {
  uri: string
  cid: string
  creator: string
  name: string
  description?: string
  visibility?: GroupVisibility
  admissionPolicy?: AdmissionPolicy
  postingPolicy?: PostingPolicy
  avatar?: string
  banner?: string
  memberCount?: number
  viewer?: {
    membership?: string
    role?: GroupRole
    status?: MembershipStatus
    canPost?: boolean
    canJoin?: boolean
  }
  indexedAt: string
}

export interface MemberView {
  subject: AppBskyActorDefs.ProfileView
  membership?: string
  role: GroupRole
  status: MembershipStatus
  createdAt?: string
}

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
// TODO(appview): route com.authorityone.group.get* through our group-AppView
// service DID, mirroring how the fork proxies bsky XRPC via
// EXPO_PUBLIC_BLUESKY_PROXY_DID (src/env/common.ts). Add an
// EXPO_PUBLIC_AUTHORITYONE_GROUP_PROXY_DID env + `agent.withProxy(...)` here so
// these never fall back to bsky's public AppView (Day 2 leak hazard).
// ---------------------------------------------------------------------------
async function callGroupAppView<T>(
  agent: ReturnType<typeof useAgent>,
  nsid: string,
  params: Record<string, unknown>,
): Promise<T> {
  // TODO: const proxied = agent.withProxy('authority_one_group', GROUP_PROXY_DID)
  const res = await agent.call(nsid, params)
  return res.data as T
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
      return callGroupAppView(agent, 'com.authorityone.group.getTimeline', {
        group: uri,
        limit: 50,
        cursor: pageParam,
      })
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

      // TODO(codegen): type `record` as ComAuthorityoneGroupProfile.Record.
      const record: Record<string, unknown> = {
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
