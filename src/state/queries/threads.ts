import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {
  createThread,
  fetchThreads,
  groupOp,
  type GroupOpInput,
  type Thread,
  type ThreadKind,
} from '#/lib/agent-runtime'
import {STALE} from '#/state/queries'
import {createQueryKey} from '#/state/queries/util'

const threadsQueryKeyRoot = 'agentThreads'
export const createThreadsQueryKey = () => createQueryKey(threadsQueryKeyRoot, {})

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
    mutationFn: (input: {title?: string; kind: ThreadKind; personaId?: string}) =>
      createThread(input),
    onSuccess: invalidate,
  })
}

export function useGroupOpMutation() {
  const invalidate = useInvalidateThreads()
  return useMutation({
    mutationFn: (input: {threadId: string} & GroupOpInput) =>
      groupOp(input.threadId, input),
    onSuccess: invalidate,
  })
}
