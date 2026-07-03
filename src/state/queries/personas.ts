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
/**
 * Keyed by the optional agent scope (full handle) so each agent's persona view
 * caches independently. No agent = the owner's token-mapped agent (legacy view).
 */
export const createPersonasQueryKey = (agent?: string) =>
  createQueryKey(personasQueryKeyRoot, {agent: agent ?? null})

/**
 * The agent personas + active selection + available voices, from the runtime
 * (GET /app/personas). Optionally scoped to one of the owner's agents via `agent`
 * (the FULL handle from a GET /app/agents row); omitted = the owner's token-mapped
 * agent. Resolves to `undefined` data when signed out or the endpoint isn't
 * reachable yet, so consumers degrade gracefully (the chat header falls back to
 * the atproto profile name). Throws only on an ownership error (403
 * not-your-agent) so the scoped screen can message it specifically.
 */
export function usePersonasQuery(agent?: string) {
  return useQuery<PersonasState | undefined>({
    queryKey: createPersonasQueryKey(agent),
    queryFn: async () => {
      const result = await fetchPersonas(agent)
      if (result.code === 'not-your-agent') {
        throw new PersonaWriteError(
          result.error ?? 'This agent is not linked to your account.',
          result.code,
        )
      }
      return result.state
    },
    staleTime: STALE.MINUTES.ONE,
    retry: (failureCount, error) =>
      // Ownership won't change on retry.
      !(
        error instanceof PersonaWriteError && error.code === 'not-your-agent'
      ) && failureCount < 3,
  })
}

function useInvalidatePersonas(agent?: string) {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({queryKey: createPersonasQueryKey(agent)})
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

export function useCreatePersonaMutation(agent?: string) {
  const qc = useQueryClient()
  const invalidate = useInvalidatePersonas(agent)
  return useMutation({
    mutationFn: async (input: PersonaWriteInput & {name: string}) =>
      ensureOk(
        await createPersona(input, agent),
        'Could not create the persona.',
      ),
    onSuccess: res => {
      // Apply the authoritative refreshed view immediately (no refetch race), then
      // invalidate so any other observers reconcile too.
      if (res.state) qc.setQueryData(createPersonasQueryKey(agent), res.state)
      void invalidate()
    },
  })
}

export function useUpdatePersonaMutation(agent?: string) {
  const qc = useQueryClient()
  const invalidate = useInvalidatePersonas(agent)
  return useMutation({
    mutationFn: async (input: PersonaWriteInput & {id: string}) =>
      ensureOk(
        await updatePersona(input, agent),
        'Could not save the persona.',
      ),
    onSuccess: res => {
      if (res.state) qc.setQueryData(createPersonasQueryKey(agent), res.state)
      void invalidate()
    },
  })
}

export function useDeletePersonaMutation(agent?: string) {
  const qc = useQueryClient()
  const invalidate = useInvalidatePersonas(agent)
  return useMutation({
    mutationFn: async (input: {id: string}) =>
      ensureOk(
        await deletePersona(input, agent),
        'Could not delete the persona.',
      ),
    onSuccess: res => {
      if (res.state) qc.setQueryData(createPersonasQueryKey(agent), res.state)
      void invalidate()
    },
  })
}

export function useSetActivePersonaMutation(agent?: string) {
  const qc = useQueryClient()
  const invalidate = useInvalidatePersonas(agent)
  return useMutation({
    mutationFn: async (input: {id: string}) =>
      ensureOk(
        await setActivePersona(input, agent),
        'Could not switch persona.',
      ),
    onSuccess: res => {
      if (res.state) qc.setQueryData(createPersonasQueryKey(agent), res.state)
      void invalidate()
    },
  })
}
