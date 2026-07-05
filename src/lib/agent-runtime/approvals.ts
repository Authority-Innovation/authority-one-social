import {logger} from '#/logger'
import {getSupabaseAccessToken} from './authToken'
import {AGENT_RUNTIME_BASE_URL} from './config'
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
  // Signed out → no bearer. Don't post an unauthenticated decision (the runtime
  // would 401 it anyway); report it as a no-op the caller can react to.
  if (!token) {
    logger.warn('agent-runtime approval skipped: not signed in')
    return false
  }
  try {
    // Runtime contract (app-channel.js): POST /app/approve with {id, decision}. The
    // agent is resolved server-side from the bearer (the endpoint is owner-self-scoped),
    // so `agent` is advisory only. Using the wrong path (/app/approvals) or field
    // (actionId) makes the runtime 404 / 400 the decision while the UI has already
    // optimistically removed the card — the action then survives server-side and gets
    // resurfaced. Match the contract exactly.
    const res = await fetch(`${AGENT_RUNTIME_BASE_URL}/app/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        id: args.actionId,
        decision: args.decision,
        // E6 agent selector: include `agent` only when the caller scoped the chat
        // to a specific agent. Absent = the runtime resolves the owner's primary
        // agent — never default a hardcoded handle (it would misroute/403 owners
        // whose primary agent differs once the selector is live).
        ...(args.agent ? {agent: args.agent} : {}),
      }),
    })
    return res.ok
  } catch (e) {
    logger.error('agent-runtime approval failed', {safeMessage: e})
    return false
  }
}
