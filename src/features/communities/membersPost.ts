/**
 * Members-tier community posts in a FeedViewPost shape.
 *
 * Members-tier posts live in the community's walled store and are read through
 * the runtime door (communitiesClient). They are not atproto records, so they
 * have no at:// uri and no cid. The door's `author.did` is used only to match
 * the community agent (see isCommunityAgentAuthor) and is never put in the
 * view. To let FeedPage and the post
 * renderers show them, each one is mapped to a view with a synthetic uri,
 * `ao-community://<communityId>/<postId>`. Anything that assumes a real record
 * must check `isMembersPostUri` first - see postActionGuard.ts.
 */
import {type AppBskyFeedDefs} from '@atproto/api'

import {type CommunityPost} from '#/lib/agent-runtime/communitiesClient'

export const MEMBERS_POST_URI_SCHEME = 'ao-community://'

export type CommunityTier = 'public' | 'members'

/**
 * The community badge every item from a community source carries. Rides in
 * the `__source` slot the feed tuner already reads into `slice.reason` (the
 * same slot merge.ts uses for "From <feed>").
 */
export interface ReasonCommunity {
  $type: 'reasonCommunity'
  communityId: string
  name?: string
  tier: CommunityTier
}

export function isReasonCommunity(v: unknown): v is ReasonCommunity {
  return (
    !!v &&
    typeof v === 'object' &&
    '$type' in v &&
    v.$type === 'reasonCommunity'
  )
}

/** What a members view carries about where it came from. */
export interface MembersPostRef {
  communityId: string
  postId: string
  /** From isCommunityAgentAuthor (N1), never the handle or display name. */
  isAgent: boolean
}

function nonEmpty(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s : undefined
}

/**
 * Whether a runtime item's author is the community agent (N1).
 *
 * The runtime's `author.is_agent` must be true. When the community's agent
 * DID is known from its config, `author.did` must also equal it, so an item
 * flagged as an agent but signed by any other DID (or by none) is a member.
 * When no agent DID is known, the runtime flag alone decides. The display
 * name and handle are never read. A missing or malformed author is a member.
 */
export function isCommunityAgentAuthor(
  author: unknown,
  agentDid?: string | null,
): boolean {
  if (!author || typeof author !== 'object') return false
  const a = author as {is_agent?: unknown; did?: unknown}
  if (a.is_agent !== true) return false
  const expected = nonEmpty(agentDid)
  if (!expected) return true
  return nonEmpty(a.did) === expected
}

export function membersPostUri(communityId: string, postId: string): string {
  return `${MEMBERS_POST_URI_SCHEME}${encodeURIComponent(
    communityId,
  )}/${encodeURIComponent(postId)}`
}

export function isMembersPostUri(uri: unknown): uri is string {
  return typeof uri === 'string' && uri.startsWith(MEMBERS_POST_URI_SCHEME)
}

export function parseMembersPostUri(
  uri: unknown,
): {communityId: string; postId: string} | undefined {
  if (!isMembersPostUri(uri)) return undefined
  const rest = uri.slice(MEMBERS_POST_URI_SCHEME.length)
  const parts = rest.split('/')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return undefined
  try {
    return {
      communityId: decodeURIComponent(parts[0]),
      postId: decodeURIComponent(parts[1]),
    }
  } catch {
    return undefined
  }
}

/**
 * Maps one members-tier post to a FeedViewPost-shaped view. Reads only the
 * runtime's CommunityPost fields; nothing in the result points at a PDS.
 * `agentDid` is the community config's agent DID, when the caller knows it.
 */
export function membersPostToFeedViewPost(
  communityId: string,
  post: CommunityPost,
  badge: ReasonCommunity,
  agentDid?: string | null,
): AppBskyFeedDefs.FeedViewPost {
  const uri = membersPostUri(communityId, post.id)
  const createdAt = post.createdAt
  const isAgent = isCommunityAgentAuthor(post.author, agentDid)
  const ref: MembersPostRef = {communityId, postId: post.id, isAgent}
  const view = {
    post: {
      uri,
      // Not a content hash. Present only because PostView requires a cid.
      cid: uri,
      author: {
        // Not a DID. Member identities from the door stay out of the view.
        did: `${uri}#author`,
        handle: '',
        displayName: post.author?.displayName ?? '',
        avatar: post.author?.avatar ?? undefined,
        labels: [],
      },
      record: {
        $type: 'app.bsky.feed.post',
        text: typeof post.body === 'string' ? post.body : '',
        createdAt,
      },
      indexedAt: createdAt,
      labels: [],
      viewer: {
        // Quote/embed of a members post would copy it out of the walled
        // store, so the existing embeddingDisabled path is switched on too.
        embeddingDisabled: true,
      },
      aoCommunity: ref,
    },
    __source: badge,
  }
  return view
}

export function getMembersPostRef(post: {
  uri: string
}): MembersPostRef | undefined {
  const parsed = parseMembersPostUri(post.uri)
  if (!parsed) return undefined
  const ref = (post as {aoCommunity?: MembersPostRef}).aoCommunity
  return {
    ...parsed,
    isAgent: ref?.isAgent === true,
  }
}
