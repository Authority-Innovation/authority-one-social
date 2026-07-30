import {logger} from '#/logger'
import {getSupabaseAccessToken} from './authToken'
import {
  KNOWLEDGE_ENDPOINT,
  KNOWLEDGE_UPLOAD_ENDPOINT,
  KNOWLEDGE_UPLOAD_MAX_BYTES,
} from './config'

/**
 * Client for the runtime's owner-scoped knowledge-base FILE SLOTS: upload a text
 * document into an agent's long-term Mnemonic memory (alongside the existing
 * chat/event ingestion) and list what's been uploaded. Agent-scoped exactly like the
 * persona/social-autonomy clients: `?agent=` on both routes (the FULL handle from a
 * GET /app/agents row); omitted = the owner's token-mapped agent. A non-owned handle
 * gets a 403 {code:'not-your-agent'} — surfaced as a code, NOT as signedOut.
 *
 * A saved file goes STRAIGHT INTO the agent's long-term memory and is searchable
 * within a minute or two — status 'saved' is the live state, not a queue (verified
 * 2026-07-31: uploads land in Mnemonic as `active` and come back in recall; there is
 * no review step and no reviewer). `provisional` is the runtime's flag for "written",
 * kept for wire compatibility; it does NOT mean the file is withheld from recall.
 * The runtime refuses documents honestly, never faking success:
 *   - emails/phones in a text file are reversibly TOKENIZED (the owner holds the key)
 *     and credentials are stripped — that path saves, it does not refuse
 *   - a genuine refusal (memory writes switched off for the agent, an ingest failure)
 *     -> HTTP 200 {ok:false, status:'blocked'|'failed', file:{reason:<internal reason>}}
 *     — run every such reason through knowledgeReasonMessage before showing it
 *   - docx/image -> 415 (not supported yet); >512KB -> 413; empty -> 400.
 * The upload transport reads RAW bytes (no multipart) with the file's Content-Type,
 * the same shape uploadChatImage uses. Text formats go as text/*; PDFs go as
 * application/pdf binary (never UTF-8-decoded) for the runtime's document-extraction
 * pipeline. Typed results, never throws.
 */

/** One uploaded file "slot" as the runtime reports it. */
export interface KnowledgeFile {
  id: string
  name: string
  size: number
  contentType: string | null
  /** ISO timestamp the runtime stamped when the file was ingested. */
  uploadedAt: string
  /** 'saved' (written — in memory, searchable) | 'blocked' (refused) | 'failed'. */
  status: 'saved' | 'blocked' | 'failed'
  /** The runtime's "written" flag. NOT a review/hold state — a saved file is live. */
  provisional: boolean
  /** True when the runtime truncated an oversize file (not used by the app path today). */
  truncated: boolean
  /** False when the item is switched off (no recall/injection). Legacy rows read true. */
  enabled: boolean
  /** Honest INTERNAL reason for a blocked/failed file; null when saved. Never render
   *  it raw — it can carry config keys/HTTP detail. Use knowledgeReasonMessage. */
  reason: string | null
  /** The created Mnemonic artifact id when the runtime surfaces one; may be null. */
  artifactId: string | null
}

export interface KnowledgeListResult {
  files?: KnowledgeFile[]
  /** True when there's no session (signed out) — the UI shows a sign-in notice. */
  signedOut?: boolean
  /** Runtime machine code (e.g. 'not-your-agent') when the read failed with one. */
  code?: string
  error?: string
}

/** A picked text file ready to upload: raw bytes as a Blob + its name/mime/size. */
export interface KnowledgeFileToUpload {
  blob: Blob
  name: string
  mime: string
  size: number
}

export interface KnowledgeUploadResult {
  ok: boolean
  /** The recorded slot on success OR on an honest block (status carries the reason). */
  file?: KnowledgeFile
  signedOut?: boolean
  code?: string
  error?: string
}

/**
 * What actually happened to the raw data UPSTREAM when a slot was removed. The
 * runtime's memory layer may be append-only: removal always unlists the item from
 * the agent (no more recall/injection), but only 'purged' means the raw data was
 * destroyed. 'retained' = upstream copy still exists; 'unsupported' = upstream
 * can't purge at all. The UI must not claim deletion unless this is 'purged'.
 */
export type KnowledgeUpstreamOutcome = 'purged' | 'retained' | 'unsupported'

export interface KnowledgeDeleteResult {
  ok: boolean
  /** The removed slot id, echoed by the runtime on success. */
  id?: string
  /** True when the item is no longer listed/recalled/injected for this agent. */
  removed?: boolean
  /** Missing/unknown values are treated as NOT purged by the message helper. */
  upstream?: KnowledgeUpstreamOutcome
  /** The runtime's own human-readable outcome sentence, when it sends one. */
  message?: string
  signedOut?: boolean
  code?: string
  error?: string
}

export interface KnowledgeToggleResult {
  ok: boolean
  /** The toggled slot id, echoed by the runtime. */
  id?: string
  /** The item's state AFTER the call, as the runtime reports it. */
  enabled?: boolean
  /** False when the item was already in the requested state (idempotent success). */
  changed?: boolean
  /** The slot's file name, echoed by the runtime. */
  name?: string
  /**
   * The runtime's user-displayable outcome sentence — written to be shown
   * VERBATIM. It is deliberately honest about what disabling does and doesn't
   * do (some underlying events can't be hidden upstream), so the UI must show
   * it rather than composing its own success copy.
   */
  message?: string
  signedOut?: boolean
  /** 'deleted' (409): the item was deleted, not merely off — surface clearly. */
  code?: string
  error?: string
}

function errorMessage(e: unknown): string | undefined {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return undefined
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

async function authHeaders(): Promise<Record<string, string> | null> {
  const token = await getSupabaseAccessToken()
  if (!token) return null
  return {Authorization: `Bearer ${token}`}
}

/** Normalize one runtime file row into a typed KnowledgeFile (tolerant of partials). */
function normalizeFile(raw: unknown): KnowledgeFile | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const status =
    r.status === 'blocked' || r.status === 'failed' ? r.status : 'saved'
  return {
    id: str(r.id) ?? '',
    name: str(r.name) ?? 'document',
    size: typeof r.size === 'number' && Number.isFinite(r.size) ? r.size : 0,
    contentType: str(r.contentType) ?? null,
    uploadedAt: str(r.uploadedAt) ?? '',
    status,
    provisional: r.provisional === true,
    truncated: r.truncated === true,
    enabled: r.enabled !== false,
    reason: str(r.reason) ?? null,
    artifactId: str(r.artifactId) ?? null,
  }
}

/** GET /app/knowledge — the agent's uploaded file slots (newest first). Never throws. */
export async function fetchKnowledgeFiles(
  agent?: string,
): Promise<KnowledgeListResult> {
  let headers: Record<string, string> | null
  try {
    headers = await authHeaders()
  } catch (e) {
    return {signedOut: false, error: errorMessage(e) ?? 'auth error'}
  }
  if (!headers) return {signedOut: true}
  try {
    const url = agent
      ? `${KNOWLEDGE_ENDPOINT}?agent=${encodeURIComponent(agent)}`
      : KNOWLEDGE_ENDPOINT
    const res = await fetch(url, {method: 'GET', headers})
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const code = str(body.code)
      // A coded 401/403 (e.g. not-your-agent) is an ownership error, NOT a dead
      // session — only an uncoded one degrades to signedOut.
      if ((res.status === 401 || res.status === 403) && !code) {
        return {signedOut: true}
      }
      return {
        signedOut: false,
        code,
        error:
          str(body.error) ?? str(body.message) ?? `Runtime error ${res.status}`,
      }
    }
    const files = Array.isArray(body.files)
      ? body.files
          .map(normalizeFile)
          .filter((f): f is KnowledgeFile => f !== null)
      : []
    return {files, signedOut: false}
  } catch (e) {
    logger.warn('knowledge: list failed', {safeMessage: String(e)})
    return {signedOut: false, error: errorMessage(e) ?? 'network error'}
  }
}

/**
 * POST /app/knowledge/upload — upload one document into the agent's long-term
 * memory. RAW bytes + the file's Content-Type (the runtime reads arrayBuffer(); do
 * NOT use FormData). Returns the recorded slot; a runtime PII-guard BLOCK is a normal
 * result ({ok:false, file:{status:'blocked', reason}}) — not a thrown error — so the
 * caller can show the real reason. Never throws.
 */
export async function uploadKnowledgeFile(
  file: KnowledgeFileToUpload,
  agent?: string,
): Promise<KnowledgeUploadResult> {
  if (file.size > KNOWLEDGE_UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      signedOut: false,
      code: 'too-large',
      error: `That file is too large (max ${Math.floor(
        KNOWLEDGE_UPLOAD_MAX_BYTES / 1024,
      )}KB of text).`,
    }
  }
  let headers: Record<string, string> | null
  try {
    headers = await authHeaders()
  } catch (e) {
    return {ok: false, signedOut: false, error: errorMessage(e) ?? 'auth error'}
  }
  if (!headers) return {ok: false, signedOut: true}
  try {
    const params = new URLSearchParams()
    params.set('filename', file.name)
    if (agent) params.set('agent', agent)
    const res = await fetch(
      `${KNOWLEDGE_UPLOAD_ENDPOINT}?${params.toString()}`,
      {
        method: 'POST',
        // Raw bytes + the file's explicit Content-Type — the runtime gates on this
        // header (text/* -> text ingestion, application/pdf -> document extraction).
        headers: {...headers, 'Content-Type': file.mime || 'text/plain'},
        body: file.blob,
      },
    )
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const code = str(body.code)
      if ((res.status === 401 || res.status === 403) && !code) {
        return {ok: false, signedOut: true}
      }
      return {
        ok: false,
        signedOut: false,
        code,
        error:
          str(body.error) ?? str(body.message) ?? `Runtime error ${res.status}`,
      }
    }
    const slot = normalizeFile(body.file)
    return {
      ok: body.ok === true,
      signedOut: false,
      ...(slot ? {file: slot} : {}),
      ...(body.ok === true
        ? {}
        : {error: str(body.reason) ?? slot?.reason ?? undefined}),
    }
  } catch (e) {
    logger.warn('knowledge: upload failed', {safeMessage: String(e)})
    return {
      ok: false,
      signedOut: false,
      error: errorMessage(e) ?? 'network error',
    }
  }
}

/**
 * DELETE /app/knowledge/{id} — remove one slot from the agent's knowledge base.
 * Removal is guaranteed at the agent level (unlisted, no recall, no injection);
 * whether the raw data was destroyed upstream comes back in `upstream` and MUST
 * drive the success copy (see knowledgeRemovalMessage). Same auth/scoping as the
 * other knowledge routes (`?agent=` optional). Typed result, never throws.
 */
export async function deleteKnowledgeFile(
  id: string,
  agent?: string,
): Promise<KnowledgeDeleteResult> {
  if (!id) return {ok: false, code: 'not-found', error: 'Missing file id.'}
  let headers: Record<string, string> | null
  try {
    headers = await authHeaders()
  } catch (e) {
    return {ok: false, signedOut: false, error: errorMessage(e) ?? 'auth error'}
  }
  if (!headers) return {ok: false, signedOut: true}
  try {
    const base = `${KNOWLEDGE_ENDPOINT}/${encodeURIComponent(id)}`
    const url = agent ? `${base}?agent=${encodeURIComponent(agent)}` : base
    const res = await fetch(url, {method: 'DELETE', headers})
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const code = str(body.code)
      if ((res.status === 401 || res.status === 403) && !code) {
        return {ok: false, signedOut: true}
      }
      return {
        ok: false,
        signedOut: false,
        code: code ?? (res.status === 404 ? 'not-found' : undefined),
        error:
          str(body.error) ?? str(body.message) ?? `Runtime error ${res.status}`,
      }
    }
    const upstream =
      body.upstream === 'purged' ||
      body.upstream === 'retained' ||
      body.upstream === 'unsupported'
        ? body.upstream
        : undefined
    return {
      ok: body.ok === true,
      signedOut: false,
      id: str(body.id) ?? id,
      removed: body.removed === true,
      upstream,
      message: str(body.message),
      ...(body.ok === true ? {} : {error: str(body.error) ?? 'delete failed'}),
    }
  } catch (e) {
    logger.warn('knowledge: delete failed', {safeMessage: String(e)})
    return {
      ok: false,
      signedOut: false,
      error: errorMessage(e) ?? 'network error',
    }
  }
}

/**
 * PATCH /app/knowledge/{id} — switch one slot on or off for the agent. Same
 * auth/scoping as the other knowledge routes (`?agent=` optional). Idempotent:
 * re-sending the current state resolves ok with `changed:false` — treat as
 * success, not an error. A 409 with code 'deleted' means the item was deleted
 * (not merely off). Typed result, never throws.
 */
export async function setKnowledgeFileEnabled(
  id: string,
  enabled: boolean,
  agent?: string,
): Promise<KnowledgeToggleResult> {
  if (!id) return {ok: false, code: 'not-found', error: 'Missing file id.'}
  let headers: Record<string, string> | null
  try {
    headers = await authHeaders()
  } catch (e) {
    return {ok: false, signedOut: false, error: errorMessage(e) ?? 'auth error'}
  }
  if (!headers) return {ok: false, signedOut: true}
  try {
    const base = `${KNOWLEDGE_ENDPOINT}/${encodeURIComponent(id)}`
    const url = agent ? `${base}?agent=${encodeURIComponent(agent)}` : base
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {...headers, 'Content-Type': 'application/json'},
      body: JSON.stringify({enabled}),
    })
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const code = str(body.code)
      if ((res.status === 401 || res.status === 403) && !code) {
        return {ok: false, signedOut: true}
      }
      return {
        ok: false,
        signedOut: false,
        code: code ?? (res.status === 404 ? 'not-found' : undefined),
        error:
          str(body.error) ?? str(body.message) ?? `Runtime error ${res.status}`,
      }
    }
    return {
      ok: body.ok === true,
      signedOut: false,
      id: str(body.id) ?? id,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : enabled,
      changed: body.changed === true,
      name: str(body.name),
      message: str(body.message),
      ...(body.ok === true ? {} : {error: str(body.error) ?? 'toggle failed'}),
    }
  } catch (e) {
    logger.warn('knowledge: toggle failed', {safeMessage: String(e)})
    return {
      ok: false,
      signedOut: false,
      error: errorMessage(e) ?? 'network error',
    }
  }
}

/**
 * The honest success message for a removal, keyed off the runtime's `upstream`
 * outcome. Only 'purged' may claim the file was deleted; anything else (including
 * a missing/unknown value — fail honest) says removed-from-the-agent only: the
 * agent can no longer read or recall it, with no claim the data was destroyed.
 * The runtime's own `message` is appended when it adds detail beyond our line.
 */
export function knowledgeRemovalMessage(input: {
  upstream?: KnowledgeUpstreamOutcome
  fileName: string
  agentLabel: string
  runtimeMessage?: string
}): string {
  const {upstream, fileName, agentLabel, runtimeMessage} = input
  const line =
    upstream === 'purged'
      ? `Deleted “${fileName}” from ${agentLabel}’s knowledge base.`
      : `Removed “${fileName}” from ${agentLabel}’s knowledge base — ${agentLabel} can no longer read or recall it.`
  // Surface the runtime's fuller detail (e.g. why the upstream copy persists)
  // without repeating ourselves.
  if (runtimeMessage && runtimeMessage.trim() && runtimeMessage !== line) {
    return `${line} ${runtimeMessage.trim()}`
  }
  return line
}

/** The generic, always-safe fallback when we can't say anything more specific. */
const KNOWLEDGE_GENERIC_REASON =
  'That file couldn’t be saved. Try again in a moment — if it keeps happening, contact support.'

/**
 * Fragments that mean the reason string is INTERNAL: config keys, env var names,
 * HTTP/transport detail, ids. A reason matching any of these is NEVER shown to a
 * customer — the generic line goes out instead. (A customer once saw
 * "write-back disabled: config.mnemonic.write.enabled is not set true for this
 * agent" on a declined upload; that is what this exists to stop.)
 */
const INTERNAL_REASON_MARKERS = [
  /\bconfig\./i,
  /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/, // MNEMONIC_TOKEN, MNEMONIC_BASE_URL, …
  /\bhttps?:\/\//i,
  /\bHTTP\s*\d{3}\b/i,
  /\b(?:status|code)\s*[:=]?\s*\d{3}\b/i,
  /\bmnemonic\b/i,
  /\bartifact_id\b|\bproject_id\b|\bentity_id\b/i,
  /\bundefined\b|\bnull\b|\[object /i,
  /\berror:/i,
]

/**
 * Turn the runtime's INTERNAL blocked/failed reason into plain customer English.
 *
 * The runtime's reasons are written for us, not for customers: they name config
 * keys, env vars and HTTP statuses. This maps the known families to something a
 * customer can act on, and — critically — FAILS SAFE: anything that still looks
 * internal (see INTERNAL_REASON_MARKERS) becomes the generic line rather than
 * leaking machinery. Only a reason that is already plain and clean passes through.
 *
 * PURE — no i18n context (same plain-English convention as knowledgeRemovalMessage).
 */
export function knowledgeReasonMessage(reason?: string | null): string {
  const raw = String(reason ?? '').trim()
  if (!raw) return KNOWLEDGE_GENERIC_REASON
  const s = raw.toLowerCase()

  // 1. OPERATOR DEPENDENCY — memory writes are off for this agent, or the memory
  //    service isn't reachable. Nothing the customer did; nothing they can fix.
  if (
    s.includes('write-back disabled') ||
    s.includes('no mnemonic http client available') ||
    s.includes('no mnemonic media client available')
  ) {
    return 'Saving to memory is switched off for this agent right now, so this file wasn’t stored. Contact support and we’ll switch it on.'
  }

  // 2. REAL-PERSONAL-DATA GUARD — the one refusal the customer can act on. The
  //    runtime lists which categories tripped it; translate those, don't echo them.
  if (s.includes('real-personal-data guard')) {
    const kinds = [
      s.includes('email') ? 'an email address' : null,
      s.includes('phone') ? 'a phone number' : null,
      s.includes('credential') || s.includes('secret')
        ? 'a password or key'
        : null,
    ].filter(Boolean) as string[]
    const what =
      kinds.length === 0
        ? 'real personal details'
        : kinds.length === 1
          ? kinds[0]
          : `${kinds.slice(0, -1).join(', ')} and ${kinds[kinds.length - 1]}`
    return `This file wasn’t saved because it contains ${what}. Remove that and upload it again.`
  }

  // 3. TIMEOUT — long documents on a cold start. It may still land, so say so.
  if (s.includes('timed out') || s.includes('timeout')) {
    return 'That file took too long to process. Give it a minute and refresh — if it still isn’t listed, upload it again.'
  }

  // 4. EMPTY AFTER DECODING — a real, checkable customer-side condition.
  if (
    s.includes('empty after decoding') ||
    s.includes('nothing to remember') ||
    s.includes('was empty')
  ) {
    return 'That file looked empty once we read it. Check the file and try again.'
  }

  // 5. DOCUMENT-EXTRACTION LEG (PDF/Office): begin/upload/confirm failures.
  if (
    s.includes('media begin') ||
    s.includes('media upload failed') ||
    s.includes('media confirm') ||
    s.includes('ingest failed') ||
    s.includes('the ingest failed')
  ) {
    return 'We couldn’t finish processing that document. Try uploading it again — if it keeps failing, contact support.'
  }

  // 6. FORMAT — the runtime already words these for customers ("that format is not
  //    supported yet (send a .txt, .md, .csv, or .pdf)"). Sentence-case and pass on.
  if (s.includes('not supported yet') || s.includes('unsupported file type')) {
    return raw.charAt(0).toUpperCase() + raw.slice(1)
  }

  // 7. FAIL SAFE: unknown reason. Pass it through ONLY if it reads as plain prose;
  //    anything with machinery in it becomes the generic line.
  if (INTERNAL_REASON_MARKERS.some(re => re.test(raw))) {
    return KNOWLEDGE_GENERIC_REASON
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}
