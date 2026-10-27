import {type RouteParams} from '#/lib/routes/types'
import {COMMUNITIES_ENABLED} from '#/env'

export const COMMUNITY_ROUTE_NAMES = [
  'Community',
  'CommunityMembers',
  'CommunityJoin',
]

/**
 * Applied to every path the app resolves from a deep link. With Communities
 * off, a community path (`/c/:id`, `/c/:id/members`) lands on Home rather
 * than on a screen for a feature this build does not ship.
 */
export function applyCommunitiesFlag(
  [name, params]: [string, RouteParams],
  enabled: boolean = COMMUNITIES_ENABLED,
): [string, RouteParams] {
  if (!enabled && COMMUNITY_ROUTE_NAMES.includes(name)) {
    return ['Home', {}]
  }
  return [name, params]
}
