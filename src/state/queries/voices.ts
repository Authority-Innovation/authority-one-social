import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {
  addLibraryVoice,
  fetchVoiceRegistry,
  removeLibraryVoice,
  type VoiceRegistry,
  type VoiceWriteResult,
} from '#/lib/agent-runtime'
import {STALE} from '#/state/queries'
import {createQueryKey} from '#/state/queries/util'

const voiceRegistryQueryKeyRoot = 'agentVoiceRegistry'
export const createVoiceRegistryQueryKey = () =>
  createQueryKey(voiceRegistryQueryKeyRoot, {})

/**
 * The voice registry (GET /app/voices: builtins + custom library). Resolves to
 * `undefined` when signed out, unreachable, or the runtime predates the registry
 * shape — consumers then fall back to the legacy flat voice list from
 * GET /app/personas, so the picker never regresses.
 */
export function useVoiceRegistryQuery() {
  return useQuery<VoiceRegistry | null>({
    queryKey: createVoiceRegistryQueryKey(),
    // null (not undefined) when unavailable — react-query treats undefined as a bug.
    queryFn: async () => (await fetchVoiceRegistry()).registry ?? null,
    staleTime: STALE.MINUTES.ONE,
  })
}

/** An Error carrying the runtime's machine-readable code (for specific UI copy). */
export class VoiceWriteError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'VoiceWriteError'
    this.code = code
  }
}

function ensureOk(res: VoiceWriteResult, fallback: string): VoiceWriteResult {
  if (res.ok) return res
  if (res.signedOut)
    throw new VoiceWriteError('Please sign in to manage voices.')
  throw new VoiceWriteError(res.error ?? fallback, res.code)
}

export function useAddVoiceMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {label: string; elevenLabsVoiceId: string}) =>
      ensureOk(await addLibraryVoice(input), 'Could not add the voice.'),
    onSuccess: () => {
      void qc.invalidateQueries({queryKey: createVoiceRegistryQueryKey()})
    },
  })
}

export function useDeleteVoiceMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {id: string}) =>
      ensureOk(
        await removeLibraryVoice(input.id),
        'Could not remove the voice.',
      ),
    onSuccess: () => {
      void qc.invalidateQueries({queryKey: createVoiceRegistryQueryKey()})
    },
  })
}
