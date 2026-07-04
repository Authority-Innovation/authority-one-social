import {logger} from '#/logger'
import {getSupabaseAccessToken} from './authToken'
import {voiceDeleteUrl, VOICES_ENDPOINT} from './config'

/**
 * Voice library client (owner-scoped): the voice REGISTRY behind the persona
 * editor's voice picker. GET /app/voices returns {builtins, custom} (plus a legacy
 * flat `voices` list which this client ignores — the flat list also still rides on
 * GET /app/personas for back-compat). Owners can add ElevenLabs voices by id
 * (POST) and remove custom ones (DELETE /app/voices/:id).
 *
 * Persona voiceId storage accepts THREE forms:
 *   - raw ElevenLabs id (legacy — keep working)
 *   - `builtin:<key>` for a built-in registry voice
 *   - `voice:<id>` for a custom library voice
 * The picker WRITES the prefixed forms going forward; the pure helpers below
 * resolve any stored form back to a picker option.
 */

export interface BuiltinVoice {
  key: string
  label: string
  voiceId: string
  default?: boolean
}

export interface CustomVoice {
  id: string
  label: string
  voiceId: string
  createdAt?: string
}

export interface VoiceRegistry {
  builtins: BuiltinVoice[]
  custom: CustomVoice[]
}

export interface VoiceRegistryResult {
  registry?: VoiceRegistry
  signedOut: boolean
  error?: string
}

export interface VoiceWriteResult {
  ok: boolean
  signedOut: boolean
  /** Machine-readable error code (label-required, bad-voice-id, voice-exists,
   *  library-full, voice-not-found, ...). */
  code?: string
  error?: string
  entry?: CustomVoice
}

/** One selectable option in the voice picker, across builtin/custom/legacy. */
export interface VoicePickOption {
  /** The value the persona editor WRITES to the persona's voiceId field. */
  value: string
  /** Stable unique key for list rendering / selection. */
  key: string
  label: string
  /** The underlying ElevenLabs voice id (used to match legacy raw-id personas). */
  voiceId: string
  kind: 'builtin' | 'custom' | 'legacy'
  default?: boolean
  /** Custom-voice registry id (delete target). */
  customId?: string
}

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

/** Client-side mirror of the runtime's ElevenLabs voice-id shape check. */
export function isValidElevenLabsVoiceId(id: string): boolean {
  return /^[A-Za-z0-9]{8,64}$/.test(id)
}

/** Normalize the GET /app/voices payload. Returns null when the registry shape is
 *  absent (legacy runtime) so callers can fall back to the flat list. PURE. */
export function normalizeVoiceRegistry(json: unknown): VoiceRegistry | null {
  const j = (json ?? {}) as Record<string, unknown>
  if (!Array.isArray(j.builtins) && !Array.isArray(j.custom)) return null
  const builtins: BuiltinVoice[] = (
    Array.isArray(j.builtins) ? j.builtins : []
  ).flatMap(raw => {
    if (!raw || typeof raw !== 'object') return []
    const r = raw as Record<string, unknown>
    const key = str(r.key)
    const voiceId = str(r.voiceId)
    if (!key || !voiceId) return []
    return [
      {
        key,
        voiceId,
        label: str(r.label) ?? key,
        ...(r.default === true ? {default: true} : {}),
      },
    ]
  })
  const custom: CustomVoice[] = (
    Array.isArray(j.custom) ? j.custom : []
  ).flatMap(raw => {
    if (!raw || typeof raw !== 'object') return []
    const r = raw as Record<string, unknown>
    const id = str(r.id)
    const voiceId = str(r.voiceId)
    if (!id || !voiceId) return []
    return [
      {id, voiceId, label: str(r.label) ?? id, createdAt: str(r.createdAt)},
    ]
  })
  return {builtins, custom}
}

/** The registry projected as picker options (builtins first, then custom). PURE. */
export function voicePickOptions(registry: VoiceRegistry): VoicePickOption[] {
  return [
    ...registry.builtins.map(
      (b): VoicePickOption => ({
        value: `builtin:${b.key}`,
        key: `builtin:${b.key}`,
        label: b.label,
        voiceId: b.voiceId,
        kind: 'builtin',
        ...(b.default ? {default: true} : {}),
      }),
    ),
    ...registry.custom.map(
      (c): VoicePickOption => ({
        value: `voice:${c.id}`,
        key: `voice:${c.id}`,
        label: c.label,
        voiceId: c.voiceId,
        kind: 'custom',
        customId: c.id,
      }),
    ),
  ]
}

/**
 * Resolve a persona's STORED voiceId (raw ElevenLabs id, `builtin:<key>`, or
 * `voice:<id>`) to the matching picker option's key. Legacy raw ids match by the
 * underlying ElevenLabs voice id, so existing personas render/selected correctly.
 * Returns undefined when nothing matches. PURE.
 */
export function resolveVoiceSelection(
  options: VoicePickOption[],
  storedVoiceId: string | undefined,
): string | undefined {
  const stored = storedVoiceId?.trim()
  if (!stored) return undefined
  const direct = options.find(o => o.value === stored)
  if (direct) return direct.key
  // Legacy raw ElevenLabs id: match the underlying voice id (builtins first).
  const byVoiceId = options.find(o => o.voiceId === stored)
  return byVoiceId?.key
}

/** The default option key: the flagged built-in, else the first option. PURE. */
export function defaultVoiceSelection(
  options: VoicePickOption[],
): string | undefined {
  return (options.find(o => o.default) ?? options[0])?.key
}

/** The matched option's label for any stored voiceId form; undefined when the
 *  registry doesn't know it (callers fall back to legacy lists / the raw id). PURE. */
export function voiceDisplayLabel(
  options: VoicePickOption[],
  storedVoiceId: string | undefined,
): string | undefined {
  const stored = storedVoiceId?.trim()
  if (!stored) return undefined
  const key = resolveVoiceSelection(options, stored)
  if (key === undefined) return undefined
  return options.find(o => o.key === key)?.label
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

/** GET /app/voices — the voice registry. Never throws. `registry` is undefined
 *  when signed out, unreachable, or the runtime predates the registry shape. */
export async function fetchVoiceRegistry(): Promise<VoiceRegistryResult> {
  try {
    const headers = await authHeaders()
    if (!headers) return {signedOut: true}
    const res = await fetch(VOICES_ENDPOINT, {method: 'GET', headers})
    if (res.status === 401 || res.status === 403) return {signedOut: true}
    if (!res.ok) return {signedOut: false, error: `Runtime error ${res.status}`}
    const registry = normalizeVoiceRegistry(await res.json())
    return {registry: registry ?? undefined, signedOut: false}
  } catch (e) {
    logger.warn('voices: fetch registry failed', {safeMessage: String(e)})
    return {signedOut: false, error: errorMessage(e) ?? 'network error'}
  }
}

/** POST /app/voices {label, elevenLabsVoiceId} — add a custom voice. Never throws. */
export async function addLibraryVoice(input: {
  label: string
  elevenLabsVoiceId: string
}): Promise<VoiceWriteResult> {
  const headers = await authHeaders().catch(() => null)
  if (!headers) return {ok: false, signedOut: true}
  try {
    const res = await fetch(VOICES_ENDPOINT, {
      method: 'POST',
      headers: {...headers, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        label: input.label,
        elevenLabsVoiceId: input.elevenLabsVoiceId,
      }),
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const code = str(json.code) ?? str(json.error)
      if ((res.status === 401 || res.status === 403) && !code) {
        return {ok: false, signedOut: true}
      }
      return {
        ok: false,
        signedOut: false,
        code,
        error:
          str(json.message) ?? str(json.error) ?? `Runtime error ${res.status}`,
      }
    }
    const entryRaw =
      json.entry && typeof json.entry === 'object'
        ? (json.entry as Record<string, unknown>)
        : undefined
    const id = str(entryRaw?.id)
    const voiceId = str(entryRaw?.voiceId)
    return {
      ok: true,
      signedOut: false,
      entry:
        id && voiceId
          ? {
              id,
              voiceId,
              label: str(entryRaw?.label) ?? input.label,
              createdAt: str(entryRaw?.createdAt),
            }
          : undefined,
    }
  } catch (e) {
    logger.warn('voices: add failed', {safeMessage: String(e)})
    return {
      ok: false,
      signedOut: false,
      error: errorMessage(e) ?? 'network error',
    }
  }
}

/** DELETE /app/voices/:id — remove a custom voice. Personas still pointing at it
 *  fall back to the default voice server-side (no break). Never throws. */
export async function removeLibraryVoice(
  id: string,
): Promise<VoiceWriteResult> {
  const headers = await authHeaders().catch(() => null)
  if (!headers) return {ok: false, signedOut: true}
  try {
    const res = await fetch(voiceDeleteUrl(id), {method: 'DELETE', headers})
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const code = str(json.code) ?? str(json.error)
      if ((res.status === 401 || res.status === 403) && !code) {
        return {ok: false, signedOut: true}
      }
      return {
        ok: false,
        signedOut: false,
        code,
        error:
          res.status === 404
            ? 'That voice is no longer in your library.'
            : (str(json.message) ??
              str(json.error) ??
              `Runtime error ${res.status}`),
      }
    }
    return {ok: true, signedOut: false}
  } catch (e) {
    logger.warn('voices: remove failed', {safeMessage: String(e)})
    return {
      ok: false,
      signedOut: false,
      error: errorMessage(e) ?? 'network error',
    }
  }
}
