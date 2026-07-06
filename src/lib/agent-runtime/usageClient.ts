/**
 * OWNER USAGE ("agent burn") client — GET /app/usage on the agent runtime.
 *
 * Read-only: per owned agent, headline tokens + ESTIMATED dollars for a window
 * (today / 7d / 30d), with a by-source breakdown (which channel the burn
 * happened on: whatsapp / imessage / sms / app / group / social / public-chat…).
 * The runtime enumerates the agents from the SESSION itself — we never send an
 * owner id — and flags the cost as an estimate (published API prices, not a
 * bill). Mirrors agentsClient.ts: typed results, never throws.
 */
import {logger} from '#/logger'
import {getSupabaseAccessToken} from './authToken'
import {USAGE_ENDPOINT} from './config'

export type UsageWindow = 'today' | '7d' | '30d'

export type UsageBucket = {
  turns: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
}

export type UsageSource = UsageBucket & {source: string}

export type AgentUsage = UsageBucket & {
  agent: string
  name: string | null
  bySource: UsageSource[]
}

export type OwnerUsage = {
  window: UsageWindow
  since: string | null
  agents: AgentUsage[]
  total: UsageBucket
  /** Costs are estimates from published API prices — not a bill. */
  estimated: boolean
}

export type OwnerUsageResult = {
  usage: OwnerUsage | null
  signedOut: boolean
  error?: string
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null
}

function bucket(v: unknown): UsageBucket {
  const r = (v ?? {}) as Record<string, unknown>
  return {
    turns: num(r.turns),
    inputTokens: num(r.inputTokens),
    outputTokens: num(r.outputTokens),
    totalTokens: num(r.totalTokens),
    costUsd: num(r.costUsd),
  }
}

/** Normalize the GET /app/usage payload. PURE + tested — tolerant of sparse rows. */
export function normalizeOwnerUsage(json: unknown): OwnerUsage {
  const r = (json ?? {}) as Record<string, unknown>
  const windowRaw = str(r.window)
  const window: UsageWindow =
    windowRaw === 'today' || windowRaw === '30d' || windowRaw === '7d'
      ? windowRaw
      : '7d'
  const agentsRaw = Array.isArray(r.agents) ? r.agents : []
  const agents: AgentUsage[] = agentsRaw.map(row => {
    const a = (row ?? {}) as Record<string, unknown>
    const sourcesRaw = Array.isArray(a.bySource) ? a.bySource : []
    return {
      agent: str(a.agent) ?? 'unknown',
      name: str(a.name),
      ...bucket(a),
      bySource: sourcesRaw.map(sr => {
        const s = (sr ?? {}) as Record<string, unknown>
        return {source: str(s.source) ?? 'other', ...bucket(s)}
      }),
    }
  })
  const cost = (r.cost ?? {}) as Record<string, unknown>
  return {
    window,
    since: str(r.since),
    agents,
    total: bucket(r.total),
    estimated: cost.estimated !== false,
  }
}

/**
 * Fetch the owner's per-agent usage for a window. Auth failures surface as
 * `signedOut` (the screen shows a sign-in notice); other failures as `error`.
 */
export async function fetchOwnerUsage(
  window: UsageWindow = '7d',
): Promise<OwnerUsageResult> {
  let token: string | null
  try {
    token = await getSupabaseAccessToken()
  } catch {
    token = null
  }
  if (!token) return {usage: null, signedOut: true}
  try {
    const res = await fetch(`${USAGE_ENDPOINT}?window=${window}`, {
      method: 'GET',
      headers: {Authorization: `Bearer ${token}`},
    })
    if (res.status === 401 || res.status === 403) {
      return {usage: null, signedOut: true}
    }
    if (!res.ok) {
      return {
        usage: null,
        signedOut: false,
        error: `Runtime error ${res.status}`,
      }
    }
    const json: unknown = await res.json()
    return {usage: normalizeOwnerUsage(json), signedOut: false}
  } catch (e) {
    logger.warn('usage: fetch failed', {safeMessage: String(e)})
    return {usage: null, signedOut: false, error: 'network error'}
  }
}

/** "12,345" / "1.2M" style compact token formatting for the headline number. */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  return n.toLocaleString('en-US')
}

/** "$0.0132" below a cent, "$1.24" above — always says it's an estimate upstream. */
export function formatCostUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '$0.00'
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`
}
