import {type AppBskyRichtextFacet} from '@atproto/api'

import {logger} from '#/logger'
import {getSupabaseAccessToken} from './authToken'
import {
  AGENTS_POSTS_DELETE_ENDPOINT,
  AGENTS_POSTS_EDIT_ENDPOINT,
  AGENTS_POSTS_ENDPOINT,
} from './config'

/**
 * Owner-initiated agent post management: the DIRECT-MANIPULATION plane. Both calls
 * hit ownership-scoped runtime endpoints (owner bearer + server-side owner->agent
 * check) which log in as the agent and write to its PDS. The agent's LLM is never
 * involved — a delete is a delete, a post is posted verbatim. Same typed-result,
 * never-throw contract as the other /app clients so the UI can message failures.
 */

/**
 * Machine-readable failure code from the runtime contract. Known values:
 * 'not-your-agent' (403 ownership), 'bad-uri' | 'repo-mismatch' (delete
 * validation), 'too-long' | 'bad-image' | 'image-too-large' (post validation).
 * Open string type — the runtime may add codes without breaking the client.
 */
export type AgentPostErrorCode = string

export interface AgentPostDeleteResult {
  ok: boolean
  signedOut: boolean
  code?: AgentPostErrorCode
  error?: string
  /** Echoed on success: the deleted post uri and the agent it belonged to. */
  uri?: string
  agent?: string
}

export interface PostAsAgentResult {
  ok: boolean
  signedOut: boolean
  code?: AgentPostErrorCode
  error?: string
  /** The created record's identity, echoed on success. */
  uri?: string
  cid?: string
  agent?: string
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function errorMessage(e: unknown): string | undefined {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return undefined
}

async function authHeaders(): Promise<Record<string, string> | null> {
  const token = await getSupabaseAccessToken()
  if (!token) return null
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

/** Shared non-OK mapping: a 401/403 WITHOUT a code is a dead session; WITH a code
 *  (e.g. 'not-your-agent') it's an ownership/validation error to surface. */
function mapFailure(
  status: number,
  body: Record<string, unknown>,
): {signedOut: boolean; code?: string; error?: string} {
  const code = str(body.code)
  if ((status === 401 || status === 403) && !code) {
    return {signedOut: true}
  }
  return {
    signedOut: false,
    code,
    error: str(body.error) ?? str(body.message) ?? `Runtime error ${status}`,
  }
}

/**
 * POST /app/agents/posts/delete {agent, uri} — delete one of the owner's agent's
 * posts from its PDS. `agent` is the handle (or DID) from a GET /app/agents row;
 * `uri` is the full at:// post uri. Idempotent server-side. Never throws.
 */
export async function deleteAgentPost(input: {
  agent: string
  uri: string
}): Promise<AgentPostDeleteResult> {
  const headers = await authHeaders().catch(() => null)
  if (!headers) return {ok: false, signedOut: true}
  try {
    const res = await fetch(AGENTS_POSTS_DELETE_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({agent: input.agent, uri: input.uri}),
    })
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      return {ok: false, ...mapFailure(res.status, body)}
    }
    return {
      ok: true,
      signedOut: false,
      uri: str(body.uri) ?? input.uri,
      agent: str(body.agent) ?? input.agent,
    }
  } catch (e) {
    logger.warn('agent-posts: delete failed', {safeMessage: String(e)})
    return {
      ok: false,
      signedOut: false,
      error: errorMessage(e) ?? 'network error',
    }
  }
}

/**
 * POST /app/agents/posts/edit — replace the text/facets of an existing post
 * authored by one of the owner's agents (atproto update op: same rkey/uri, new
 * cid). Embeds are preserved server-side. NOTE the atproto caveat the UI must
 * surface: likes/reposts/replies reference the pre-edit CID, so editing a post
 * with engagement can orphan those interactions — prefer delete+repost there.
 * Never throws.
 */
export async function editAgentPost(input: {
  agent: string
  uri: string
  text: string
  facets?: AppBskyRichtextFacet.Main[]
}): Promise<PostAsAgentResult> {
  const headers = await authHeaders().catch(() => null)
  if (!headers) return {ok: false, signedOut: true}
  try {
    const res = await fetch(AGENTS_POSTS_EDIT_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        agent: input.agent,
        uri: input.uri,
        text: input.text,
        facets: input.facets?.length ? input.facets : undefined,
      }),
    })
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      return {ok: false, ...mapFailure(res.status, body)}
    }
    return {
      ok: true,
      signedOut: false,
      uri: str(body.uri) ?? input.uri,
      cid: str(body.cid),
      agent: str(body.agent) ?? input.agent,
    }
  } catch (e) {
    logger.warn('agent-posts: edit failed', {safeMessage: String(e)})
    return {
      ok: false,
      signedOut: false,
      error: errorMessage(e) ?? 'network error',
    }
  }
}

/**
 * POST /app/agents/posts — publish a post AS one of the owner's agents, verbatim
 * (no LLM round-trip; the owner is the author speaking through the agent's
 * identity). Images are hosted https urls from /app/media/upload — the runtime
 * fetches and re-uploads them as PDS blobs. Never throws.
 */
export async function postAsAgent(input: {
  agent: string
  text: string
  facets?: AppBskyRichtextFacet.Main[]
  /** Up to 4 hosted https urls (from /app/media/upload). */
  imageUrls?: string[]
  replyTo?: {uri: string; cid: string}
  langs?: string[]
}): Promise<PostAsAgentResult> {
  const headers = await authHeaders().catch(() => null)
  if (!headers) return {ok: false, signedOut: true}
  try {
    const res = await fetch(AGENTS_POSTS_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        agent: input.agent,
        text: input.text,
        facets: input.facets?.length ? input.facets : undefined,
        imageUrls: input.imageUrls?.length ? input.imageUrls : undefined,
        replyTo: input.replyTo ?? undefined,
        langs: input.langs?.length ? input.langs : undefined,
      }),
    })
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      return {ok: false, ...mapFailure(res.status, body)}
    }
    return {
      ok: true,
      signedOut: false,
      uri: str(body.uri),
      cid: str(body.cid),
      agent: str(body.agent) ?? input.agent,
    }
  } catch (e) {
    logger.warn('agent-posts: post-as failed', {safeMessage: String(e)})
    return {
      ok: false,
      signedOut: false,
      error: errorMessage(e) ?? 'network error',
    }
  }
}
