import {type BskyAgent} from '@atproto/api'
import {type QueryClient} from '@tanstack/react-query'

import * as apilib from '#/lib/api/index'
import {
  type ComposerTarget,
  type ComposerWriteDecision,
  guardComposerPdsWrite,
} from '#/lib/communities/composerTarget'
import {type ThreadDraft} from '#/view/com/composer/state/composer'

export type ComposerWriteRefusal = Extract<
  ComposerWriteDecision,
  {allowed: false}
>

export type SubmitComposerThreadResult =
  | {ok: true; uris: string[]}
  | {ok: false; refusal: ComposerWriteRefusal}

/**
 * The composer's PDS publish path for a thread, with the members-content guard
 * in front of it. A refused target returns before anything touches the agent,
 * so no record, blob or embed resolution reaches the PDS.
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
    target?: ComposerTarget
    thread: ThreadDraft
    replyTo?: string
    langs?: string[]
    onStateChange?: (state: string) => void
  },
): Promise<SubmitComposerThreadResult> {
  const decision = guardComposerPdsWrite(target)
  if (!decision.allowed) {
    return {ok: false, refusal: decision}
  }
  const {uris} = await apilib.post(agent, queryClient, {
    thread,
    replyTo,
    onStateChange,
    langs,
  })
  return {ok: true, uris}
}
