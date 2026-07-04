import {useMutation, useQueryClient} from '@tanstack/react-query'

import {
  type AgentProfileInput,
  type AgentProfileWriteResult,
  updateAgentProfile,
} from '#/lib/agent-runtime'
import {createOwnerAgentsQueryKey} from '#/state/queries/agents'
import {RQKEY as profileQueryKey} from '#/state/queries/profile'

/** An Error carrying the runtime's machine-readable code + offending field. */
export class AgentProfileWriteError extends Error {
  code?: string
  field?: string
  constructor(message: string, code?: string, field?: string) {
    super(message)
    this.name = 'AgentProfileWriteError'
    this.code = code
    this.field = field
  }
}

/**
 * POST /app/agents/profile — commit display name / bio / avatar / banner to the
 * agent's PDS profile. Throws AgentProfileWriteError on failure so the dialog can
 * show the specific reason (too long, bad image, not-your-agent, PDS down...).
 */
export function useUpdateAgentProfileMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (
      input: AgentProfileInput,
    ): Promise<AgentProfileWriteResult> => {
      const res = await updateAgentProfile(input)
      if (res.ok) return res
      if (res.signedOut) {
        throw new AgentProfileWriteError(
          'Please sign in to edit this agent’s profile.',
        )
      }
      throw new AgentProfileWriteError(
        res.error ?? 'Could not update the profile.',
        res.code,
        res.field,
      )
    },
    onSuccess: (_res, input) => {
      // The agent's atproto profile changed: refresh its cached profile view (the
      // dialog previews read from it) and the owner-agents list (display names).
      void qc.invalidateQueries({queryKey: profileQueryKey(input.agent)})
      void qc.invalidateQueries({queryKey: createOwnerAgentsQueryKey()})
    },
  })
}
