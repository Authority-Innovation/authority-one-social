/**
 * READ-ONLY SMS/MMS GROUP MIRROR client — GET /app/groups[/:sid/thread|export|share]
 * on the agent runtime.
 *
 * These are a READ surface over the live Twilio Conversations groups an owner's agent
 * hosts. The SMS group keeps running untouched; there is NO post path here. The
 * runtime enforces the platform's hard privacy promise server-side — every author is
 * a DISPLAY NAME, never a raw phone number — so this client only ever sees, renders,
 * and forwards phone-free data.
 *
 * Mirrors usageClient.ts / agentsClient.ts: owner-scoped (the runtime resolves the
 * account from the session; we never send an owner id), typed results, NEVER throws —
 * every call degrades to an empty/error envelope so the UI stays alive offline.
 */
import {logger} from '#/logger'
import {getSupabaseAccessToken} from './authToken'
import {
  groupExportUrl,
  groupShareUrl,
  groupThreadUrl,
  OWNER_GROUPS_ENDPOINT,
} from './config'

export type MirrorGroup = {
  conversationSid: string
  title: string | null
  memberCount: number
  openJoin?: boolean
  keyword?: string | null
}

export type MirrorMedia = {
  content_type: string | null
  filename: string | null
  url: string | null
  size: number | null
}

export type MirrorMessage = {
  id: string | null
  author_display_name: string
  is_agent: boolean
  body: string
  media: MirrorMedia[]
  timestamp: string | null
}

export type MirrorGroupMeta = {
  conversationSid: string
  title: string | null
  agent: string | null
  agentName: string | null
  memberCount: number
  lastActivity: string | null
  state: string | null
}

export type MirrorThread = {
  group: MirrorGroupMeta | null
  messages: MirrorMessage[]
  signedOut?: boolean
  error?: string
}

export type ShareStatus = {
  shared: boolean
  token: string | null
  url: string | null
  createdAt: number | null
  signedOut?: boolean
  error?: string
}

async function authHeaders(): Promise<Record<string, string> | null> {
  const token = await getSupabaseAccessToken()
  if (!token) return null
  return {Authorization: `Bearer ${token}`}
}

function errMsg(e: unknown): string | undefined {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return undefined
}

/** List the groups the given agent hosts (or the owner's default agent). Read-only. */
export async function fetchOwnerGroups(agent?: string): Promise<MirrorGroup[]> {
  try {
    const headers = await authHeaders()
    if (!headers) return []
    const url = agent
      ? `${OWNER_GROUPS_ENDPOINT}?agent=${encodeURIComponent(agent)}`
      : OWNER_GROUPS_ENDPOINT
    const res = await fetch(url, {method: 'GET', headers})
    if (!res.ok) return []
    const data = (await res.json()) as {groups?: MirrorGroup[]}
    return Array.isArray(data?.groups) ? data.groups : []
  } catch (e) {
    logger.warn('groupMirror: list failed', {safeMessage: String(e)})
    return []
  }
}

/** Fetch a group's normalized (phone-free) message history. Never throws. */
export async function fetchGroupThread(sid: string): Promise<MirrorThread> {
  const empty: MirrorThread = {group: null, messages: []}
  try {
    const headers = await authHeaders()
    if (!headers) return {...empty, signedOut: true}
    const res = await fetch(groupThreadUrl(sid), {method: 'GET', headers})
    if (res.status === 401 || res.status === 403) return {...empty, signedOut: true}
    if (!res.ok) return {...empty, error: `thread unavailable (${res.status})`}
    const data = (await res.json()) as {group?: MirrorGroupMeta; messages?: MirrorMessage[]}
    return {group: data?.group ?? null, messages: Array.isArray(data?.messages) ? data.messages : []}
  } catch (e) {
    return {...empty, error: errMsg(e)}
  }
}

/** Current read-only share-link status for a group. Never throws. */
export async function fetchShareStatus(sid: string): Promise<ShareStatus> {
  const empty: ShareStatus = {shared: false, token: null, url: null, createdAt: null}
  try {
    const headers = await authHeaders()
    if (!headers) return {...empty, signedOut: true}
    const res = await fetch(groupShareUrl(sid), {method: 'GET', headers})
    if (!res.ok) return empty
    const data = (await res.json()) as ShareStatus
    return {shared: !!data?.shared, token: data?.token ?? null, url: data?.url ?? null, createdAt: data?.createdAt ?? null}
  } catch {
    return empty
  }
}

/** Mint/rotate ('create') or revoke ('revoke') the read-only share link. */
export async function setShare(sid: string, action: 'create' | 'revoke'): Promise<ShareStatus> {
  const empty: ShareStatus = {shared: false, token: null, url: null, createdAt: null}
  try {
    const headers = await authHeaders()
    if (!headers) return {...empty, signedOut: true}
    const res = await fetch(groupShareUrl(sid), {
      method: 'POST',
      headers: {...headers, 'Content-Type': 'application/json'},
      body: JSON.stringify({action}),
    })
    if (!res.ok) return {...empty, error: `share ${action} failed (${res.status})`}
    const data = (await res.json()) as ShareStatus
    return {shared: !!data?.shared, token: data?.token ?? null, url: data?.url ?? null, createdAt: data?.createdAt ?? null}
  } catch (e) {
    return {...empty, error: errMsg(e)}
  }
}

/**
 * Download a transcript export. The export endpoint is owner-authed, so a plain
 * anchor won't carry the bearer — we fetch with auth, then trigger a browser
 * download from the blob. Returns {ok} (web only; on native the caller should share
 * the URL instead). Never throws.
 */
export async function downloadGroupExport(
  sid: string,
  format: 'html' | 'text' | 'json',
): Promise<{ok: boolean; error?: string}> {
  try {
    const headers = await authHeaders()
    if (!headers) return {ok: false, error: 'signed out'}
    const res = await fetch(groupExportUrl(sid, format), {method: 'GET', headers})
    if (!res.ok) return {ok: false, error: `export failed (${res.status})`}
    const blob = await res.blob()
    // Web-only download trigger. `document` is undefined on native RN.
    const doc = (globalThis as {document?: Document}).document
    if (typeof doc === 'undefined' || !doc?.createElement) {
      return {ok: false, error: 'export download is available on web'}
    }
    const url = URL.createObjectURL(blob)
    const ext = format === 'text' ? 'txt' : format
    const a = doc.createElement('a')
    a.href = url
    a.download = `one-conversation-${sid}.${ext}`
    doc.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    return {ok: true}
  } catch (e) {
    return {ok: false, error: errMsg(e)}
  }
}
