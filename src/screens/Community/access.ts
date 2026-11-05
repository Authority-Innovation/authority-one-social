/**
 * Who may see member content on the client, kept apart from the components so
 * the rule can be tested without rendering. The runtime enforces this on the
 * server; these only decide what the app shows.
 */
import {
  type CommunitiesError,
  type CommunitiesResult,
  getCommunity,
  listMyCommunities,
} from '#/lib/agent-runtime/communitiesClient'
import {
  type CommunityDescriptor,
  doorStatesMembership,
  postsSource,
  toDescriptor,
} from './descriptor'

/**
 * Whether the door refused a member read because the caller is not a member.
 * It answers 404 to a non-member so as not to confirm a community exists, so a
 * 404 can't be told apart from a community that isn't there.
 */
export function isMembershipRefusal(error: CommunitiesError | undefined) {
  return error?.kind === 'http' && (error.status === 403 || error.status === 404)
}

export type CommunityHomeClient = {
  getCommunity: typeof getCommunity
  listMyCommunities: typeof listMyCommunities
}

const defaultClient: CommunityHomeClient = {getCommunity, listMyCommunities}

/**
 * The home's descriptor, with the caller's membership settled. With its admin
 * role off the door says nothing about membership, so the join record (the
 * caller's own community list) decides, read fresh so a join shows at once.
 *
 * If that list can't be read, membership is unknown and this fails: the home
 * shows its error state, with no member content, wall or Join button. The
 * failure is never passed on as a refusal, because a 404 from the door can be
 * a store failure, and a refusal would offer Join to someone already in.
 */
export async function readCommunityHome(
  id: string,
  client: CommunityHomeClient = defaultClient,
): Promise<CommunitiesResult<CommunityDescriptor>> {
  const community = await client.getCommunity(id)
  if (!community.ok) return community
  if (doorStatesMembership(community.data)) {
    return {ok: true, data: toDescriptor(id, community.data)}
  }
  const mine = await client.listMyCommunities()
  if (!mine.ok) {
    return {
      ok: false,
      error: {kind: 'bad_response', message: 'membership unknown'},
    }
  }
  const joined = mine.data.some(c => c?.id === id)
  return {ok: true, data: toDescriptor(id, community.data, {joined})}
}

/**
 * Whether to show members-tier posts and rosters. A refusal wins over a cached
 * descriptor: it may say "member" for up to a minute after the door stops
 * agreeing, and a failed refetch keeps the old pages in the query's data.
 */
export function canShowMemberContent(
  community: Pick<CommunityDescriptor, 'tier' | 'isMember' | 'groupUri'>,
  readError: CommunitiesError | undefined,
) {
  return postsSource(community) === 'runtime' && !isMembershipRefusal(readError)
}
