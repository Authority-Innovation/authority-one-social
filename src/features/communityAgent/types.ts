/**
 * Thread-side shapes for the community agent slot. They extend the W1-T8
 * `communitiesClient` types additively: the runtime is expected to add the
 * author DID, the sources list and the sponsor fields. Everything new is
 * optional so an older runtime payload still renders (as a member).
 */
import {
  type Community,
  type CommunityPost,
  type CommunityPostAuthor,
} from '#/lib/agent-runtime/communitiesClient'

export type CommunityAgentConfig = Pick<Community, 'id' | 'name' | 'role'> & {
  /** The config's `agent` DID (N1). */
  agentDid?: string | null
  /** The config's `agentSponsor` DID. No sponsor means no agent label. */
  agentSponsor?: string | null
  /** Display name of the sponsor, resolved by the runtime. */
  agentSponsorName?: string | null
  /** Public page explaining the community's agent. */
  agentDisclosureUrl?: string | null
}

export type CommunitySource = {
  title: string
  /** e.g. "episode transcript". Free text from the runtime. */
  kind?: string | null
  /** ISO date of the cited item. */
  timestamp?: string | null
  /** Offset into the item, e.g. "14:32". */
  position?: string | null
  /** Public link to the cited item. */
  url?: string | null
}

export type CommunityThreadAuthor = CommunityPostAuthor & {
  did?: string | null
}

export type CommunityThreadPostData = Omit<CommunityPost, 'author'> & {
  author: CommunityThreadAuthor
  sources?: CommunitySource[] | null
}
