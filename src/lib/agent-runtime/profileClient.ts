import {logger} from '#/logger'
import {getSupabaseAccessToken} from './authToken'
import {AGENTS_PROFILE_ENDPOINT, MEDIA_GENERATE_ENDPOINT} from './config'

/**
 * Agent PDS-profile editor client (owner-scoped /app auth, same contract as the
 * other agent-runtime clients: typed results, never throws).
 *
 * Flow: the owner uploads (/app/media/upload via uploadChatImage) or generates
 * (/app/media/generate) an image to get a HOSTED https url, previews it, and only
 * on save does POST /app/agents/profile commit anything to the agent's PDS
 * profile. Merge semantics per field: string=set, null/""=clear, absent=keep.
 */

/** Grapheme limits enforced by the runtime (mirrored client-side for early UX). */
export const AGENT_DISPLAY_NAME_MAX_GRAPHEMES = 64
export const AGENT_BIO_MAX_GRAPHEMES = 256

export interface AgentProfileInput {
  /** The agent's handle or DID (both are on every GET /app/agents row). */
  agent: string
  /** string=set, null=clear, absent=keep. */
  displayName?: string | null
  /** string=set, null=clear, absent=keep. Runtime alias: "bio". */
  description?: string | null
  /** HOSTED https url (upload/generate first); null clears, absent keeps. */
  avatarUrl?: string | null
  bannerUrl?: string | null
}

export interface AgentProfileWriteResult {
  ok: boolean
  signedOut: boolean
  /** Machine-readable error code from the runtime (e.g. 'display-name-too-long'). */
  code?: string
  /** Which image field a bad-image error refers to, when the runtime says. */
  field?: string
  error?: string
  profile?: {
    displayName?: string
    description?: string
    hasAvatar?: boolean
    hasBanner?: boolean
  }
}

export interface GenerateImageResult {
  ok: boolean
  signedOut: boolean
  url?: string
  code?: string
  error?: string
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
  return {Authorization: `Bearer ${token}`}
}

/**
 * POST /app/agents/profile — commit profile changes to the agent's PDS profile.
 * At least one editable field must be present (the runtime 400s 'empty-edit'
 * otherwise; the UI should not call without changes). Never throws.
 */
export async function updateAgentProfile(
  input: AgentProfileInput,
): Promise<AgentProfileWriteResult> {
  const headers = await authHeaders().catch(() => null)
  if (!headers) return {ok: false, signedOut: true}
  try {
    const body: Record<string, unknown> = {agent: input.agent}
    if (input.displayName !== undefined) body.displayName = input.displayName
    if (input.description !== undefined) body.description = input.description
    if (input.avatarUrl !== undefined) body.avatarUrl = input.avatarUrl
    if (input.bannerUrl !== undefined) body.bannerUrl = input.bannerUrl
    const res = await fetch(AGENTS_PROFILE_ENDPOINT, {
      method: 'POST',
      headers: {...headers, 'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const code = str(json.code) ?? str(json.error)
      // A coded 401/403 (not-your-agent) is an ownership error, not a dead session.
      if ((res.status === 401 || res.status === 403) && !code) {
        return {ok: false, signedOut: true}
      }
      return {
        ok: false,
        signedOut: false,
        code,
        field: str(json.field),
        error:
          str(json.message) ?? str(json.error) ?? `Runtime error ${res.status}`,
      }
    }
    const profileRaw =
      json.profile && typeof json.profile === 'object'
        ? (json.profile as Record<string, unknown>)
        : undefined
    return {
      ok: true,
      signedOut: false,
      profile: profileRaw
        ? {
            displayName: str(profileRaw.displayName),
            description: str(profileRaw.description),
            hasAvatar: profileRaw.hasAvatar === true,
            hasBanner: profileRaw.hasBanner === true,
          }
        : undefined,
    }
  } catch (e) {
    logger.warn('agent profile: update failed', {safeMessage: String(e)})
    return {
      ok: false,
      signedOut: false,
      error: errorMessage(e) ?? 'network error',
    }
  }
}

/**
 * POST /app/media/generate — server-side AI image generation. The runtime
 * generates AND hosts the image; the returned url can be previewed freely and
 * only commits when the owner accepts it (via updateAgentProfile). Never throws.
 */
export async function generateHostedImage(input: {
  prompt: string
  references?: string[]
}): Promise<GenerateImageResult> {
  const headers = await authHeaders().catch(() => null)
  if (!headers) return {ok: false, signedOut: true}
  try {
    const res = await fetch(MEDIA_GENERATE_ENDPOINT, {
      method: 'POST',
      headers: {...headers, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        prompt: input.prompt,
        ...(input.references?.length ? {references: input.references} : {}),
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
          res.status === 503
            ? 'Image generation is not available on this deployment.'
            : (str(json.message) ??
              str(json.error) ??
              `Runtime error ${res.status}`),
      }
    }
    const url = str(json.url)
    if (!url) {
      return {ok: false, signedOut: false, error: 'No image url returned.'}
    }
    return {ok: true, signedOut: false, url}
  } catch (e) {
    logger.warn('agent profile: generate failed', {safeMessage: String(e)})
    return {
      ok: false,
      signedOut: false,
      error: errorMessage(e) ?? 'network error',
    }
  }
}
