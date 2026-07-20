import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {
  deleteKnowledgeFile,
  fetchKnowledgeFiles,
  type KnowledgeDeleteResult,
  type KnowledgeFile,
  type KnowledgeFileToUpload,
  type KnowledgeToggleResult,
  setKnowledgeFileEnabled,
  uploadKnowledgeFile,
} from '#/lib/agent-runtime'
import {STALE} from '#/state/queries'
import {createQueryKey} from '#/state/queries/util'

const knowledgeQueryKeyRoot = 'knowledgeBase'
/**
 * Keyed by the optional agent scope (full handle) so each agent's file list caches
 * independently. No agent = the owner's token-mapped agent.
 */
export const createKnowledgeQueryKey = (agent?: string) =>
  createQueryKey(knowledgeQueryKeyRoot, {agent: agent ?? null})

/** An Error that also carries the runtime's machine-readable code. */
export class KnowledgeError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'KnowledgeError'
    this.code = code
  }
}

/**
 * The agent's uploaded knowledge-base files (GET /app/knowledge). Same contract as
 * the persona/social-autonomy hooks: `undefined` data when signed out / unreachable
 * so the screen degrades gracefully; throws only on an ownership error (403
 * not-your-agent) so the scoped screen can message it specifically.
 */
export function useKnowledgeFilesQuery(agent?: string) {
  return useQuery<KnowledgeFile[] | undefined>({
    queryKey: createKnowledgeQueryKey(agent),
    queryFn: async () => {
      const result = await fetchKnowledgeFiles(agent)
      if (result.code === 'not-your-agent') {
        throw new KnowledgeError(
          result.error ?? 'This agent is not linked to your account.',
          result.code,
        )
      }
      if (result.signedOut) return undefined
      // A transport/runtime failure must NOT masquerade as an empty knowledge
      // base ("No files yet") — throw so the screen keeps cached data (e.g. a
      // reverted optimistic delete) or shows the unavailable notice.
      if (!result.files) {
        throw new KnowledgeError(
          result.error ?? 'Knowledge base unreachable.',
          result.code,
        )
      }
      return result.files
    },
    staleTime: STALE.MINUTES.ONE,
    retry: (failureCount, error) =>
      // Ownership won't change on retry.
      !(error instanceof KnowledgeError && error.code === 'not-your-agent') &&
      failureCount < 3,
  })
}

/**
 * Upload one text document into the agent's long-term memory (POST
 * /app/knowledge/upload). On success the query is invalidated so the slot list
 * refreshes. A runtime PII-guard BLOCK is NOT a thrown error — it resolves with
 * `{ok:false, file:{status:'blocked', reason}}` so the screen can surface the real
 * reason on the new slot; only transport/ownership failures throw.
 */
export function useUploadKnowledgeFileMutation(agent?: string) {
  const qc = useQueryClient()
  const queryKey = createKnowledgeQueryKey(agent)
  return useMutation({
    mutationFn: async (file: KnowledgeFileToUpload) => {
      const res = await uploadKnowledgeFile(file, agent)
      // Ownership / auth / transport failures are real errors the screen toasts.
      if (!res.ok && !res.file) {
        if (res.signedOut)
          throw new KnowledgeError(
            'Please sign in to manage the knowledge base.',
          )
        throw new KnowledgeError(
          res.error ?? 'Could not upload the file.',
          res.code,
        )
      }
      // Success OR an honest block (res.file carries status/reason) — return it so
      // onSuccess can refresh; the screen inspects res.file.status for blocked.
      return res
    },
    onSuccess: () => qc.invalidateQueries({queryKey}),
  })
}

/**
 * Switch one knowledge-base item on or off (PATCH /app/knowledge/{id}).
 * Optimistic: the row flips immediately and is reverted if the call fails (the
 * screen toasts the failure — never a silent no-op). Idempotent on the server:
 * a `changed:false` response is a SUCCESS (the item was already in that state),
 * not an error. The resolved result carries the runtime's user-displayable
 * `message`, which the screen shows verbatim. A 409 code 'deleted' throws so
 * the screen can say the item was deleted, not merely off.
 */
export function useSetKnowledgeEnabledMutation(agent?: string) {
  const qc = useQueryClient()
  const queryKey = createKnowledgeQueryKey(agent)
  return useMutation<
    KnowledgeToggleResult,
    Error,
    {id: string; enabled: boolean},
    {previous?: KnowledgeFile[]}
  >({
    mutationFn: async ({id, enabled}) => {
      const res = await setKnowledgeFileEnabled(id, enabled, agent)
      if (!res.ok) {
        if (res.signedOut)
          throw new KnowledgeError(
            'Please sign in to manage the knowledge base.',
          )
        throw new KnowledgeError(
          res.error ?? 'Could not update the file.',
          res.code,
        )
      }
      return res
    },
    onMutate: async ({id, enabled}) => {
      await qc.cancelQueries({queryKey})
      const previous = qc.getQueryData<KnowledgeFile[] | undefined>(queryKey)
      if (previous) {
        qc.setQueryData(
          queryKey,
          previous.map(f => (f.id === id ? {...f, enabled} : f)),
        )
      }
      return {previous}
    },
    onError: (_err, _vars, ctx) => {
      // Revert the optimistic flip visibly; the screen toasts the reason.
      if (ctx?.previous) qc.setQueryData(queryKey, ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({queryKey}),
  })
}

/**
 * Remove one slot from the agent's knowledge base (DELETE /app/knowledge/{id}).
 * Optimistic: the row leaves the list immediately and is restored if the call
 * fails (the screen also toasts the failure — never a silent no-op). The resolved
 * KnowledgeDeleteResult carries `upstream`, which the screen MUST use for its
 * success copy: only 'purged' may claim the data was destroyed.
 */
export function useDeleteKnowledgeFileMutation(agent?: string) {
  const qc = useQueryClient()
  const queryKey = createKnowledgeQueryKey(agent)
  return useMutation<
    KnowledgeDeleteResult,
    Error,
    {id: string},
    {previous?: KnowledgeFile[]}
  >({
    mutationFn: async ({id}) => {
      const res = await deleteKnowledgeFile(id, agent)
      if (!res.ok) {
        if (res.signedOut)
          throw new KnowledgeError(
            'Please sign in to manage the knowledge base.',
          )
        throw new KnowledgeError(
          res.error ?? 'Could not remove the file.',
          res.code,
        )
      }
      return res
    },
    onMutate: async ({id}) => {
      await qc.cancelQueries({queryKey})
      const previous = qc.getQueryData<KnowledgeFile[] | undefined>(queryKey)
      if (previous) {
        qc.setQueryData(
          queryKey,
          previous.filter(f => f.id !== id),
        )
      }
      return {previous}
    },
    onError: (_err, _vars, ctx) => {
      // Revert the optimistic removal visibly; the screen toasts the reason.
      if (ctx?.previous) qc.setQueryData(queryKey, ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({queryKey}),
  })
}
