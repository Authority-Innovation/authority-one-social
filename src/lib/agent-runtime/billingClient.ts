/**
 * OWNER BILLING / PLAN client — GET /app/billing on the agent runtime.
 *
 * Read-only owner surface: the customer's CURRENT plan/tier + token allowance,
 * this-cycle usage against that allowance, the plan catalog, and the AppView
 * handoff URLs (Upgrade → /billing, Manage → /billing/portal). The runtime
 * resolves everything from the SESSION (never an owner id from the request) and
 * flags whether Stripe is armed on the AppView (`billingArmed`).
 *
 * PREVIEW-AWARE: Stripe is disabled in this environment, so `billingArmed` is
 * false and the handoff URLs resolve to the AppView's own in-preview/stub page
 * (never a broken redirect). Mirrors usageClient.ts: typed results, never throws.
 */
import {logger} from '#/logger'
import {getSupabaseAccessToken} from './authToken'
import {BILLING_ENDPOINT} from './config'

/** Plan tiers, matching the AppView catalog / runtime CONSOLE_PLAN_ALLOWANCES. */
export type PlanTier = 'free' | 'pro' | 'scale'

/** Static, non-secret display metadata for each tier (kept client-side so the
 *  screen renders even if the catalog part of the payload is sparse). Prices /
 *  names mirror authority-one-appview/src/billing.js PLANS. */
export type PlanMeta = {
  id: PlanTier
  name: string
  priceLabel: string
  allowance: number
  recommended: boolean
  features: string[]
}

export const PLAN_META: Record<PlanTier, PlanMeta> = {
  free: {
    id: 'free',
    name: 'One Free',
    priceLabel: '$0',
    allowance: 100000,
    recommended: false,
    features: ['1 agent', '100k tokens / mo', 'Prompt-to-upgrade at the cap'],
  },
  pro: {
    id: 'pro',
    name: 'One Pro',
    priceLabel: '$29 / mo',
    allowance: 2000000,
    recommended: true,
    features: ['Multiple agents', '2M tokens / mo', 'Priority routing'],
  },
  scale: {
    id: 'scale',
    name: 'One Max',
    priceLabel: '$99 / mo',
    allowance: 10000000,
    recommended: false,
    features: ['Teams', '10M tokens / mo', 'Highest limits'],
  },
}

/** Ordered tier list for rendering (free → pro → scale). */
export const PLAN_ORDER: PlanTier[] = ['free', 'pro', 'scale']

export type OwnerBilling = {
  /** The customer's current tier. */
  plan: PlanTier
  /** Monthly token allowance for the current tier (0 = unmetered/unknown). */
  allowance: number
  /** Tokens used this cycle across all the owner's agents. */
  used: number
  /** allowance - used (null when allowance is 0). */
  remaining: number | null
  /** used / allowance (0 when allowance is 0). */
  fraction: number
  /** At/over 80% but under 100%. */
  warn: boolean
  /** At/over 100% of the allowance. */
  reached: boolean
  /** Is Stripe armed on the AppView? false ⇒ billing is in preview. */
  billingArmed: boolean
  /** AppView /billing checkout handoff (Upgrade), or null when not configured. */
  upgradeUrl: string | null
  /** AppView /billing/portal handoff (Manage), or null when not configured. */
  manageUrl: string | null
}

export type OwnerBillingResult = {
  billing: OwnerBilling | null
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

function tier(v: unknown): PlanTier {
  return v === 'pro' || v === 'scale' ? v : 'free'
}

/** Normalize the GET /app/billing payload. PURE + tested — tolerant of sparse rows. */
export function normalizeOwnerBilling(json: unknown): OwnerBilling {
  const r = (json ?? {}) as Record<string, unknown>
  const plan = tier(r.plan)
  const allowance = num(r.allowance)
  const used = num(r.used)
  const remaining = allowance > 0 ? Math.max(0, allowance - used) : null
  const fraction = allowance > 0 ? used / allowance : 0
  return {
    plan,
    allowance,
    used,
    remaining,
    fraction,
    warn: allowance > 0 && fraction >= 0.8 && fraction < 1,
    reached: allowance > 0 && used >= allowance,
    billingArmed: r.billingArmed === true,
    upgradeUrl: str(r.upgradeUrl),
    manageUrl: str(r.manageUrl),
  }
}

/**
 * Fetch the owner's current plan + allowance + usage. Auth failures surface as
 * `signedOut` (the screen shows a sign-in notice); other failures as `error`.
 */
export async function fetchOwnerBilling(): Promise<OwnerBillingResult> {
  let token: string | null
  try {
    token = await getSupabaseAccessToken()
  } catch {
    token = null
  }
  if (!token) return {billing: null, signedOut: true}
  try {
    const res = await fetch(BILLING_ENDPOINT, {
      method: 'GET',
      headers: {Authorization: `Bearer ${token}`},
    })
    if (res.status === 401 || res.status === 403) {
      return {billing: null, signedOut: true}
    }
    if (!res.ok) {
      return {
        billing: null,
        signedOut: false,
        error: `Runtime error ${res.status}`,
      }
    }
    const json: unknown = await res.json()
    return {billing: normalizeOwnerBilling(json), signedOut: false}
  } catch (e) {
    logger.warn('billing: fetch failed', {safeMessage: String(e)})
    return {billing: null, signedOut: false, error: 'network error'}
  }
}

/** "12,345" / "1.2M" style compact token formatting. */
export function formatTokenAllowance(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  return n.toLocaleString('en-US')
}
