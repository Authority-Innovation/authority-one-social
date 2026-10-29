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
 * What the agent slot needs to know about the community. Assembled by the
 * caller: `agentDid` is the door's `agent.did`; the sponsor fields come from
 * the community config, which the door (as of the contract's source commit)
 * does not send to members, so without them no agent label is shown.
 */
export type CommunityAgentConfig = Pick<
  Community,
  'id' | 'name' | 'viewerIsAdmin'
> & {
  /** The config's `agent` DID (N1). */
  agentDid?: string | null
  /** The config's `agentSponsor` DID. No sponsor means no agent label. */
  agentSponsor?: string | null
  /** Display name of the sponsor, resolved by the runtime. */
  agentSponsorName?: string | null
  /** Public page explaining the community's agent. */
  agentDisclosureUrl?: string | null
}

export type CommunitySource = DoorItemSource

/**
 * An item's author. Absent fields (an older item, or the agent flag off)
 * read as a member.
 */
export type CommunityThreadAuthor = Partial<DoorItemAuthor>

export type CommunityThreadPostData = DoorItem
