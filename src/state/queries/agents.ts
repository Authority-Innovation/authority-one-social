import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {
  type CreateAgentResult,
  createOwnerAgent,
  fetchOwnerAgents,
  type OwnerAgent,
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
