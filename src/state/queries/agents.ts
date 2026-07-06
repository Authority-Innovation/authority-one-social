import {useMemo} from 'react'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {
  type CreateAgentResult,
  createOwnerAgent,
  fetchOwnerAgents,
  fetchOwnerUsage,
  type OwnerAgent,
  type OwnerUsageResult,
  type PauseAgentResult,
  pauseOwnerAgent,
  type UsageWindow,
} from '#/lib/agent-runtime'
import {STALE} from '#/state/queries'
import {createQueryKey} from '#/state/queries/util'

const ownerAgentsQueryKeyRoot = 'ownerAgents'
export const createOwnerAgentsQueryKey = () =>
  createQueryKey(ownerAgentsQueryKeyRoot, {})

const ownerUsageQueryKeyRoot = 'ownerUsage'
export const createOwnerUsageQueryKey = (window: UsageWindow) =>
  createQueryKey(ownerUsageQueryKeyRoot, {window})

/**
 * Per-agent usage rollup for the current owner (GET /app/usage). Read-only;
 * resolves to a null rollup when signed out / unreachable — never throws.
 */
export function useOwnerUsageQuery(window: UsageWindow) {
  return useQuery<OwnerUsageResult>({
    queryKey: createOwnerUsageQueryKey(window),
    queryFn: () => fetchOwnerUsage(window),
    staleTime: STALE.MINUTES.ONE,
  })
}

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
 * The DIDs of the agents this owner runs, for ownership checks on rendered posts
 * (owner "•••" controls, hub management tabs). Backed by the cached owner-agents
 * query, so checking a post costs a Set lookup, not a request. Empty set while
 * loading / signed out / unreachable — surfaces simply don't show owner controls,
 * which is the correct fail-closed degradation.
 */
export function useOwnedAgentDids(): Set<string> {
  const {data} = useOwnerAgentsQuery()
  const agents = data?.agents
  return useMemo(
    () =>
      new Set(
        (agents ?? [])
          .map(a => a.did)
          .filter((did): did is string => Boolean(did)),
      ),
    [agents],
  )
}

/**
 * Resolve the owned agent whose PDS identity matches `ref` (DID or handle,
 * case-insensitive), or undefined when the viewer doesn't own it (or the roster
 * hasn't loaded). Used to map a rendered post's author DID back to the runtime
 * agent ref the management endpoints take, and as the AgentHub deep-link guard.
 */
export function useOwnedAgent(ref: string | undefined): OwnerAgent | undefined {
  const {data} = useOwnerAgentsQuery()
  if (!ref) return undefined
  const needle = ref.toLowerCase()
  return data?.agents.find(
    a => a.did?.toLowerCase() === needle || a.handle.toLowerCase() === needle,
  )
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
