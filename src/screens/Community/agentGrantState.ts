/**
 * Pure: what the "Your settings" grant section shows. Kept apart from the
 * component so the rule can be tested without rendering.
 */
export type AgentGrantSectionState = 'hidden' | 'loading' | 'error' | 'row'

export function agentGrantSectionState({
  isMember,
  agentDid,
  on,
  isError,
}: {
  isMember: boolean
  agentDid?: string
  on?: boolean
  isError: boolean
}): AgentGrantSectionState {
  if (!isMember || !agentDid) return 'hidden'
  if (on !== undefined) return 'row'
  return isError ? 'error' : 'loading'
}
