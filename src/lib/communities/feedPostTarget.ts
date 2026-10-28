/**
 * The target of a post rendered from an AppView feed or thread, for use as
 * `replyTo.target` when a reply opener opens the composer.
 *
 * Every reply opener today (feed items, thread items, the video feed) renders
 * an `AppBskyFeedDefs.PostView` from the AppView. That source is the profile
 * surface: there is no community feed source yet (the community screens are
 * placeholders), members/paid posts live in the walled store under runtime
 * ids and are never rendered by these components, and public community posts
 * are refused at write time, so none can exist. So an AppView post with an
 * app.bsky.feed.post AT-URI is a profile post.
 *
 * Anything else returns undefined, which `resolveTarget` refuses as
 * `unknown-parent-target` (fail closed). When a community feed source lands,
 * its items must carry their own community target instead of going through
 * this helper.
 */
import {type ComposerTarget} from '#/lib/communities/composerTarget'

const PDS_POST_URI = /^at:\/\/[^/]+\/app\.bsky\.feed\.post\/[^/]+$/

export function feedPostTarget(post: {
  uri: string
}): ComposerTarget | undefined {
  if (!post || typeof post.uri !== 'string') return undefined
  return PDS_POST_URI.test(post.uri) ? {kind: 'profile'} : undefined
}
