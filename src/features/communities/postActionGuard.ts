/**
 * The one guard for post actions that assume a real at:// record.
 *
 * Members-tier items (see membersPost.ts) are not atproto records. Liking,
 * reposting, quoting, bookmarking or reporting one through the normal path
 * would send its synthetic uri to a PDS or AppView, and quoting, sharing or
 * translating it would copy members content out of the walled store. So every
 * such action is either disabled or routed to the door, the community screen
 * that reads and writes through communitiesClient.
 *
 * Every caller asks this function. Do not add per-component checks.
 */
import {isMembersPostUri, parseMembersPostUri} from './membersPost'

export type PostAction =
  | 'like'
  | 'repost'
  | 'quote'
  | 'reply'
  | 'share-link'
  | 'copy-link'
  | 'embed'
  | 'bookmark'
  | 'send-via-dm'
  | 'open-thread'
  | 'open-author'
  | 'translate'
  | 'mute-thread'
  | 'hide-reply'
  | 'pin'
  | 'report'
  | 'delete'
  | 'copy-text'

export type PostActionGuard =
  | {kind: 'allow'}
  | {kind: 'disabled'}
  | {kind: 'door'; communityId: string; postId: string}

/**
 * What a members item does for each action. `door` sends the person to the
 * community screen, which owns the members-tier write path.
 */
export const MEMBERS_POST_ACTIONS: Record<PostAction, 'disabled' | 'door'> = {
  like: 'disabled',
  repost: 'disabled',
  quote: 'disabled',
  reply: 'door',
  'share-link': 'disabled',
  'copy-link': 'disabled',
  embed: 'disabled',
  bookmark: 'disabled',
  'send-via-dm': 'disabled',
  'open-thread': 'door',
  'open-author': 'disabled',
  // The translate link sends the text to a third party.
  translate: 'disabled',
  'mute-thread': 'disabled',
  'hide-reply': 'disabled',
  pin: 'disabled',
  report: 'door',
  delete: 'door',
  // Copying to the local clipboard never leaves the device, but the members
  // view has no post menu, so there is nowhere to offer it.
  'copy-text': 'disabled',
}

const ALLOW: PostActionGuard = {kind: 'allow'}
const DISABLED: PostActionGuard = {kind: 'disabled'}

export function guardPostAction(
  post: {uri: string},
  action: PostAction,
): PostActionGuard {
  if (!isMembersPostUri(post.uri)) return ALLOW
  const members = parseMembersPostUri(post.uri)
  // A members-scheme uri that does not parse is still not a record.
  if (!members) return DISABLED
  const rule = MEMBERS_POST_ACTIONS[action]
  if (rule === 'door') {
    return {kind: 'door', ...members}
  }
  return DISABLED
}

export function isPostActionAllowed(
  post: {uri: string},
  action: PostAction,
): boolean {
  return guardPostAction(post, action).kind === 'allow'
}

/** Route path of the door for a members item. */
export function doorHref(guard: PostActionGuard): string | undefined {
  return guard.kind === 'door'
    ? `/c/${encodeURIComponent(guard.communityId)}`
    : undefined
}
