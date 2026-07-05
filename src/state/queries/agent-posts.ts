import {useMutation, useQueryClient} from '@tanstack/react-query'

import {
  type AgentPostErrorCode,
  deleteAgentPost,
  postAsAgent,
} from '#/lib/agent-runtime'
import {updatePostShadow} from '#/state/cache/post-shadow'

/**
 * Owner-initiated management writes on an agent's posts. These call the
 * ownership-scoped runtime endpoints — NOT the local session (the human doesn't
 * hold the agent's credentials) and NOT the agent's LLM (management is
 * deterministic). Mirrors the upstream self-post mutations in ./post.ts.
 */

/** Typed failure so callers can branch on the runtime's machine-readable code. */
export class AgentPostActionError extends Error {
  code?: AgentPostErrorCode
  constructor(message: string, code?: AgentPostErrorCode) {
    super(message)
    this.name = 'AgentPostActionError'
    this.code = code
  }
}

/**
 * Delete a post authored by one of the viewer's agents (POST
 * /app/agents/posts/delete). Clone of `usePostDeleteMutation`: on success the
 * post shadow is marked deleted so every feed/thread drops it optimistically;
 * the PDS delete -> firehose -> AppView round-trip makes it durable.
 */
export function useAgentPostDeleteMutation() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, {agent: string; uri: string}>({
    mutationFn: async ({agent, uri}) => {
      const res = await deleteAgentPost({agent, uri})
      if (!res.ok) {
        throw new AgentPostActionError(
          res.signedOut
            ? 'Not signed in'
            : (res.error ?? 'Could not delete the post'),
          res.code,
        )
      }
    },
    onSuccess(_, variables) {
      updatePostShadow(queryClient, variables.uri, {isDeleted: true})
    },
  })
}

/**
 * Publish a post as one of the viewer's agents, verbatim (POST /app/agents/posts).
 * Text/facets/hosted image urls only — the runtime writes the record as given.
 */
export function usePostAsAgentMutation() {
  return useMutation<
    {uri?: string; cid?: string},
    Error,
    Parameters<typeof postAsAgent>[0]
  >({
    mutationFn: async input => {
      const res = await postAsAgent(input)
      if (!res.ok) {
        throw new AgentPostActionError(
          res.signedOut
            ? 'Not signed in'
            : (res.error ?? 'Could not publish the post'),
          res.code,
        )
      }
      return {uri: res.uri, cid: res.cid}
    },
  })
}
