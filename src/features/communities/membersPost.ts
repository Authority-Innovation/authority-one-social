/**
 * Members-tier community posts in a FeedViewPost shape.
 *
 * Members-tier posts live in the community's walled store and are read through
 * the runtime door (communitiesClient). They are not atproto records, so they
 * have no at:// uri, no cid and no author DID. To let FeedPage and the post
 * renderers show them, each one is mapped to a view with a synthetic uri,
 * `ao-community://<communityId>/<postId>`. Anything that assumes a real record
 * must check `isMembersPostUri` first - see postActionGuard.ts.
 */
import {type AppBskyFeedDefs} from '@atproto/api'

import {type DoorItem} from '#/lib/communities/doorContract'
import {isCommunityAgentAuthor} from '#/features/communities/agentLabel'

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
  /**
   * The isCommunityAgentAuthor rule (N1, R3): `is_agent` is true AND
   * `author.did` equals the community config's agent DID. Never the handle.
   * False when the mapper was given no agent DID.
   */
  isAgent: boolean
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
 * Maps one members-tier door item to a FeedViewPost-shaped view. Reads only
 * the door's item fields (`id`, `text`, `createdAt`, `authorId`, `author`);
 * nothing in the result points at a PDS.
 *
 * `agentDid` is the community config's agent DID. Without it no post is
 * marked as the agent, whatever `is_agent` says.
 */
export function membersPostToFeedViewPost(
  communityId: string,
  post: DoorItem,
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
        // Not a DID. The door's author DID is only used for the agent rule
        // above; nothing here may point a renderer at a PDS profile.
        did: `${uri}#author`,
        handle: '',
        // The door sends no display name or avatar, only the member id.
        displayName: typeof post.authorId === 'string' ? post.authorId : '',
        labels: [],
      },
      record: {
        $type: 'app.bsky.feed.post',
        text: typeof post.text === 'string' ? post.text : '',
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
