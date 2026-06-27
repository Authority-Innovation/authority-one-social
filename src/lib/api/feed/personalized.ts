/**
 * Authority One — Phase 2 personalized ("For You") feed registration helper.
 *
 * Pins the personalized feed generator as a saved+pinned feed in the signed-in
 * user's preferences, so it shows up alongside Following/Discover with ZERO
 * app-core changes — the feed then renders through the existing CustomFeedAPI
 * path (a `feedgen|<at-uri>` descriptor; see src/state/queries/post-feed.ts).
 *
 * The feed at-uri comes from PERSONALIZED_FEED_URI (constants.ts ->
 * EXPO_PUBLIC_PERSONALIZED_FEED_URI). When unset the helper no-ops, so the
 * feature is dark until the feed generator record is published.
 *
 * Idempotent: checks current saved feeds first and only writes when the feed
 * isn't already present (mirrors authority-one-feedgen/src/saved-feeds.js
 * `planSavedFeedPin`, which is unit-tested there).
 *
 * WIRING (one line, your call where to put it): call
 * `ensurePersonalizedFeedPinned(agent)` once after login/onboarding completes —
 * e.g. alongside the existing `overwriteSavedFeeds` in the onboarding finalizer,
 * or in a post-session-resume effect. It is safe to call repeatedly.
 */

import {type BskyAgent} from '@atproto/api'

import {PERSONALIZED_FEED_URI} from '#/lib/constants'

/** Pure decision: is the personalized feed already saved? (mirrors saved-feeds.js) */
export function isPersonalizedFeedSaved(
  savedFeeds: {type?: string; value?: string}[] | undefined,
  feedUri: string,
): boolean {
  return Boolean(
    feedUri &&
      (savedFeeds ?? []).some(f => f?.type === 'feed' && f?.value === feedUri),
  )
}

/**
 * Ensure the personalized feed is pinned for the current user.
 * @returns 'added' | 'exists' | 'disabled' | 'error'
 */
export async function ensurePersonalizedFeedPinned(
  agent: BskyAgent,
  feedUri: string = PERSONALIZED_FEED_URI,
): Promise<'added' | 'exists' | 'disabled' | 'error'> {
  if (!feedUri || !feedUri.startsWith('at://')) return 'disabled'
  try {
    const prefs = await agent.getPreferences()
    if (isPersonalizedFeedSaved(prefs.savedFeeds, feedUri)) return 'exists'
    // addSavedFeeds generates the SavedFeed id (TID) internally.
    await agent.addSavedFeeds([{type: 'feed', value: feedUri, pinned: true}])
    return 'added'
  } catch {
    return 'error'
  }
}
