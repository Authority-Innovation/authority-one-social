import {COMMUNITIES_ENABLED} from '#/env'

/**
 * `communities` is Following merged with every community the person belongs
 * to. `community|<id>` is one community's timeline: an at:// id is a public
 * tier group (AppView), anything else is a members-tier community (runtime).
 */
export type CommunitiesFeedDescriptor = 'communities' | `community|${string}`

const COMMUNITY_PREFIX = 'community|'

export function isCommunityFeedDescriptor(
  feedDesc: string,
): feedDesc is CommunitiesFeedDescriptor {
  return feedDesc === 'communities' || feedDesc.startsWith(COMMUNITY_PREFIX)
}

export function communityIdFromDescriptor(
  feedDesc: string,
): string | undefined {
  if (!feedDesc.startsWith(COMMUNITY_PREFIX)) return undefined
  const id = feedDesc.slice(COMMUNITY_PREFIX.length)
  return id || undefined
}

/**
 * The community descriptors to offer (e.g. to the switcher). Empty when the
 * feature flag is off, so nothing in the app can select one.
 */
export function getOfferedCommunityFeedDescriptors(
  communityIds: string[],
  enabled: boolean = COMMUNITIES_ENABLED,
): CommunitiesFeedDescriptor[] {
  if (!enabled) return []
  return [
    'communities',
    ...communityIds
      .filter(id => typeof id === 'string' && id.length > 0)
      .map(id => `${COMMUNITY_PREFIX}${id}` as const),
  ]
}
