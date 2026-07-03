import {logger} from '#/logger'
import {getSupabaseAccessToken} from './authToken'
import {AGENTS_ENDPOINT} from './config'

/**
 * Owner-agents client: the read side that lets an owner CHOOSE one of THEIR agents to add
 * to a group chat. Same owner-scoped /app auth + resilience contract as the other agent-
 * runtime clients — every call degrades gracefully (an unreachable / not-yet-deployed
 * endpoint yields an empty list, never throws), so the picker just shows nothing to add.
 */

/** One selectable agent identity for the picker. */
export interface OwnerAgent {
  /** The agent's PDS handle (e.g. ada.pds.authority-one.com) — the id used to add it. */
  handle: string
  /** Display name from the runtime; the UI can refine it from the atproto profile. */
  displayName?: string
  /** Avatar URL when the runtime resolves one; usually null (the UI enriches it). */
  avatar?: string
}

export interface OwnerAgentsResult {
  agents: OwnerAgent[]
  signedOut: boolean
  error?: string
}

/** What POST /app/agents echoes back for a freshly created agent. */
export interface CreatedAgent {
  /** Full PDS handle of the new agent (server appends the domain to bare names). */
  handle: string
  did?: string
  /** Provisioned E.164 number, or null when no number was requested / the number
   *  step failed (check numberStatus — the agent itself still exists). */
  number: string | null
  numberStatus?: string
  mode?: string
  intentId?: string
}

/**
 * Why the create failed, mapped from the runtime's documented statuses so the UI
 * can show a specific message instead of a generic one:
 * - 'limit'        402 — entitlement gate / plan at capacity
 * - 'did-required' 400 did-required — session has no atproto DID
 * - 'auth'         401 — unauthenticated
 * - 'runtime'      any other non-2xx
 * - 'network'      fetch threw
 */
export type CreateAgentErrorKind =
  | 'limit'
  | 'did-required'
  | 'auth'
  | 'runtime'
  | 'network'

export interface CreateAgentResult {
  ok: boolean
  signedOut: boolean
  errorKind?: CreateAgentErrorKind
  error?: string
  data?: CreatedAgent
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

/** Normalize the GET /app/agents payload into a deduped agent list. PURE + tested. */
export function normalizeOwnerAgents(json: unknown): OwnerAgent[] {
  const rows = (json as {agents?: unknown})?.agents
  if (!Array.isArray(rows)) return []
  const seen = new Set<string>()
  const out: OwnerAgent[] = []
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const handle = str(r.handle) ?? str(r.id) ?? str(r.did)
    if (!handle || seen.has(handle.toLowerCase())) continue
    seen.add(handle.toLowerCase())
    out.push({
      handle,
      displayName: str(r.displayName) ?? str(r.name),
      avatar: str(r.avatar),
    })
  }
  return out
}

function errorMessage(e: unknown): string | undefined {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return undefined
}

async function authHeaders(): Promise<Record<string, string> | null> {
  const token = await getSupabaseAccessToken()
  if (!token) return null
  return {Authorization: `Bearer ${token}`}
}

/** Normalize the POST /app/agents success payload. PURE + tested. Falls back to the
 *  requested handle so a sparse echo never mis-reports a real success as a failure. */
export function normalizeCreatedAgent(
  json: unknown,
  requestedHandle: string,
): CreatedAgent {
  const r = (json ?? {}) as Record<string, unknown>
  return {
    handle: str(r.handle) ?? requestedHandle,
    did: str(r.did),
    number: str(r.number) ?? null,
    numberStatus: str(r.numberStatus),
    mode: str(r.mode),
    intentId: str(r.intentId),
  }
}

/**
 * POST /app/agents — create a new agent under the logged-in owner (the runtime resolves
 * the owner DID from the session; we never send it). Optionally provisions a dedicated
 * phone number in the same call. Unlike the read side this surfaces failures — but as a
 * typed result, never a throw — so the form can explain exactly what went wrong.
 */
export async function createOwnerAgent(input: {
  targetHandle: string
  provisionNumber?: boolean
  areaCode?: string
}): Promise<CreateAgentResult> {
  const headers = await authHeaders().catch(() => null)
  if (!headers) return {ok: false, signedOut: true, errorKind: 'auth'}
  try {
    const res = await fetch(AGENTS_ENDPOINT, {
      method: 'POST',
      headers: {...headers, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        targetHandle: input.targetHandle,
        provisionNumber: input.provisionNumber || undefined,
        areaCode: input.areaCode || undefined,
      }),
    })
    if (res.ok) {
      const json = await res.json().catch(() => ({}))
      return {
        ok: true,
        signedOut: false,
        data: normalizeCreatedAgent(json, input.targetHandle),
      }
    }
    const body = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >
    const serverError = str(body.error) ?? str(body.message)
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        signedOut: true,
        errorKind: 'auth',
        error: serverError,
      }
    }
    if (res.status === 402) {
      return {
        ok: false,
        signedOut: false,
        errorKind: 'limit',
        error: serverError,
      }
    }
    if (res.status === 400 && serverError?.includes('did-required')) {
      return {
        ok: false,
        signedOut: false,
        errorKind: 'did-required',
        error: serverError,
      }
    }
    return {
      ok: false,
      signedOut: false,
      errorKind: 'runtime',
      error: serverError ?? `Runtime error ${res.status}`,
    }
  } catch (e) {
    logger.warn('agents: create failed', {safeMessage: String(e)})
    return {
      ok: false,
      signedOut: false,
      errorKind: 'network',
      error: errorMessage(e) ?? 'network error',
    }
  }
}

/**
 * GET /app/agents — the agents this owner may choose for a group. Returns an empty list
 * when signed out, unreachable, or the endpoint isn't deployed yet, so the picker degrades
 * to "no agents to add" rather than erroring. Never throws.
 */
export async function fetchOwnerAgents(): Promise<OwnerAgentsResult> {
  let headers: Record<string, string> | null
  try {
    headers = await authHeaders()
  } catch (e) {
    return {
      agents: [],
      signedOut: false,
      error: errorMessage(e) ?? 'auth error',
    }
  }
  if (!headers) return {agents: [], signedOut: true}
  try {
    const res = await fetch(AGENTS_ENDPOINT, {method: 'GET', headers})
    if (res.status === 401 || res.status === 403)
      return {agents: [], signedOut: true}
    if (!res.ok)
      return {
        agents: [],
        signedOut: false,
        error: `Runtime error ${res.status}`,
      }
    return {agents: normalizeOwnerAgents(await res.json()), signedOut: false}
  } catch (e) {
    logger.warn('agents: fetch failed', {safeMessage: String(e)})
    return {
      agents: [],
      signedOut: false,
      error: errorMessage(e) ?? 'network error',
    }
  }
}
