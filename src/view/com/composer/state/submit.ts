import {type BskyAgent} from '@atproto/api'
import {type QueryClient} from '@tanstack/react-query'

import * as communitiesClient from '#/lib/agent-runtime/communitiesClient'
import * as apilib from '#/lib/api/index'
import {
  type ComposerTarget,
  type ComposerWriteDecision,
  guardComposerPdsWrite,
  isPublicCommunityTarget,
  refusePublicCommunityTarget,
} from '#/lib/communities/composerTarget'
import {type DoorItem} from '#/lib/communities/doorContract'
import {isWalledTarget} from '#/lib/communities/resolveTarget'
import {type ThreadDraft} from '#/view/com/composer/state/composer'

export type ComposerWriteRefusal = Extract<
  ComposerWriteDecision,
  {allowed: false}
>

/**
 * Why a members/paid submit could not be sent. `unsupported-content` means the
 * draft carries something only the PDS path can publish (images, video, GIF,
 * quote); nothing is uploaded to find that out.
 */
export type CommunitySubmitError =
  | {kind: 'unsupported-content'}
  | {kind: 'client'; error: communitiesClient.CommunitiesError}

export type SubmitComposerThreadResult =
  | {ok: true; route: 'pds'; uris: string[]}
  | {
      ok: true
      route: 'communities'
      /** The door's created items, `{item}` from each post/reply call. */
      posts: DoorItem[]
    }
  | {ok: false; refusal: ComposerWriteRefusal}
  | {ok: false; communityError: CommunitySubmitError}

/**
 * The composer's publish path for a thread. `target` must already be resolved
 * (see resolveTarget.ts), so replies carry their parent's target. An undefined
 * target is the user's own profile; null (unresolved) is refused.
 *
 * A public community target is refused (`public-community-not-available`)
 * before anything else, even though resolveTarget already refuses it: the PDS
 * guard allows public, and the only PDS publish path would write a plain
 * profile post with the community dropped.
 *
 * The members-content guard runs next, before anything touches the agent:
 *  - allowed (profile) -> the existing PDS path, unchanged.
 *  - refused because the target is members/paid -> the communities runtime
 *    client, and nothing else. The agent is never handed the thread.
 *  - refused for any other reason -> returned as-is, nothing sent.
 */
export async function submitComposerThread(
  agent: BskyAgent,
  queryClient: QueryClient,
  {
    target,
    thread,
    replyTo,
    langs,
    onStateChange,
  }: {
    target: ComposerTarget | null | undefined
    thread: ThreadDraft
    /** AT-URI of a PDS parent, or the runtime post id of a members parent. */
    replyTo?: string
    langs?: string[]
    onStateChange?: (state: string) => void
  },
): Promise<SubmitComposerThreadResult> {
  if (isPublicCommunityTarget(target)) {
    return {ok: false, refusal: refusePublicCommunityTarget()}
  }
  const decision = guardComposerPdsWrite(target)
  if (decision.allowed) {
    const {uris} = await apilib.post(agent, queryClient, {
      thread,
      replyTo,
      onStateChange,
      langs,
    })
    return {ok: true, route: 'pds', uris}
  }
  if (
    decision.reason === 'members-write-not-available' &&
    target &&
    isWalledTarget(target)
  ) {
    return submitToCommunity(target.id, thread, replyTo)
  }
  return {ok: false, refusal: decision}
}

/**
 * Members/paid publish. Text only for now: the runtime client takes media as
 * refs into its own store, and there is no members media upload yet, so any
 * media or quote is refused up front. A link card is a preview derived from
 * the text, so it is dropped rather than resolved (resolving one fetches and
 * uploads a thumbnail).
 *
 * A thread is posted as a chain: the first post (or a reply to `replyTo`),
 * then each following post as a reply to the one before it.
 */
async function submitToCommunity(
  communityId: string,
  thread: ThreadDraft,
  replyTo: string | undefined,
): Promise<SubmitComposerThreadResult> {
  if (
    thread.posts.length === 0 ||
    thread.posts.some(p => p.embed.media || p.embed.quote)
  ) {
    return {ok: false, communityError: {kind: 'unsupported-content'}}
  }
  const posts: DoorItem[] = []
  let parent = replyTo
  for (const draft of thread.posts) {
    const body = draft.richtext.text
    const res = parent
      ? await communitiesClient.reply(communityId, parent, body)
      : await communitiesClient.post(communityId, body)
    if (!res.ok) {
      return {ok: false, communityError: {kind: 'client', error: res.error}}
    }
    posts.push(res.data)
    parent = res.data.id
  }
  return {ok: true, route: 'communities', posts}
}
