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
 * Everything a user uploads lands as PROVISIONAL memory pending review (per the
 * Mnemonic contract), so a saved file's status is 'saved' + provisional. The runtime
 * refuses documents honestly, never faking success:
 *   - a text file with a real email/phone/secret is BLOCKED by the runtime PII guard
 *     -> HTTP 200 {ok:false, status:'blocked', file:{reason:<real reason>}}
 *   - pdf/docx/image -> 415 (not a text format yet); >512KB -> 413; empty -> 400.
 * The upload transport reads RAW bytes (no multipart) with a text Content-Type, the
 * same shape uploadChatImage uses. Typed results, never throws.
 */

/** One uploaded file "slot" as the runtime reports it. */
export interface KnowledgeFile {
  id: string
  name: string
  size: number
  contentType: string | null
  /** ISO timestamp the runtime stamped when the file was ingested. */
  uploadedAt: string
  /** 'saved' (written, provisional pending review) | 'blocked' (PII/format) | 'failed'. */
  status: 'saved' | 'blocked' | 'failed'
  /** True when the file was written and is pending review (the normal saved state). */
  provisional: boolean
  /** True when the runtime truncated an oversize file (not used by the app path today). */
  truncated: boolean
  /** Honest reason for a blocked/failed file (e.g. the PII-guard message); null when saved. */
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
  const status = r.status === 'blocked' || r.status === 'failed' ? r.status : 'saved'
  return {
    id: str(r.id) ?? '',
    name: str(r.name) ?? 'document',
    size: typeof r.size === 'number' && Number.isFinite(r.size) ? r.size : 0,
    contentType: str(r.contentType) ?? null,
    uploadedAt: str(r.uploadedAt) ?? '',
    status,
    provisional: r.provisional === true,
    truncated: r.truncated === true,
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
        error: str(body.error) ?? str(body.message) ?? `Runtime error ${res.status}`,
      }
    }
    const files = Array.isArray(body.files)
      ? body.files.map(normalizeFile).filter((f): f is KnowledgeFile => f !== null)
      : []
    return {files, signedOut: false}
  } catch (e) {
    logger.warn('knowledge: list failed', {safeMessage: String(e)})
    return {signedOut: false, error: errorMessage(e) ?? 'network error'}
  }
}

/**
 * POST /app/knowledge/upload — upload one text document into the agent's long-term
 * memory. RAW bytes + a text Content-Type (the runtime reads arrayBuffer(); do NOT
 * use FormData). Returns the recorded slot; a runtime PII-guard BLOCK is a normal
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
    const res = await fetch(`${KNOWLEDGE_UPLOAD_ENDPOINT}?${params.toString()}`, {
      method: 'POST',
      // Raw bytes + explicit text Content-Type — the runtime gates on this header.
      headers: {...headers, 'Content-Type': file.mime || 'text/plain'},
      body: file.blob,
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
        code,
        error: str(body.error) ?? str(body.message) ?? `Runtime error ${res.status}`,
      }
    }
    const slot = normalizeFile(body.file)
    return {
      ok: body.ok === true,
      signedOut: false,
      ...(slot ? {file: slot} : {}),
      ...(body.ok === true ? {} : {error: str(body.reason) ?? slot?.reason ?? undefined}),
    }
  } catch (e) {
    logger.warn('knowledge: upload failed', {safeMessage: String(e)})
    return {ok: false, signedOut: false, error: errorMessage(e) ?? 'network error'}
  }
}
