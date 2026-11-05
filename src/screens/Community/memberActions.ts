/**
 * Member actions on a community, kept apart from the components so the rules
 * can be tested without rendering.
 */
import {
  type CommunityExport,
  leave,
  setAgentGrant,
} from '#/lib/agent-runtime/communitiesClient'
import {type MemberPostRowData} from './memberRows'

export type LeaveOutcome =
  | {ok: true}
  | {ok: false; reason: 'grant_off_failed' | 'leave_failed'}

export type LeaveClient = {
  leave: typeof leave
  setAgentGrant: typeof setAgentGrant
}

const defaultClient: LeaveClient = {leave, setAgentGrant}

/**
 * Leaves a community, turning the agent grant off first. The runtime keeps the
 * grant after a leave, so otherwise the community agent could go on reading a
 * former member's posts. If the grant can't be turned off the person stays a
 * member, and can still see and change it. A 404 means the runtime's agent
 * route is off, so there is no grant to turn off.
 */
export async function leaveCommunity(
  id: string,
  client: LeaveClient = defaultClient,
): Promise<LeaveOutcome> {
  const grant = await client.setAgentGrant(id, false)
  if (
    !grant.ok &&
    !(grant.error.kind === 'http' && grant.error.status === 404)
  ) {
    return {ok: false, reason: 'grant_off_failed'}
  }
  const left = await client.leave(id)
  return left.ok ? {ok: true} : {ok: false, reason: 'leave_failed'}
}

/**
 * Whether to offer "Delete" on a row. The runtime enforces ownership; this only
 * decides what to show. The handle is used only for an old item with no stored
 * DID, because a handle can later belong to someone else.
 */
export function isOwnPost(
  post: Pick<MemberPostRowData, 'author' | 'authorHandle'>,
  viewer: {did: string; handle?: string} | undefined,
): boolean {
  if (!viewer) return false
  if (post.author.did) return post.author.did === viewer.did
  return !!viewer.handle && post.authorHandle === viewer.handle
}

/** What the export hands to the share sheet. */
export function exportText(data: CommunityExport): string {
  return JSON.stringify(data, null, 2)
}
