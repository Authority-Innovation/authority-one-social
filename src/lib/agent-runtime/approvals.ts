import {logger} from '#/logger'
import {getSupabaseAccessToken} from './authToken'
import {AGENT_RUNTIME_BASE_URL} from './config'
import {type ApprovalDecision} from './types'

/**
 * Outcome of posting an approval decision. HTTP-ok is NOT the interesting signal
 * here: the runtime CONSUMES the draft the moment it accepts a decision, then
 * reports execution failure as 409 + body `{status:'failed'}` and an already
 * consumed action as 404 + `{status:'not-found'}`. So "non-2xx" does NOT mean
 * "still pending" - callers must branch on `status`, not on ok.
 */
export interface ApprovalDecisionOutcome {
  /** Decision accepted AND the action executed (or was rejected as asked). */
  ok: boolean
  /**
   * Action status from the runtime body ('executed', 'rejected', 'failed',
   * 'not-found', 'expired', 'paused', ...) or a client-side pseudo-status when no
   * body status exists: 'signed-out' (no bearer, nothing was posted), 'transport'
   * (fetch threw), 'auth' (401/403), 'unknown' (other non-2xx without a status).
   * Everything except 'failed' / 'not-found' / 'expired' means the action is
   * still pending server-side.
   */
  status: string
  /**
   * Owner-readable execution error when the runtime reports one (its `friendly`
   * line preferred over the raw `error`).
   */
  error?: string
}

/**
 * Post the user's decision on an approval action back to the runtime.
 * The runtime's structural write-gate only executes the action after an `approve`.
 */
export async function postApprovalDecision(args: {
  actionId: string
  decision: ApprovalDecision
  agent?: string
}): Promise<ApprovalDecisionOutcome> {
  const token = await getSupabaseAccessToken()
  // Signed out → no bearer. Don't post an unauthenticated decision (the runtime
  // would 401 it anyway); report it as a no-op the caller can react to.
  if (!token) {
    logger.warn('agent-runtime approval skipped: not signed in')
    return {ok: false, status: 'signed-out'}
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
    // Body shape (app-channel.js): {ok, status, decision, id, result} where `result`
    // is the executor's own body - on a failed execution it carries the raw `error`
    // plus an optional owner-readable `friendly` line. Error paths that never reach
    // the executor ({error: 'id is required'} / {error: 'approve failed', detail})
    // have no `status`; those map to the pseudo-statuses below.
    let body: {
      ok?: boolean
      status?: string
      error?: string
      result?: {error?: string; friendly?: string}
    } = {}
    try {
      body = await res.json()
    } catch {}
    const status =
      typeof body.status === 'string' && body.status
        ? body.status
        : res.ok
          ? 'executed'
          : res.status === 401 || res.status === 403
            ? 'auth'
            : 'unknown'
    const error = body.result?.friendly ?? body.result?.error ?? body.error
    return {
      ok: res.ok && body.ok !== false,
      status,
      ...(typeof error === 'string' && error ? {error} : {}),
    }
  } catch (e) {
    logger.error('agent-runtime approval failed', {safeMessage: e})
    return {ok: false, status: 'transport'}
  }
}
