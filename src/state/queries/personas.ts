import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {
  createPersona,
  deletePersona,
  fetchPersonas,
  type PersonasState,
  type PersonaWriteInput,
  type PersonaWriteResult,
  setActivePersona,
  updatePersona,
} from '#/lib/agent-runtime'
import {STALE} from '#/state/queries'
import {createQueryKey} from '#/state/queries/util'

const personasQueryKeyRoot = 'agentPersonas'
export const createPersonasQueryKey = () =>
  createQueryKey(personasQueryKeyRoot, {})

/**
 * The owner's agent personas + active selection + available voices, from the
 * runtime (GET /app/personas). Resolves to `undefined` data when signed out or the
 * endpoint isn't reachable yet, so consumers degrade gracefully (the chat header
 * falls back to the atproto profile name). Never throws.
 */
export function usePersonasQuery() {
  return useQuery<PersonasState | undefined>({
    queryKey: createPersonasQueryKey(),
    queryFn: async () => {
      const result = await fetchPersonas()
      return result.state
    },
    staleTime: STALE.MINUTES.ONE,
  })
}

function useInvalidatePersonas() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({queryKey: createPersonasQueryKey()})
}

/**
 * A failed persona write must NOT look like success. The transport never throws (it
 * returns {ok:false,...}), so throw here on failure: react-query routes it to onError,
 * the editor keeps the dialog open and shows the error, and nothing silently no-ops.
 */
/** An Error that also carries the runtime's machine-readable code (for the editor). */
export class PersonaWriteError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'PersonaWriteError'
    this.code = code
  }
}

function ensureOk(
  res: PersonaWriteResult,
  fallback: string,
): PersonaWriteResult {
  if (res.ok) return res
  if (res.signedOut)
    throw new PersonaWriteError('Please sign in to manage personas.')
  throw new PersonaWriteError(res.error ?? fallback, res.code)
}

export function useCreatePersonaMutation() {
  const qc = useQueryClient()
  const invalidate = useInvalidatePersonas()
  return useMutation({
    mutationFn: async (input: PersonaWriteInput & {name: string}) =>
      ensureOk(await createPersona(input), 'Could not create the persona.'),
    onSuccess: res => {
      // Apply the authoritative refreshed view immediately (no refetch race), then
      // invalidate so any other observers reconcile too.
      if (res.state) qc.setQueryData(createPersonasQueryKey(), res.state)
      void invalidate()
    },
  })
}

export function useUpdatePersonaMutation() {
  const qc = useQueryClient()
  const invalidate = useInvalidatePersonas()
  return useMutation({
    mutationFn: async (input: PersonaWriteInput & {id: string}) =>
      ensureOk(await updatePersona(input), 'Could not save the persona.'),
    onSuccess: res => {
      if (res.state) qc.setQueryData(createPersonasQueryKey(), res.state)
      void invalidate()
    },
  })
}

export function useDeletePersonaMutation() {
  const qc = useQueryClient()
  const invalidate = useInvalidatePersonas()
  return useMutation({
    mutationFn: async (input: {id: string}) =>
      ensureOk(await deletePersona(input), 'Could not delete the persona.'),
    onSuccess: res => {
      if (res.state) qc.setQueryData(createPersonasQueryKey(), res.state)
      void invalidate()
    },
  })
}

export function useSetActivePersonaMutation() {
  const qc = useQueryClient()
  const invalidate = useInvalidatePersonas()
  return useMutation({
    mutationFn: async (input: {id: string}) =>
      ensureOk(await setActivePersona(input), 'Could not switch persona.'),
    onSuccess: res => {
      if (res.state) qc.setQueryData(createPersonasQueryKey(), res.state)
      void invalidate()
    },
  })
}
