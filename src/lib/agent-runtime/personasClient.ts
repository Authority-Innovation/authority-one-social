import {logger} from '#/logger'
import {getSupabaseAccessToken} from './authToken'
import {
  PERSONAS_ACTIVE_ENDPOINT,
  PERSONAS_DELETE_ENDPOINT,
  PERSONAS_ENDPOINT,
  PERSONAS_GET_ENDPOINT,
  PERSONAS_UPDATE_ENDPOINT,
  VOICES_ENDPOINT,
} from './config'

/**
 * Client for the runtime's owner-scoped persona/avatar system. Owner-scoping is
 * enforced server-side from the Supabase bearer. Every call optionally targets one
 * of the owner's OTHER agents via `agent` (the FULL handle from a GET /app/agents
 * row): `?agent=` on GETs, an `agent` body field on POSTs. Omitted = the owner's
 * token-mapped agent (today's behavior). A non-owned handle gets a 403
 * {code:'not-your-agent'}, surfaced as a code — NOT as signedOut. Every call is
 * resilient (never throws): reads return `signedOut`/`unreachable` flags so the UI
 * degrades to the profile-name behavior, and writes return ok/error.
 */

export interface PersonaVoice {
  voiceId: string
  name: string
  default?: boolean
}

/**
 * A persona's "fictional life" — optional authored backstory the runtime folds into the
 * agent's character when `enabled`. Owner-authored in the persona editor.
 */
export interface PersonaFiction {
  enabled: boolean
  backstory?: string
  homeBase?: string
  /** Recurring places the persona frequents. */
  haunts: string[]
  weeklyRhythm?: string
}

export interface Persona {
  id: string
  name: string
  voiceId?: string
  /** Light list no longer carries this; present only on legacy/flat responses. */
  personality?: string
  fiction?: PersonaFiction
}

// ── Split persona schema (identity / knowledge base) ─────────────────────────
// The runtime persona model is SPLIT: a compact always-on IDENTITY ("soul") plus a
// larger KNOWLEDGE BASE the agent pulls in when relevant. The list endpoint is light;
// full detail is loaded per-persona from /app/personas/get.

/** The compact, always-on "soul" — the personality folded into every turn. */
export interface PersonaIdentity {
  personality?: string
}

/** One knowledge-base entry: deep lore the agent retrieves when relevant. */
export interface KnowledgeBaseEntry {
  id?: string
  title: string
  /** Retrieval keywords. */
  keywords: string[]
  body: string
}

/** Knowledge base: an always-injected `summary` gist + a list of detail entries. */
export interface KnowledgeBase {
  summary?: string
  entries: KnowledgeBaseEntry[]
}

/**
 * A NAMED reference image the AI can draw on when generating images for this persona
 * (e.g. "avatar", "car", "pet", "house"). `url` is the hosted R2 URL from the media
 * upload path. The first one is treated as the primary profile image / avatar.
 */
export interface ReferenceImage {
  id?: string
  name: string
  url: string
}

/** Full persona detail from POST /app/personas/get. */
export interface PersonaDetail {
  id: string
  name: string
  voiceId?: string
  identity: PersonaIdentity
  knowledgeBase: KnowledgeBase
  /** Named reference photos for image generation. First = primary avatar. */
  referenceImages: ReferenceImage[]
  fiction?: PersonaFiction
}

export interface PersonaDetailResult {
  detail?: PersonaDetail
  signedOut: boolean
  error?: string
}

/** The full GET /app/personas payload, normalized. */
export interface PersonasState {
  personas: Persona[]
  activePersonaId?: string
  activeName?: string
  activeVoiceId?: string
  voices: PersonaVoice[]
  /** Whether the runtime has migrated this owner's personas to the split schema. */
  migrated?: boolean
}

export interface PersonasResult {
  /** Present on success; undefined when signed out / unreachable. */
  state?: PersonasState
  signedOut: boolean
  error?: string
  /** Machine-readable error code from a 4xx (e.g. 'not-your-agent'). */
  code?: string
}

/**
 * Echoed by POST /app/personas/update when renaming the ACTIVE persona: the runtime
 * also republishes the agent's atproto profile, and reports how that went. A save can
 * succeed while the republish fails — surface `published:false` as a subtle warning.
 */
export interface PersonaProfilePublish {
  published: boolean
  displayName?: string
  error?: string
}

export interface PersonaWriteResult {
  ok: boolean
  signedOut: boolean
  error?: string
  /** Machine-readable error code from a 4xx (e.g. 'identity-too-long', 'not-your-agent'). */
  code?: string
  /** Profile-republish outcome, echoed on an active-persona rename. */
  profile?: PersonaProfilePublish
  /**
   * The refreshed personas view the runtime returns on a successful mutation (the same
   * shape as GET /app/personas). Lets the caller update the cache from the authoritative
   * response instead of relying on a follow-up refetch. Absent if the runtime didn't
   * echo a list.
   */
  state?: PersonasState
}

// ── Pure normalizers / helpers (unit-tested) ─────────────────────────────────

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

/** Defensively normalize a persona's optional fiction block. */
export function normalizeFiction(raw: unknown): PersonaFiction | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const f = raw as Record<string, unknown>
  return {
    enabled: f.enabled === true,
    backstory: str(f.backstory),
    homeBase: str(f.homeBase),
    haunts: Array.isArray(f.haunts)
      ? f.haunts.filter(
          (h): h is string => typeof h === 'string' && h.trim().length > 0,
        )
      : [],
    weeklyRhythm: str(f.weeklyRhythm),
  }
}

/** Normalize one raw persona object defensively. Returns null if it has no id. */
function normalizePersona(raw: unknown): Persona | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = str(r.id)
  if (!id) return null
  return {
    id,
    name: str(r.name) ?? id,
    voiceId: str(r.voiceId),
    personality: typeof r.personality === 'string' ? r.personality : undefined,
    fiction: normalizeFiction(r.fiction),
  }
}

function normalizeVoice(raw: unknown): PersonaVoice | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const voiceId = str(r.voiceId)
  if (!voiceId) return null
  return {voiceId, name: str(r.name) ?? voiceId, default: r.default === true}
}

/**
 * Pure: GET /app/personas JSON -> PersonasState. Derives active name/voice from the
 * active persona when the server doesn't echo them, so the header/voice always have
 * a value when there's an active persona.
 */
export function normalizePersonasResponse(json: unknown): PersonasState {
  const j = (json ?? {}) as Record<string, unknown>
  const personas = Array.isArray(j.personas)
    ? j.personas.map(normalizePersona).filter((p): p is Persona => p !== null)
    : []
  const voices = Array.isArray(j.voices)
    ? j.voices.map(normalizeVoice).filter((v): v is PersonaVoice => v !== null)
    : []
  const activePersonaId = str(j.activePersonaId)
  const active = personas.find(p => p.id === activePersonaId)
  return {
    personas,
    voices,
    activePersonaId,
    activeName: str(j.activeName) ?? active?.name,
    activeVoiceId: str(j.activeVoiceId) ?? active?.voiceId,
    migrated: j.migrated === true,
  }
}

// ── Persona detail normalizers (POST /app/personas/get) ──────────────────────

/** Normalize keywords: accept a string[] or a comma/newline-separated string. PURE. */
export function normalizeKeywords(raw: unknown): string[] {
  const parts = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[,\n]/)
      : []
  const out: string[] = []
  const seen = new Set<string>()
  for (const p of parts) {
    if (typeof p !== 'string') continue
    const v = p.trim()
    if (!v) continue
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out
}

/** Normalize one raw knowledge-base entry. Returns null when it has no title and no body. */
export function normalizeKbEntry(raw: unknown): KnowledgeBaseEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const title = typeof r.title === 'string' ? r.title : ''
  const body = typeof r.body === 'string' ? r.body : ''
  if (!title.trim() && !body.trim()) return null
  return {
    id: str(r.id),
    title,
    keywords: normalizeKeywords(r.keywords),
    body,
  }
}

/** Normalize the knowledge-base block defensively (summary + entries). PURE. */
export function normalizeKnowledgeBase(raw: unknown): KnowledgeBase {
  const k = (raw ?? {}) as Record<string, unknown>
  return {
    summary: str(k.summary),
    entries: Array.isArray(k.entries)
      ? k.entries
          .map(normalizeKbEntry)
          .filter((e): e is KnowledgeBaseEntry => e !== null)
      : [],
  }
}

/** Normalize one reference image. Returns null without a usable url. PURE. */
export function normalizeReferenceImage(raw: unknown): ReferenceImage | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const url = str(r.url) ?? str(r.imageUrl) ?? str(r.uri)
  if (!url) return null
  return {id: str(r.id), name: str(r.name) ?? str(r.label) ?? '', url}
}

/** Normalize the persona's named reference images (tolerant of field drift). PURE. */
export function normalizeReferenceImages(raw: unknown): ReferenceImage[] {
  return Array.isArray(raw)
    ? raw
        .map(normalizeReferenceImage)
        .filter((r): r is ReferenceImage => r !== null)
    : []
}

/**
 * Normalize the POST /app/personas/get payload ({persona:{...}}) into a PersonaDetail.
 * Tolerates a legacy flat `personality` by lifting it into `identity`. Returns null
 * without an id. PURE.
 */
export function normalizePersonaDetail(json: unknown): PersonaDetail | null {
  const j = (json ?? {}) as Record<string, unknown>
  const raw = (
    j.persona && typeof j.persona === 'object' ? j.persona : j
  ) as Record<string, unknown>
  const id = str(raw.id)
  if (!id) return null
  const identityRaw =
    raw.identity && typeof raw.identity === 'object'
      ? (raw.identity as Record<string, unknown>)
      : {}
  const personality =
    str(identityRaw.personality) ??
    (typeof raw.personality === 'string' ? raw.personality : undefined)
  return {
    id,
    name: str(raw.name) ?? id,
    voiceId: str(raw.voiceId),
    identity: {personality},
    knowledgeBase: normalizeKnowledgeBase(raw.knowledgeBase),
    referenceImages: normalizeReferenceImages(raw.referenceImages),
    fiction: normalizeFiction(raw.fiction),
  }
}

/** Pure: the chat header name — active persona name wins, else the fallback. */
export function pickAgentHeaderName(
  activeName: string | undefined,
  fallback: string,
): string {
  const trimmed = activeName?.trim()
  return trimmed || fallback
}

/** Pure: the voice-mode voice id — the active persona's voice, if any. */
export function pickActiveVoiceId(
  activeVoiceId: string | undefined,
): string | undefined {
  const trimmed = activeVoiceId?.trim()
  return trimmed || undefined
}

// ── Authed transport ─────────────────────────────────────────────────────────

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

/** Append the optional agent scope to a GET url (`?agent=<full handle>`). */
function withAgent(url: string, agent?: string): string {
  return agent ? `${url}?agent=${encodeURIComponent(agent)}` : url
}

/** Merge the optional agent scope into a POST body (omitted when unset). */
function scoped(
  body: Record<string, unknown>,
  agent?: string,
): Record<string, unknown> {
  return agent ? {...body, agent} : body
}

/** Parse a response body as JSON, absorbing sync AND async failures (empty body etc). */
function safeJson(res: {json?: () => Promise<unknown>}): Promise<unknown> {
  return Promise.resolve()
    .then(() => res.json?.())
    .catch(() => undefined)
}

/**
 * GET /app/personas — the full persona state. Optionally scoped to one of the
 * owner's agents via `agent` (full handle). Never throws.
 */
export async function fetchPersonas(agent?: string): Promise<PersonasResult> {
  let headers: Record<string, string> | null
  try {
    headers = await authHeaders()
  } catch (e) {
    return {signedOut: false, error: errorMessage(e) ?? 'auth error'}
  }
  if (!headers) return {signedOut: true}

  try {
    const res = await fetch(withAgent(PERSONAS_ENDPOINT, agent), {
      method: 'GET',
      headers,
    })
    if (res.status === 401 || res.status === 403) {
      // Distinguish "you don't own that agent" from a dead session.
      const errJson = (await safeJson(res)) as
        | {code?: unknown; error?: unknown}
        | undefined
      const code = str(errJson?.code)
      if (code) {
        return {signedOut: false, code, error: str(errJson?.error)}
      }
      return {signedOut: false}
    }
    if (!res.ok) return {signedOut: false, error: `Runtime error ${res.status}`}
    const json: unknown = await res.json()
    return {state: normalizePersonasResponse(json), signedOut: false}
  } catch (e) {
    logger.warn('personas: fetch failed', {safeMessage: String(e)})
    return {signedOut: false, error: errorMessage(e) ?? 'network error'}
  }
}

/** GET /app/voices — available voices (also included in GET /app/personas). */
export async function fetchVoices(): Promise<PersonaVoice[]> {
  try {
    const headers = await authHeaders()
    if (!headers) return []
    const res = await fetch(VOICES_ENDPOINT, {method: 'GET', headers})
    if (!res.ok) return []
    const json = (await res.json()) as {voices?: unknown}
    return Array.isArray(json?.voices)
      ? json.voices
          .map(normalizeVoice)
          .filter((v): v is PersonaVoice => v !== null)
      : []
  } catch (e) {
    logger.warn('personas: fetchVoices failed', {safeMessage: String(e)})
    return []
  }
}

/**
 * POST /app/personas/get {id} — full persona detail (identity + knowledge base + fiction).
 * The list is light now, so the editor calls this to load a persona for editing. Never
 * throws; returns signedOut / error flags so the editor can degrade.
 */
export async function fetchPersonaDetail(
  id: string,
  agent?: string,
): Promise<PersonaDetailResult> {
  let headers: Record<string, string> | null
  try {
    headers = await authHeaders()
  } catch (e) {
    return {signedOut: false, error: errorMessage(e) ?? 'auth error'}
  }
  if (!headers) return {signedOut: true}
  try {
    const res = await fetch(PERSONAS_GET_ENDPOINT, {
      method: 'POST',
      headers: {...headers, 'Content-Type': 'application/json'},
      body: JSON.stringify(scoped({id}, agent)),
    })
    if (res.status === 401 || res.status === 403) {
      const errJson = (await safeJson(res)) as
        | {code?: unknown; error?: unknown}
        | undefined
      const code = str(errJson?.code)
      if (code) {
        return {
          signedOut: false,
          error: str(errJson?.error) ?? `Runtime error ${res.status}`,
        }
      }
      return {signedOut: true}
    }
    if (!res.ok) return {signedOut: false, error: `Runtime error ${res.status}`}
    const detail = normalizePersonaDetail(await res.json()) ?? undefined
    return {detail, signedOut: false}
  } catch (e) {
    logger.warn('personas: fetch detail failed', {safeMessage: String(e)})
    return {signedOut: false, error: errorMessage(e) ?? 'network error'}
  }
}

async function postJson(
  url: string,
  body: Record<string, unknown>,
): Promise<PersonaWriteResult> {
  let headers: Record<string, string> | null
  try {
    headers = await authHeaders()
  } catch (e) {
    return {ok: false, signedOut: false, error: errorMessage(e) ?? 'auth error'}
  }
  if (!headers) return {ok: false, signedOut: true}
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {...headers, 'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      // Surface the runtime's machine-readable code (e.g. identity-too-long,
      // not-your-agent) + message so the editor can show a specific, helpful error.
      // A coded 401/403 (e.g. not-your-agent) is an ownership error, NOT a dead
      // session — only an uncoded one degrades to signedOut.
      const errJson = (await safeJson(res)) as
        | {code?: unknown; error?: unknown; message?: unknown}
        | undefined
      const code = str(errJson?.code)
      if ((res.status === 401 || res.status === 403) && !code) {
        return {ok: false, signedOut: true}
      }
      return {
        ok: false,
        signedOut: false,
        code,
        error:
          str(errJson?.error) ??
          str(errJson?.message) ??
          `Runtime error ${res.status}`,
      }
    }
    // The runtime echoes the refreshed personas view on success; carry it back so the
    // caller can update the cache authoritatively (no refetch race). Only attach a state
    // when the body actually looks like a personas view, so a malformed/empty body can't
    // wipe the cached list.
    const json: unknown = await res.json().catch(() => undefined)
    const hasView =
      !!json &&
      typeof json === 'object' &&
      Array.isArray((json as {personas?: unknown}).personas)
    const profileRaw =
      json && typeof json === 'object'
        ? (json as {profile?: unknown}).profile
        : undefined
    const profile =
      profileRaw && typeof profileRaw === 'object'
        ? (() => {
            const p = profileRaw as Record<string, unknown>
            return {
              published: p.published === true,
              displayName: str(p.displayName),
              error: str(p.error),
            }
          })()
        : undefined
    return {
      ok: true,
      signedOut: false,
      ...(hasView ? {state: normalizePersonasResponse(json)} : {}),
      ...(profile ? {profile} : {}),
    }
  } catch (e) {
    logger.warn('personas: write failed', {safeMessage: String(e)})
    return {
      ok: false,
      signedOut: false,
      error: errorMessage(e) ?? 'network error',
    }
  }
}

/**
 * Create/update input in the SPLIT shape: a compact `identity` (always-on soul) + a
 * `knowledgeBase` (deep lore) + optional `fiction`. The runtime still accepts a legacy
 * flat `personality`, but we always send the nested shape. Fields are omitted when
 * undefined (absent ⇒ no change server-side).
 */
export interface PersonaWriteInput {
  name?: string
  voiceId?: string
  identity?: PersonaIdentity
  knowledgeBase?: KnowledgeBase
  /** Named reference photos for image generation (first = primary avatar). */
  referenceImages?: ReferenceImage[]
  fiction?: PersonaFiction
}

/** Build the nested wire body, omitting undefined fields. */
function personaBody(input: PersonaWriteInput): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (input.name !== undefined) body.name = input.name
  if (input.voiceId !== undefined) body.voiceId = input.voiceId
  if (input.identity !== undefined) body.identity = input.identity
  if (input.knowledgeBase !== undefined)
    body.knowledgeBase = input.knowledgeBase
  if (input.referenceImages !== undefined)
    body.referenceImages = input.referenceImages
  if (input.fiction !== undefined) body.fiction = input.fiction
  return body
}

export function createPersona(
  input: PersonaWriteInput & {name: string},
  agent?: string,
): Promise<PersonaWriteResult> {
  return postJson(PERSONAS_ENDPOINT, scoped(personaBody(input), agent))
}

export function updatePersona(
  input: PersonaWriteInput & {id: string},
  agent?: string,
): Promise<PersonaWriteResult> {
  return postJson(
    PERSONAS_UPDATE_ENDPOINT,
    scoped({id: input.id, ...personaBody(input)}, agent),
  )
}

export function deletePersona(
  input: {id: string},
  agent?: string,
): Promise<PersonaWriteResult> {
  return postJson(PERSONAS_DELETE_ENDPOINT, scoped({id: input.id}, agent))
}

export function setActivePersona(
  input: {id: string},
  agent?: string,
): Promise<PersonaWriteResult> {
  return postJson(PERSONAS_ACTIVE_ENDPOINT, scoped({id: input.id}, agent))
}
