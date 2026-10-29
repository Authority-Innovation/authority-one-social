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
import {
  fetchGroupMemberships,
  fetchGroupTimeline,
  isGroupAppViewUnavailableError,
} from '#/state/queries/group'
import {communityConfigAgentDid} from '#/features/communities/agentLabel'
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
  /**
   * Members tier: the community config's agent DID, used to mark the agent's
   * posts. Absent means no post is marked as the agent (fail closed). When the
   * key is missing entirely, the members fetcher looks it up via
   * getCommunity; an explicit `undefined` means it was looked up and not set.
   */
  agentDid?: string
}

interface Page {
  feed: AppBskyFeedDefs.FeedViewPost[]
  cursor?: string
}

interface SourceState {
  kind: 'following' | CommunityFeedSource['tier']
  fetchPage: (cursor: string | undefined, limit: number) => Promise<Page>
  queue: AppBskyFeedDefs.FeedViewPost[]
  cursor: string | undefined
  hasMore: boolean
  /** Set when the source failed and was dropped. */
  error?: unknown
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

/**
 * The config agent DID for a members source. A source that came from
 * listMyCommunities already carries it (possibly undefined); a bare id (one
 * community's feed) is looked up once via getCommunity. Any failure is
 * undefined, so no post is marked as the agent.
 */
async function resolveMembersAgentDid(
  source: CommunityFeedSource,
): Promise<string | undefined> {
  if ('agentDid' in source) return source.agentDid
  try {
    const res = await communitiesClient.getCommunity(source.id)
    return res.ok ? communityConfigAgentDid(res.data) : undefined
  } catch {
    return undefined
  }
}

function membersTierFetcher(source: CommunityFeedSource) {
  const badge = badgeFor(source)
  let agentDid: Promise<string | undefined> | undefined
  return async (cursor: string | undefined): Promise<Page> => {
    // Started alongside the timeline; it never rejects.
    agentDid ??= resolveMembersAgentDid(source)
    // Only this community's id. The runtime decides tenancy and membership.
    const res = await communitiesClient.getTimeline(source.id, cursor)
    if (!res.ok) {
      throw new Error(`members timeline: ${res.error.kind}`)
    }
    const did = await agentDid
    return {
      feed: res.data.posts
        .filter(isUsableMembersPost)
        .map(p => membersPostToFeedViewPost(source.id, p, badge, did)),
      cursor: res.data.cursor,
    }
  }
}

/**
 * Whether the public tier (group AppView) is contributing. `unavailable`
 * means no group AppView is configured, so nothing was sent; `error` means
 * the AppView call failed. Either way the feed carries no public items, and
 * this state is what says so instead of an empty, silent tier.
 */
export type PublicTierState =
  | {kind: 'ok'}
  | {kind: 'unavailable'; reason: string}
  | {kind: 'error'; reason: string}

const PUBLIC_TIER_OK: PublicTierState = {kind: 'ok'}

function publicTierStateFor(e: unknown): PublicTierState {
  const reason = e instanceof Error ? e.message : 'unknown error'
  return isGroupAppViewUnavailableError(e)
    ? {kind: 'unavailable', reason}
    : {kind: 'error', reason}
}

export interface CommunitySources {
  sources: CommunityFeedSource[]
  publicTier: PublicTierState
}

/**
 * The communities the signed-in person belongs to: members tier from the
 * runtime, public tier from the AppView. A failing side contributes no
 * sources; a failing public side is reported in `publicTier`.
 */
export async function resolveMyCommunitySources(
  agent: BskyAgent,
): Promise<CommunitySources> {
  const did = agent.session?.did
  let publicTier: PublicTierState = PUBLIC_TIER_OK
  const [members, groups] = await Promise.all([
    communitiesClient.listMyCommunities(),
    did
      ? fetchGroupMemberships(agent, {actor: did}).catch((e: unknown) => {
          publicTier = publicTierStateFor(e)
          logger.warn('communities feed: group memberships not available', {
            safeMessage: publicTier.kind,
          })
          return undefined
        })
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
        add({
          id: c.id,
          name: c.name,
          tier: 'members',
          agentDid: communityConfigAgentDid(c),
        })
      }
    }
  }
  for (const m of groups?.memberships ?? []) {
    if (m.status && m.status !== 'com.authorityone.group.defs#active') continue
    add({id: m.group.uri, name: m.group.name, tier: 'public'})
  }
  return {sources: out, publicTier}
}

export class CommunitiesMergeFeedAPI implements FeedAPI {
  agent: BskyAgent
  includeFollowing: boolean
  fixedSources: CommunityFeedSource[] | undefined
  resolveSources: (agent: BskyAgent) => Promise<CommunitySources>
  following: FollowingFeedAPI | undefined
  states: SourceState[] = []
  page = 0
  /**
   * Whether the public tier is contributing. Read this to show a "public
   * posts not available yet" state; the feed itself just carries no public
   * items when it is not `ok`.
   */
  publicTier: PublicTierState = PUBLIC_TIER_OK

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
    resolveSources?: (agent: BskyAgent) => Promise<CommunitySources>
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
    this.publicTier = PUBLIC_TIER_OK
    let sources: CommunityFeedSource[] = []
    try {
      if (this.fixedSources) {
        sources = this.fixedSources
      } else {
        const resolved = await this.resolveSources(this.agent)
        sources = resolved.sources
        this.publicTier = resolved.publicTier
      }
    } catch (e) {
      logger.warn('communities feed: could not resolve sources', {
        safeMessage: e instanceof Error ? e.message : undefined,
      })
    }
    const states: SourceState[] = []
    const following = this.following
    if (following) {
      states.push(
        newState('following', (cursor, limit) =>
          following.fetch({cursor, limit}),
        ),
      )
    }
    for (const source of sources) {
      states.push(
        newState(
          source.tier,
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
    // parallel. A failing source is dropped, it never fails the whole feed,
    // but a failing public source is recorded in `publicTier`.
    await Promise.all(
      this.states
        .filter(s => s.hasMore && s.queue.length < limit)
        .map(s => topUp(s, limit)),
    )
    const publicFailure = this.states.find(
      s => s.kind === 'public' && s.error !== undefined,
    )
    if (publicFailure && this.publicTier.kind === 'ok') {
      this.publicTier = publicTierStateFor(publicFailure.error)
    }
    // A single community with nothing else to show: surface the failure as
    // the feed's error state rather than an empty feed.
    if (
      !cursor &&
      !this.following &&
      this.states.length > 0 &&
      this.states.every(s => s.error !== undefined)
    ) {
      throw this.states[0].error
    }

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

function newState(
  kind: SourceState['kind'],
  fetchPage: SourceState['fetchPage'],
): SourceState {
  return {kind, fetchPage, queue: [], cursor: undefined, hasMore: true}
}

async function topUp(state: SourceState, limit: number) {
  try {
    const page = await state.fetchPage(state.cursor, limit)
    state.queue = state.queue.concat(page.feed)
    state.cursor = page.cursor
    state.hasMore = page.feed.length > 0 && !!page.cursor
  } catch (e) {
    state.hasMore = false
    state.error = e ?? new Error('source failed')
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
