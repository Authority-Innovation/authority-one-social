/**
 * Moderation rules for the community home, kept apart from the components so
 * they can be tested without rendering. Pure: no React, no I/O.
 *
 * The runtime decides who may do what. These only decide what to offer, and how
 * to describe the answer. The door has no moderation routes yet (see the client),
 * so `not_available` is the expected answer until it does, and the app has to
 * say so rather than imply that a report was received.
 */
import {type CommunitiesResult} from '#/lib/agent-runtime/communitiesClient'
import {type MemberPostRowData} from './memberRows'

export type ModerationOutcome =
  | 'done'
  | 'not_available'
  | 'not_allowed'
  | 'failed'

export function moderationOutcome(
  result: CommunitiesResult<unknown>,
): ModerationOutcome {
  if (result.ok) return 'done'
  if (result.error.kind !== 'http') return 'failed'
  if (result.error.status === 404) return 'not_available'
  return result.error.status === 403 ? 'not_allowed' : 'failed'
}

export type ModerationAction =
  | 'report'
  | 'block'
  | 'remove-post'
  | 'remove-member'
  | 'ban'

/** What to offer on a post. Your own post has Delete instead. */
export function moderationActionsFor({
  own,
  isAdmin,
  hasMemberId,
}: {
  own: boolean
  isAdmin: boolean
  hasMemberId: boolean
}): ModerationAction[] {
  if (own) return []
  const actions: ModerationAction[] = ['report']
  if (hasMemberId) actions.push('block')
  if (isAdmin) {
    actions.push('remove-post')
    if (hasMemberId) actions.push('remove-member', 'ban')
  }
  return actions
}

/** Blocked members, by community id. */
export type BlockedMembers = Record<string, string[]>

export function addBlocked(
  blocked: BlockedMembers | undefined,
  communityId: string,
  key: string,
): BlockedMembers {
  const list = blocked?.[communityId] ?? []
  return {
    ...blocked,
    [communityId]: list.includes(key) ? list : [...list, key],
  }
}

/** The ids a member can appear under: old items carry only a handle. */
export function blockKeysFor(
  post: Pick<MemberPostRowData, 'author' | 'authorHandle'>,
): string[] {
  return [post.author.did, post.authorHandle].filter(
    (key): key is string => !!key,
  )
}

export function withoutBlocked<
  Row extends Pick<MemberPostRowData, 'author' | 'authorHandle'>,
>(rows: Row[], blocked: string[]): Row[] {
  if (blocked.length === 0) return rows
  return rows.filter(
    row => !blockKeysFor(row).some(key => blocked.includes(key)),
  )
}
