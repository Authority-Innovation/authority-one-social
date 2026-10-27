/**
 * Combined feed: Following merged with every community the person belongs to,
 * reverse-chronological. Modelled on merge.ts, but it samples by time rather
 * than by ratio, so items from all sources interleave in date order.
 *
 * The merge happens here, on the device. Each source is fetched on its own:
 *   - Following: FollowingFeedAPI (the normal timeline).
 *   - Public tier: com.authorityone.group.getTimeline via group.ts (AppView).
 *   - Members tier: communitiesClient.getTimeline via the runtime door.
 * Each community fetch carries only its own community id, so no server is
 * ever asked to join two members-only stores. Members-tier fetches never
 * touch the agent (no PDS, no AppView).
 *
 * Every item from a community source carries a ReasonCommunity badge.
 */
import {AppBskyFeedDefs, type BskyAgent} from '@atproto/api'

import * as communitiesClient from '#/lib/agent-runtime/communitiesClient'
import {logger} from '#/logger'
import {fetchGroupMemberships, fetchGroupTimeline} from '#/state/queries/group'
import {
  membersPostToFeedViewPost,
  type ReasonCommunity,
} from '#/features/communities/membersPost'
import {FollowingFeedAPI} from './following'
import {type FeedAPI, type FeedAPIResponse} from './types'

export interface CommunityFeedSource {
  /** Group at:// uri for the public tier, runtime community id otherwise. */
  id: string
  name?: string
  tier: 'public' | 'members'
}

interface Page {
  feed: AppBskyFeedDefs.FeedViewPost[]
  cursor?: string
}

interface SourceState {
  fetchPage: (cursor: string | undefined, limit: number) => Promise<Page>
  queue: AppBskyFeedDefs.FeedViewPost[]
  cursor: string | undefined
  hasMore: boolean
}

export function communityTierForId(id: string): CommunityFeedSource['tier'] {
  return id.startsWith('at://') ? 'public' : 'members'
}

function sortTime(item: AppBskyFeedDefs.FeedViewPost): number {
  const at = AppBskyFeedDefs.isReasonRepost(item.reason)
    ? item.reason.indexedAt
    : item.post.indexedAt
  const ms = Date.parse(at)
  return Number.isNaN(ms) ? 0 : ms
}

function badgeFor(source: CommunityFeedSource): ReasonCommunity {
  return {
    $type: 'reasonCommunity',
    communityId: source.id,
    ...(source.name ? {name: source.name} : {}),
    tier: source.tier,
  }
}

function isUsableMembersPost(p: unknown): p is communitiesClient.CommunityPost {
  if (!p || typeof p !== 'object') return false
  const post = p as Record<string, unknown>
  return (
    typeof post.id === 'string' &&
    post.id.length > 0 &&
    typeof post.createdAt === 'string' &&
    typeof post.body === 'string'
  )
}

function publicTierFetcher(agent: BskyAgent, source: CommunityFeedSource) {
  const badge = badgeFor(source)
  return async (cursor: string | undefined, limit: number): Promise<Page> => {
    const data = await fetchGroupTimeline(agent, {
      group: source.id,
      cursor,
      limit,
    })
    const feed: AppBskyFeedDefs.FeedViewPost[] = data.feed ?? []
    for (const item of feed) {
      // @ts-ignore same side channel as merge.ts `__source`
      item.__source = badge
    }
    return {feed, cursor: data.cursor}
  }
}

function membersTierFetcher(source: CommunityFeedSource) {
  const badge = badgeFor(source)
  return async (cursor: string | undefined): Promise<Page> => {
    // Only this community's id. The runtime decides tenancy and membership.
    const res = await communitiesClient.getTimeline(source.id, cursor)
    if (!res.ok) {
      throw new Error(`members timeline: ${res.error.kind}`)
    }
    return {
      feed: res.data.posts
        .filter(isUsableMembersPost)
        .map(p => membersPostToFeedViewPost(source.id, p, badge)),
      cursor: res.data.cursor,
    }
  }
}

/**
 * The communities the signed-in person belongs to: members tier from the
 * runtime, public tier from the AppView. A failing side contributes nothing.
 */
export async function resolveMyCommunitySources(
  agent: BskyAgent,
): Promise<CommunityFeedSource[]> {
  const did = agent.session?.did
  const [members, groups] = await Promise.all([
    communitiesClient.listMyCommunities(),
    did
      ? fetchGroupMemberships(agent, {actor: did}).catch(() => undefined)
      : Promise.resolve(undefined),
  ])
  const out: CommunityFeedSource[] = []
  const seen = new Set<string>()
  const add = (s: CommunityFeedSource) => {
    if (!s.id || seen.has(s.id)) return
    seen.add(s.id)
    out.push(s)
  }
  if (members.ok) {
    for (const c of members.data) {
      if (c && typeof c.id === 'string') {
        add({id: c.id, name: c.name, tier: 'members'})
      }
    }
  }
  for (const m of groups?.memberships ?? []) {
    if (m.status && m.status !== 'com.authorityone.group.defs#active') continue
    add({id: m.group.uri, name: m.group.name, tier: 'public'})
  }
  return out
}

export class CommunitiesMergeFeedAPI implements FeedAPI {
  agent: BskyAgent
  includeFollowing: boolean
  fixedSources: CommunityFeedSource[] | undefined
  resolveSources: (agent: BskyAgent) => Promise<CommunityFeedSource[]>
  following: FollowingFeedAPI | undefined
  states: SourceState[] = []
  page = 0

  constructor({
    agent,
    sources,
    includeFollowing = true,
    resolveSources = resolveMyCommunitySources,
  }: {
    agent: BskyAgent
    /** Fixed sources. When omitted, the person's communities are resolved. */
    sources?: CommunityFeedSource[]
    includeFollowing?: boolean
    resolveSources?: (agent: BskyAgent) => Promise<CommunityFeedSource[]>
  }) {
    this.agent = agent
    this.includeFollowing = includeFollowing
    this.fixedSources = sources
    this.resolveSources = resolveSources
    this.following = includeFollowing
      ? new FollowingFeedAPI({agent})
      : undefined
  }

  async reset() {
    this.page = 0
    let sources: CommunityFeedSource[] = []
    try {
      sources = this.fixedSources ?? (await this.resolveSources(this.agent))
    } catch (e) {
      logger.warn('communities feed: could not resolve sources', {
        safeMessage: e instanceof Error ? e.message : undefined,
      })
    }
    const states: SourceState[] = []
    const following = this.following
    if (following) {
      states.push(newState((cursor, limit) => following.fetch({cursor, limit})))
    }
    for (const source of sources) {
      states.push(
        newState(
          source.tier === 'public'
            ? publicTierFetcher(this.agent, source)
            : membersTierFetcher(source),
        ),
      )
    }
    this.states = states
  }

  async peekLatest(): Promise<AppBskyFeedDefs.FeedViewPost> {
    if (this.following) {
      return this.following.peekLatest()
    }
    // A single community: peek its own source only.
    const state = this.states[0]
    if (!state) return undefined as unknown as AppBskyFeedDefs.FeedViewPost
    try {
      const page = await state.fetchPage(undefined, 1)
      return page.feed[0]
    } catch {
      return undefined as unknown as AppBskyFeedDefs.FeedViewPost
    }
  }

  async fetch({
    cursor,
    limit,
  }: {
    cursor: string | undefined
    limit: number
  }): Promise<FeedAPIResponse> {
    if (!cursor) {
      await this.reset()
    }

    // Top up every source that is running low, one request each, in
    // parallel. A failing source is dropped, it never fails the whole feed.
    await Promise.all(
      this.states
        .filter(s => s.hasMore && s.queue.length < limit)
        .map(s => topUp(s, limit)),
    )

    const feed: AppBskyFeedDefs.FeedViewPost[] = []
    while (feed.length < limit) {
      // An empty source with more to give may hold a newer item. Stop here
      // and let the next page top it up, so the order stays correct.
      if (this.states.some(s => s.hasMore && s.queue.length === 0)) break
      let best: SourceState | undefined
      for (const s of this.states) {
        if (!s.queue.length) continue
        if (!best || sortTime(s.queue[0]) > sortTime(best.queue[0])) {
          best = s
        }
      }
      if (!best) break
      feed.push(best.queue.shift()!)
    }

    const more = this.states.some(s => s.hasMore || s.queue.length > 0)
    return {
      cursor: more ? String(++this.page) : undefined,
      feed,
    }
  }
}

function newState(fetchPage: SourceState['fetchPage']): SourceState {
  return {fetchPage, queue: [], cursor: undefined, hasMore: true}
}

async function topUp(state: SourceState, limit: number) {
  try {
    const page = await state.fetchPage(state.cursor, limit)
    state.queue = state.queue.concat(page.feed)
    state.cursor = page.cursor
    state.hasMore = page.feed.length > 0 && !!page.cursor
  } catch (e) {
    state.hasMore = false
    logger.warn('communities feed: source failed', {
      safeMessage: e instanceof Error ? e.message : undefined,
    })
  }
}

/** One community's timeline, `community|<id>`. */
export function createCommunityFeedAPI({
  agent,
  communityId,
  name,
}: {
  agent: BskyAgent
  communityId: string
  name?: string
}) {
  return new CommunitiesMergeFeedAPI({
    agent,
    includeFollowing: false,
    sources: [{id: communityId, name, tier: communityTierForId(communityId)}],
  })
}

/** Used when the feature flag is off: never fetches anything. */
export class EmptyFeedAPI implements FeedAPI {
  peekLatest(): Promise<AppBskyFeedDefs.FeedViewPost> {
    return Promise.resolve(undefined as unknown as AppBskyFeedDefs.FeedViewPost)
  }
  fetch(): Promise<FeedAPIResponse> {
    return Promise.resolve({feed: []})
  }
}
