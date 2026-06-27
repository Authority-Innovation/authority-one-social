import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {
  createThread,
  deleteThread,
  fetchThreadMembers,
  fetchThreads,
  groupOp,
  type GroupOpInput,
  removeThreadMember,
  renameThread,
  type Thread,
  type ThreadKind,
  type ThreadRoster,
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
 * The roster for a group thread (GET /app/threads/:id/members) as {creatorDid, members}.
 * Always resolves (never throws); an empty roster means signed out, unreachable, or the
 * members endpoint isn't deployed yet, in which case the UI shows a graceful "can't show
 * members" state and creator-only admin actions stay hidden.
 */
export function useThreadMembersQuery(threadId: string) {
  return useQuery<ThreadRoster>({
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

/**
 * A failed group-admin write must surface, not silently no-op. The transport returns
 * {ok:false,...} rather than throwing, so re-throw here for react-query's onError.
 */
function ensureThreadOk(
  res: {ok: boolean; signedOut: boolean; error?: string},
  fallback: string,
) {
  if (res.ok) return res
  if (res.signedOut) throw new Error('Please sign in to manage this group.')
  throw new Error(res.error ?? fallback)
}

/** Creator-only: rename a group. */
export function useRenameThreadMutation() {
  const invalidate = useInvalidateThreads()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {threadId: string; name: string}) =>
      ensureThreadOk(
        await renameThread(input.threadId, input.name),
        'Could not rename the group.',
      ),
    onSuccess: (_data, input) => {
      void invalidate()
      void qc.invalidateQueries({
        queryKey: createThreadMembersQueryKey(input.threadId),
      })
    },
  })
}

/** Creator-only: remove (eject) a member from a group. */
export function useRemoveThreadMemberMutation() {
  const invalidate = useInvalidateThreads()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {threadId: string; did: string}) =>
      ensureThreadOk(
        await removeThreadMember(input.threadId, input.did),
        'Could not remove the member.',
      ),
    onSuccess: (_data, input) => {
      void invalidate()
      void qc.invalidateQueries({
        queryKey: createThreadMembersQueryKey(input.threadId),
      })
    },
  })
}

/** Creator-only: delete a group entirely (distinct from leaving). */
export function useDeleteThreadMutation() {
  const invalidate = useInvalidateThreads()
  return useMutation({
    mutationFn: async (input: {threadId: string}) =>
      ensureThreadOk(
        await deleteThread(input.threadId),
        'Could not delete the group.',
      ),
    onSuccess: invalidate,
  })
}
