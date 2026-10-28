import {type RouteParams} from '#/lib/routes/types'
import {COMMUNITIES_ENABLED} from '#/env'

export const COMMUNITY_ROUTE_NAMES = [
  'Community',
  'CommunityMembers',
  'CommunityJoin',
]

/**
 * Wired into `router.matchPath` (see `#/routes`), so it applies to every
 * caller that resolves a path: deep links, in-app links, push notifications,
 * feed links and the desktop nav. With Communities off, a community path
 * (`/c/:id`, `/c/:id/members`) resolves to Home rather than to a screen for a
 * feature this build does not ship. Navigating by route name (e.g.
 * `navigate('Community', ...)`) does not go through matchPath; the screen-level
 * fallback in `./index.tsx` covers that.
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
