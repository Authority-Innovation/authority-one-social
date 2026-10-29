/**
 * Thread-side shapes for the community agent slot. Posts, authors and sources
 * are the door contract's (doorContract.ts): an item is `{id, parentId,
 * authorId, text, createdAt}` plus, while the runtime's agent flag is on,
 * `is_agent`, `author: {did, is_agent}`, `sources` and `no_source`. Items
 * carry no role, no sponsor, no display name and no avatar.
 */
import {type Community} from '#/lib/agent-runtime/communitiesClient'
import {
  type DoorItem,
  type DoorItemAuthor,
  type DoorItemSource,
} from '#/lib/communities/doorContract'

/**
 * What the agent slot needs to know about the community: the member
 * community response's own fields, as communitiesClient returns them. `agent`
 * is the config's agent DID (N1); `agentSponsor` is the runtime's sponsor
 * view `{did, handle}`. Without `agentSponsor` no agent label is shown.
 */
export type CommunityAgentConfig = Pick<
  Community,
  'id' | 'name' | 'viewerIsAdmin' | 'agent' | 'agentSponsor'
>

export type CommunitySource = DoorItemSource

/**
 * An item's author. Absent fields (an older item, or the agent flag off)
 * read as a member.
 */
export type CommunityThreadAuthor = Partial<DoorItemAuthor>

export type CommunityThreadPostData = DoorItem
