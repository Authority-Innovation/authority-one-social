/**
 * Who may see member content on the client, kept apart from the components so
 * the rule can be tested without rendering. The runtime enforces this on the
 * server; these only decide what the app shows.
 */
import {type CommunitiesError} from '#/lib/agent-runtime/communitiesClient'
import {type CommunityDescriptor, postsSource} from './descriptor'

/**
 * Whether the door refused a member read because the caller is not a member.
 * It answers 404 to a non-member so as not to confirm a community exists, so a
 * 404 can't be told apart from a community that isn't there.
 */
export function isMembershipRefusal(error: CommunitiesError | undefined) {
  return error?.kind === 'http' && (error.status === 403 || error.status === 404)
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
