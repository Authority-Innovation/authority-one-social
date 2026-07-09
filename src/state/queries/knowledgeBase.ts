import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {
  fetchKnowledgeFiles,
  type KnowledgeFile,
  type KnowledgeFileToUpload,
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
      return result.files ?? []
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
          throw new KnowledgeError('Please sign in to manage the knowledge base.')
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
