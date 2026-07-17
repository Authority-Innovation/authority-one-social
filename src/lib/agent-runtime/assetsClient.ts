import {logger} from '#/logger'
import {getSupabaseAccessToken} from './authToken'
import {agentAssetsUrl} from './config'

/**
 * Per-agent ASSET LEDGER client — the "camera roll" behind the AgentHub Gallery
 * tab. GET /app/agents/:agent/assets returns everything the agent has seen
 * across its conversations (images, video, documents), newest-first, paginated
 * by an opaque cursor.
 *
 * SECURITY: `caption`, `provenance.sender`, and `provenance.conversationTitle`
 * are THIRD-PARTY-AUTHORED (WhatsApp group members, OCR'd image text). The
 * runtime flags this with `untrustedCaption:true`. This client only carries the
 * strings; the UI renders them as inert data (React Native <Text>, which never
 * interprets markup) - it must never treat them as commands/markup.
 *
 * Same owner-scoped /app auth + resilience contract as the conversations client:
 * every call degrades gracefully and never throws. A coded ownership error (403
 * not-your-agent) surfaces as `notOwned` so the Gallery can message it.
 */

export type AssetType = 'image' | 'video' | 'document'

export interface AssetProvenance {
  /** Source conversation id (e.g. `wa:1203...@g.us`). */
  conversationId?: string
  /** UNTRUSTED: conversation title (third-party-authored). Render as data. */
  conversationTitle?: string
  /** UNTRUSTED: who shared it (third-party-authored). Render as data. */
  sender?: string
}

export interface AgentAsset {
  /** Stable ledger reference (usually equals `url`). */
  ref: string
  /** Public R2 URL for the full asset. */
  url: string
  /** Image-only preview URL; null for video/document. */
  thumbnail: string | null
  type: AssetType
  /** ISO-8601 capture time. */
  at: string
  provenance: AssetProvenance
  /** UNTRUSTED: Sensus OCR/caption if present (null otherwise). Render as data. */
  caption: string | null
}

export interface AgentAssetsPage {
  assets: AgentAsset[]
  /** Pass back as `cursor` to fetch the next page; null = no more pages. */
  nextCursor: string | null
  /** True when captions/provenance on this page are third-party-authored. */
  untrustedCaption: boolean
  signedOut: boolean
  /** Set when the session owner does not own this agent (403). */
  notOwned?: boolean
  error?: string
}

export interface AssetsQuery {
  type?: AssetType
  /** `today` | `yesterday` | `week` | `month` | ISO date. */
  since?: string
  /** ISO date upper bound. */
  until?: string
  cursor?: string
  /** 1..100 (runtime default 30). */
  limit?: number
}

// -- Pure helpers (unit-tested) ----------------------------------------------

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

/** The runtime's asset types; anything else is coerced to 'document'. */
function assetType(v: unknown): AssetType {
  return v === 'image' || v === 'video' ? v : 'document'
}

/** Normalize one provenance blob defensively. Always returns an object. */
export function normalizeProvenance(raw: unknown): AssetProvenance {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const out: AssetProvenance = {}
  const conversationId = str(r.conversationId)
  if (conversationId) out.conversationId = conversationId
  const conversationTitle = str(r.conversationTitle)
  if (conversationTitle) out.conversationTitle = conversationTitle
  const sender = str(r.sender)
  if (sender) out.sender = sender
  return out
}

/**
 * Normalize one raw asset row defensively. Returns null when there is no usable
 * url (ref falls back to url so a row is never dropped for a missing ref alone).
 */
export function normalizeAsset(raw: unknown): AgentAsset | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const url = str(r.url) ?? str(r.ref)
  if (!url) return null
  const type = assetType(r.type)
  // Only images carry a thumbnail; ignore any thumbnail on video/document.
  const thumbnail = type === 'image' ? (str(r.thumbnail) ?? null) : null
  return {
    ref: str(r.ref) ?? url,
    url,
    thumbnail,
    type,
    at: str(r.at) ?? '',
    provenance: normalizeProvenance(r.provenance),
    caption: str(r.caption) ?? null,
  }
}

/** Rows arrive newest-first from the runtime; keep that order after filtering. */
export function normalizeAssets(json: unknown): AgentAsset[] {
  const rows = (json as {assets?: unknown})?.assets
  if (!Array.isArray(rows)) return []
  return rows
    .map(normalizeAsset)
    .filter((asset): asset is AgentAsset => asset !== null)
}

/** A short, human label for a provenance blob, or undefined when empty. PURE. */
export function provenanceSummary(p: AssetProvenance): string | undefined {
  if (p.sender) return p.sender
  if (p.conversationTitle) return p.conversationTitle
  return undefined
}

// -- Transport ---------------------------------------------------------------

/**
 * One page of the agent's asset ledger. Signed out / unreachable / not-owned
 * degrade to an empty page (with flags), never a throw. A coded 403 sets
 * `notOwned` (distinct from a dead session, which sets `signedOut`).
 */
export async function fetchAgentAssets(
  agent: string,
  query: AssetsQuery = {},
): Promise<AgentAssetsPage> {
  const empty = (extra: Partial<AgentAssetsPage>): AgentAssetsPage => ({
    assets: [],
    nextCursor: null,
    untrustedCaption: false,
    signedOut: false,
    ...extra,
  })
  try {
    const token = await getSupabaseAccessToken()
    if (!token) return empty({signedOut: true})
    const res = await fetch(agentAssetsUrl(agent, query), {
      method: 'GET',
      headers: {Authorization: `Bearer ${token}`},
    })
    if (!res.ok) {
      // A 403 is an ownership error (not-your-agent), NOT a dead session.
      if (res.status === 403) return empty({notOwned: true})
      if (res.status === 401) return empty({signedOut: true})
      logger.warn('assets: fetch non-ok', {safeMessage: `status ${res.status}`})
      return empty({error: `status ${res.status}`})
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return {
      assets: normalizeAssets(json),
      nextCursor: str(json.nextCursor) ?? null,
      untrustedCaption: json.untrustedCaption === true,
      signedOut: false,
    }
  } catch (e) {
    logger.warn('assets: fetch failed', {safeMessage: String(e)})
    return empty({error: String(e)})
  }
}
