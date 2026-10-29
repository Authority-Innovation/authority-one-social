import {type Community} from '#/lib/agent-runtime/communitiesClient'
import {
  ALL_COMMUNITIES_FEED,
  type CommunityFeedDescriptor,
  communityFeedDescriptor,
} from '#/state/shell/selected-community'
import {COMMUNITIES_ENABLED, COMMUNITY_SWITCHER, LOCKED_COMMUNITY} from '#/env'

/**
 * The switcher shows only when both flags are on. A brand build locked to one
 * community never shows it.
 */
export function isCommunitySwitcherEnabled(): boolean {
  return COMMUNITIES_ENABLED && COMMUNITY_SWITCHER && !LOCKED_COMMUNITY
}

/**
 * The client casts the runtime's array without checking each entry, so keep
 * only entries we can render: a non-empty string id and a name. Duplicate ids
 * are dropped so chip keys stay unique.
 */
export function toSwitcherCommunities(list: unknown): Community[] {
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const out: Community[] = []
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue
    const {id, name} = item as Partial<Community>
    if (typeof id !== 'string' || id.trim().length === 0) continue
    if (typeof name !== 'string' || name.trim().length === 0) continue
    if (seen.has(id)) continue
    seen.add(id)
    out.push(item as Community)
  }
  return out
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/**
 * The accent is runtime-supplied, so accept plain hex colours only. Anything
 * else falls back to the app's own colours.
 */
export function safeAccent(accent: unknown): string | undefined {
  return typeof accent === 'string' && HEX_COLOR.test(accent)
    ? accent
    : undefined
}

/**
 * A selection pointing at a community that is no longer in the list (the
 * person left it, or was removed) falls back to "All".
 */
export function resolveSelection(
  selected: CommunityFeedDescriptor,
  communities: Community[],
): CommunityFeedDescriptor {
  if (selected === ALL_COMMUNITIES_FEED) return selected
  const found = communities.some(
    c => communityFeedDescriptor(c.id) === selected,
  )
  return found ? selected : ALL_COMMUNITIES_FEED
}
