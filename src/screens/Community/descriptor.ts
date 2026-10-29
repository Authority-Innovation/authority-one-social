/**
 * The community home's view of one community: the public descriptor a
 * non-member may see, plus the caller's membership.
 *
 * Built from the runtime's `getCommunity` response (T8 `Community`). The
 * runtime may also return the community's `com.authorityone.community.config`
 * record (T2 codegen) under `config`, and a few display fields the config only
 * holds as DIDs (agent name, sponsor name). Everything is read defensively: an
 * unknown or missing tier is treated as members-only, so a malformed response
 * fails closed and never shows a wall as public.
 */
import {type Community} from '#/lib/agent-runtime/communitiesClient'
import {isCommunityAdmin} from '#/features/communityAgent/adminGate'

export type CommunityTier = 'public' | 'members' | 'paid'

export type CommunityAgent = {
  did: string
  sponsorDid: string
  /** Display name, e.g. "Steve". Never derived from a handle. */
  name?: string
  /** Who runs the agent, e.g. "Between Two Beers". */
  sponsorName?: string
  /** What the agent can see, as the community describes it. */
  scope?: string
}

export type CommunityDescriptor = {
  id: string
  name: string
  description?: string
  avatar?: string
  banner?: string
  tier: CommunityTier
  /** Header-only accent (N3). A validated CSS hex colour, or undefined. */
  accent?: string
  /** Set only when the config has both `agent` and `agentSponsor` (N1). */
  agent?: CommunityAgent
  runBy?: string
  memberCount?: number
  isMember: boolean
  /** Runtime `viewerIsAdmin`; only an admin may launch the agent. */
  isAdmin: boolean
  consentVersion?: string
  rules?: string
  rulesUrl?: string
  /** AT URI of the com.authorityone.group.profile, for public-tier reads. */
  groupUri?: string
}

const TIER_PREFIX = 'com.authorityone.community.config#'
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v : undefined
}

function obj(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined
}

export function parseTier(v: unknown): CommunityTier {
  const raw = str(v)
  const tier = raw?.startsWith(TIER_PREFIX)
    ? raw.slice(TIER_PREFIX.length)
    : raw
  if (tier === 'public' || tier === 'paid') return tier
  return 'members'
}

export function parseAccent(v: unknown): string | undefined {
  const raw = str(v)?.trim()
  return raw && HEX.test(raw) ? raw : undefined
}

export function toDescriptor(
  id: string,
  community: Community,
): CommunityDescriptor {
  const raw = community as Community & Record<string, unknown>
  const config = obj(raw.config)
  const theme = obj(config?.theme)
  const brand = obj(config?.brand)
  const moderation = obj(config?.moderation)

  const agentDid = str(config?.agent) ?? str(raw.agentDid)
  const sponsorDid = str(config?.agentSponsor) ?? str(raw.agentSponsor)
  const sponsorName = str(raw.agentSponsorName) ?? str(brand?.displayName)

  const agent: CommunityAgent | undefined =
    agentDid && sponsorDid
      ? {
          did: agentDid,
          sponsorDid,
          name: str(raw.agentName),
          sponsorName,
          scope: str(raw.agentScope),
        }
      : undefined

  const consentVersion =
    str(raw.consentVersion) ??
    (typeof config?.consentVersion === 'number'
      ? String(config.consentVersion)
      : undefined)

  return {
    id,
    name: str(raw.name) ?? id,
    description: str(raw.description),
    avatar: str(raw.avatar),
    banner: str(raw.banner),
    tier: parseTier(config?.tier ?? raw.tier),
    accent: parseAccent(theme?.accent ?? raw.accent),
    agent,
    runBy: str(raw.runBy) ?? str(brand?.displayName),
    memberCount:
      typeof raw.memberCount === 'number' ? raw.memberCount : undefined,
    isMember: !!community.role,
    isAdmin: isCommunityAdmin(raw),
    consentVersion,
    rules: str(raw.rules),
    rulesUrl: str(moderation?.rulesUrl) ?? str(raw.rulesUrl),
    groupUri: str(raw.groupUri),
  }
}

/**
 * Where the posts list reads from, if anywhere. Members-tier and paid
 * communities read through the runtime door, and only for a member. A
 * non-member of a walled community gets no read at all.
 */
export function postsSource(
  d: CommunityDescriptor,
): 'runtime' | 'group' | 'none' {
  if (d.tier === 'public') return d.groupUri ? 'group' : 'none'
  return d.isMember ? 'runtime' : 'none'
}
