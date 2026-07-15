import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import {
  type AgentConversation,
  fetchAgentConversations,
  markThreadRead,
  sumUnread,
} from '#/lib/agent-runtime'
import {STALE} from '#/state/queries'
import {useOwnerAgentsQuery} from '#/state/queries/agents'
import {createThreadsQueryKey} from '#/state/queries/threads'
import {createQueryKey} from '#/state/queries/util'

export const AGENT_CONVERSATIONS_QUERY_ROOT = 'agentConversations'
export const createAgentConversationsQueryKey = (args: {agent: string}) =>
  createQueryKey(AGENT_CONVERSATIONS_QUERY_ROOT, args)

function conversationsQueryOptions(agent: string) {
  return {
    queryKey: createAgentConversationsQueryKey({agent: agent.toLowerCase()}),
    queryFn: async () => {
      const result = await fetchAgentConversations(agent)
      // Unreachable (error) resolves to undefined so the UI can distinguish
      // "no conversations" from "can't reach the runtime".
      if (result.error) return undefined
      return result.conversations
    },
    staleTime: STALE.SECONDS.FIFTEEN,
  }
}

/**
 * The unified cross-channel conversation list for one OWNED agent
 * (GET /app/agents/:agent/conversations) — the Messages tab's source of truth.
 * `data === undefined` after loading means the runtime was unreachable.
 */
export function useAgentConversationsQuery(agent?: string) {
  return useQuery<AgentConversation[] | undefined>({
    ...conversationsQueryOptions(agent ?? ''),
    enabled: !!agent,
  })
}

/**
 * Unread rollup across ALL owned agents, from the same per-agent conversations
 * queries the hub uses (cache shared). Returns per-agent totals keyed by
 * lowercased handle, plus the grand total for the app-icon badge. Non-owned
 * agents can't be queried (ownership gate), so they simply have no entry.
 */
export function useOwnedAgentsUnread(): {
  byAgent: Map<string, number>
  total: number
} {
  const {data: ownedData} = useOwnerAgentsQuery()
  const handles = (ownedData?.agents ?? []).map(a => a.handle)

  const results = useQueries({
    queries: handles.map(handle => conversationsQueryOptions(handle)),
  })

  const byAgent = new Map<string, number>()
  let total = 0
  handles.forEach((handle, i) => {
    const conversations = results[i]?.data
    const unread = conversations ? sumUnread(conversations) : 0
    byAgent.set(handle.toLowerCase(), unread)
    total += unread
  })
  return {byAgent, total}
}

/**
 * Mark a conversation read (POST /app/threads/:id/read). The cached row is
 * zeroed optimistically on mutate — opening a thread should clear its pill
 * immediately — then the list refetches to reconcile with the runtime.
 */
export function useMarkThreadReadMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {id: string; agent?: string}) =>
      markThreadRead(input.id, input.agent),
    onMutate: input => {
      if (!input.agent) return
      queryClient.setQueryData<AgentConversation[] | undefined>(
        createAgentConversationsQueryKey({agent: input.agent.toLowerCase()}),
        old => old?.map(c => (c.id === input.id ? {...c, unreadCount: 0} : c)),
      )
    },
    onSettled: (_data, _error, input) => {
      if (input.agent) {
        void queryClient.invalidateQueries({
          queryKey: createAgentConversationsQueryKey({
            agent: input.agent.toLowerCase(),
          }),
        })
      }
      // The legacy threads list carries unread pills too — reconcile it.
      void queryClient.invalidateQueries({queryKey: createThreadsQueryKey()})
    },
  })
}
