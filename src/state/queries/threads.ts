import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {
  createThread,
  fetchThreadMembers,
  fetchThreads,
  groupOp,
  type GroupOpInput,
  type Thread,
  type ThreadKind,
  type ThreadMember,
} from '#/lib/agent-runtime'
import {STALE} from '#/state/queries'
import {createQueryKey} from '#/state/queries/util'

const threadsQueryKeyRoot = 'agentThreads'
export const createThreadsQueryKey = () =>
  createQueryKey(threadsQueryKeyRoot, {})

const threadMembersQueryKeyRoot = 'agentThreadMembers'
export const createThreadMembersQueryKey = (threadId: string) =>
  createQueryKey(threadMembersQueryKeyRoot, {threadId})

/**
 * The roster for a group thread (GET /app/threads/:id/members). Always resolves (never
 * throws); an empty array means signed out, unreachable, or the members endpoint isn't
 * deployed yet, in which case the UI shows a graceful "can't show members" state.
 */
export function useThreadMembersQuery(threadId: string) {
  return useQuery<ThreadMember[]>({
    queryKey: createThreadMembersQueryKey(threadId),
    queryFn: () => fetchThreadMembers(threadId),
    staleTime: STALE.SECONDS.FIFTEEN,
    enabled: !!threadId,
  })
}

/**
 * The owner's chat threads (default Talk-to-Bob agent thread + groups) from
 * GET /app/threads. Resolves to `undefined` data when signed out / unreachable, so the
 * chat list degrades to the single Talk-to-Bob chat. Never throws.
 */
export function useThreadsQuery() {
  return useQuery<{threads: Thread[]; signedOut: boolean} | undefined>({
    queryKey: createThreadsQueryKey(),
    queryFn: async () => {
      const result = await fetchThreads()
      // Surface "unreachable" (error) as undefined so the UI falls back; a clean
      // signed-out or empty list resolves normally.
      if (result.error) return undefined
      return {threads: result.threads, signedOut: result.signedOut}
    },
    staleTime: STALE.SECONDS.FIFTEEN,
  })
}

function useInvalidateThreads() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({queryKey: createThreadsQueryKey()})
}

export function useCreateThreadMutation() {
  const invalidate = useInvalidateThreads()
  return useMutation({
    mutationFn: (input: {
      title?: string
      kind: ThreadKind
      personaId?: string
    }) => createThread(input),
    onSuccess: invalidate,
  })
}

export function useGroupOpMutation() {
  const invalidate = useInvalidateThreads()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {threadId: string} & GroupOpInput) =>
      groupOp(input.threadId, input),
    onSuccess: (_data, input) => {
      void invalidate()
      // Membership changed -> refresh that group's roster too.
      void qc.invalidateQueries({
        queryKey: createThreadMembersQueryKey(input.threadId),
      })
    },
  })
}
