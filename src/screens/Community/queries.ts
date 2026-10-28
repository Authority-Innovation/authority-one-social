/**
 * Reads for the community home. Members-tier posts come only from the
 * runtime door (`communitiesClient.getTimeline`), and only once the runtime
 * has said the caller is a member. Public-tier communities read through the
 * group AppView (`group.ts`). Nothing here writes, and nothing touches a PDS.
 */
import {
  type InfiniteData,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query'

import * as communitiesClient from '#/lib/agent-runtime/communitiesClient'
import {STALE} from '#/state/queries'
import {createQueryKey} from '#/state/queries/util'
import {COMMUNITIES_ENABLED} from '#/env'
import {type CommunityDescriptor, postsSource, toDescriptor} from './descriptor'

export class CommunityReadError extends Error {
  constructor(public error: communitiesClient.CommunitiesError) {
    super(`community read failed: ${error.kind}`)
  }
}

export const createCommunityQueryKey = (args: {id: string}) =>
  createQueryKey('community', args)

export const createCommunityTimelineQueryKey = (args: {id: string}) =>
  createQueryKey('communityTimeline', args)

export function useCommunityQuery({id}: {id: string}) {
  return useQuery<CommunityDescriptor, CommunityReadError>({
    queryKey: createCommunityQueryKey({id}),
    enabled: COMMUNITIES_ENABLED && !!id,
    staleTime: STALE.MINUTES.ONE,
    async queryFn() {
      const res = await communitiesClient.getCommunity(id)
      if (!res.ok) throw new CommunityReadError(res.error)
      return toDescriptor(id, res.data)
    },
  })
}

/**
 * The members-only timeline. Disabled unless `community` says the caller is
 * a member of a walled community, so a non-member never makes the call.
 */
export function useCommunityTimelineQuery({
  community,
}: {
  community?: CommunityDescriptor
}) {
  const id = community?.id ?? ''
  return useInfiniteQuery<
    communitiesClient.CommunityTimelinePage,
    CommunityReadError,
    InfiniteData<communitiesClient.CommunityTimelinePage>,
    ReturnType<typeof createCommunityTimelineQueryKey>,
    string | undefined
  >({
    queryKey: createCommunityTimelineQueryKey({id}),
    enabled:
      COMMUNITIES_ENABLED &&
      !!community &&
      postsSource(community) === 'runtime',
    initialPageParam: undefined,
    getNextPageParam: page => page.cursor,
    async queryFn({pageParam}) {
      const res = await communitiesClient.getTimeline(id, pageParam)
      if (!res.ok) throw new CommunityReadError(res.error)
      return res.data
    },
  })
}
