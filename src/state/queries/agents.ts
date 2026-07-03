import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {
  type CreateAgentResult,
  createOwnerAgent,
  fetchOwnerAgents,
  type OwnerAgent,
  type PauseAgentResult,
  pauseOwnerAgent,
} from '#/lib/agent-runtime'
import {STALE} from '#/state/queries'
import {createQueryKey} from '#/state/queries/util'

const ownerAgentsQueryKeyRoot = 'ownerAgents'
export const createOwnerAgentsQueryKey = () =>
  createQueryKey(ownerAgentsQueryKeyRoot, {})

/**
 * The agents the current owner may CHOOSE to add to a group (GET /app/agents). Resolves
 * to an empty list when signed out / unreachable / not deployed, so the picker degrades to
 * "no agents to add" rather than erroring. Never throws.
 */
export function useOwnerAgentsQuery() {
  return useQuery<{agents: OwnerAgent[]; signedOut: boolean}>({
    queryKey: createOwnerAgentsQueryKey(),
    queryFn: async () => {
      const result = await fetchOwnerAgents()
      return {agents: result.agents, signedOut: result.signedOut}
    },
    staleTime: STALE.MINUTES.ONE,
  })
}

/**
 * Create a new agent under the logged-in owner (POST /app/agents). The client returns a
 * typed result rather than throwing, so failures land in onSuccess with `ok:false` and an
 * `errorKind` the form maps to a specific message. A real success refreshes the owner-
 * agents list so the new agent shows up in the pickers right away.
 */
export function useCreateOwnerAgentMutation() {
  const queryClient = useQueryClient()

  return useMutation<
    CreateAgentResult,
    Error,
    {targetHandle: string; provisionNumber?: boolean; areaCode?: string}
  >({
    mutationFn: createOwnerAgent,
    onSuccess: result => {
      if (result.ok) {
        void queryClient.invalidateQueries({
          queryKey: createOwnerAgentsQueryKey(),
        })
      }
    },
  })
}

/**
 * Pause/unpause one of the owner's agents (POST /app/agents/pause). Same typed-result
 * pattern as create: failures land in onSuccess with ok:false so the toggle can show a
 * message. A real success patches the cached row immediately (paused + live flip) and
 * then invalidates so the list reconciles with the runtime.
 */
export function usePauseOwnerAgentMutation() {
  const queryClient = useQueryClient()

  return useMutation<
    PauseAgentResult,
    Error,
    {agent?: string; paused: boolean}
  >({
    mutationFn: pauseOwnerAgent,
    onSuccess: (result, variables) => {
      if (!result.ok) return
      const handle = (result.agent ?? variables.agent)?.toLowerCase()
      if (handle) {
        queryClient.setQueryData<{agents: OwnerAgent[]; signedOut: boolean}>(
          createOwnerAgentsQueryKey(),
          old =>
            old && {
              ...old,
              agents: old.agents.map(a =>
                a.handle.toLowerCase() === handle
                  ? {
                      ...a,
                      paused: result.paused,
                      live: a.active !== false && !result.paused,
                    }
                  : a,
              ),
            },
        )
      }
      void queryClient.invalidateQueries({
        queryKey: createOwnerAgentsQueryKey(),
      })
    },
  })
}
