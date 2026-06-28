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
 * enforced server-side from the Supabase bearer; no agent/handle is sent. Every
 * call is resilient (never throws): reads return `signedOut`/`unreachable` flags
 * so the UI degrades to the profile-name behavior, and writes return ok/error.
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

/** Full persona detail from POST /app/personas/get. */
export interface PersonaDetail {
  id: string
  name: string
  voiceId?: string
  identity: PersonaIdentity
  knowledgeBase: KnowledgeBase
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
}

export interface PersonaWriteResult {
  ok: boolean
  signedOut: boolean
  error?: string
  /** Machine-readable error code from a 4xx (e.g. 'identity-too-long', 'persona-too-large'). */
  code?: string
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

/** GET /app/personas — the full persona state. Never throws. */
export async function fetchPersonas(): Promise<PersonasResult> {
  let headers: Record<string, string> | null
  try {
    headers = await authHeaders()
  } catch (e) {
    return {signedOut: false, error: errorMessage(e) ?? 'auth error'}
  }
  if (!headers) return {signedOut: true}

  try {
    const res = await fetch(PERSONAS_ENDPOINT, {method: 'GET', headers})
    if (res.status === 401 || res.status === 403) return {signedOut: false}
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
      body: JSON.stringify({id}),
    })
    if (res.status === 401 || res.status === 403) return {signedOut: true}
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
    if (res.status === 401 || res.status === 403) {
      return {ok: false, signedOut: true}
    }
    if (!res.ok) {
      // Surface the runtime's machine-readable code (e.g. identity-too-long,
      // persona-too-large) + message so the editor can show a specific, helpful error.
      const errJson = (await res.json().catch(() => undefined)) as
        | {code?: unknown; error?: unknown; message?: unknown}
        | undefined
      return {
        ok: false,
        signedOut: false,
        code: str(errJson?.code),
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
    return {
      ok: true,
      signedOut: false,
      ...(hasView ? {state: normalizePersonasResponse(json)} : {}),
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
  if (input.fiction !== undefined) body.fiction = input.fiction
  return body
}

export function createPersona(
  input: PersonaWriteInput & {name: string},
): Promise<PersonaWriteResult> {
  return postJson(PERSONAS_ENDPOINT, personaBody(input))
}

export function updatePersona(
  input: PersonaWriteInput & {id: string},
): Promise<PersonaWriteResult> {
  return postJson(PERSONAS_UPDATE_ENDPOINT, {
    id: input.id,
    ...personaBody(input),
  })
}

export function deletePersona(input: {
  id: string
}): Promise<PersonaWriteResult> {
  return postJson(PERSONAS_DELETE_ENDPOINT, {id: input.id})
}

export function setActivePersona(input: {
  id: string
}): Promise<PersonaWriteResult> {
  return postJson(PERSONAS_ACTIVE_ENDPOINT, {id: input.id})
}
