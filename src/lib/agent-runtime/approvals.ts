import {logger} from '#/logger'
import {getSupabaseAccessToken} from './authToken'
import {AGENT_RUNTIME_BASE_URL, DEFAULT_AGENT} from './config'
import {type ApprovalDecision} from './types'

/**
 * Post the user's decision on an approval action back to the runtime.
 * The runtime's structural write-gate only executes the action after an `approve`.
 */
export async function postApprovalDecision(args: {
  actionId: string
  decision: ApprovalDecision
  agent?: string
}): Promise<boolean> {
  const token = await getSupabaseAccessToken()
  try {
    const res = await fetch(`${AGENT_RUNTIME_BASE_URL}/app/approvals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? {Authorization: `Bearer ${token}`} : {}),
      },
      body: JSON.stringify({
        actionId: args.actionId,
        decision: args.decision,
        agent: args.agent ?? DEFAULT_AGENT,
      }),
    })
    return res.ok
  } catch (e) {
    logger.error('agent-runtime approval failed', {safeMessage: e})
    return false
  }
}
