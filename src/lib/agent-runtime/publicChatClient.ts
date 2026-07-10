import {fetch as expoFetch} from 'expo/fetch'

import {logger} from '#/logger'
import {getSupabaseAccessToken} from './authToken'
import {bytesToBase64} from './tts'
import {PUBLIC_CHAT_ENDPOINT, PUBLIC_TTS_ENDPOINT} from './config'

/**
 * PUBLIC "TALK TO <AGENT>" client (metered visitor chat, refreshing budget — §3.6 / E7).
 *
 * This is the UNAUTHENTICATED counterpart of the owner chat client: a non-owner / anonymous
 * visitor talks to a specific agent's persona to evaluate it. Unlike the owner /app/* routes
 * it does NOT require a bearer — the runtime runs a structurally fenced, read-only persona
 * turn. A viewer bearer, when the user is signed in, is sent BEST-EFFORT purely so the
 * runtime keys the refreshing budget per-DID (a signed-in non-owner) instead of per-session.
 *
 * The reply comes back as TEXT plus a `hasVoice` hint; the spoken audio is fetched separately
 * from POST /public/tts (the runtime resolves the agent's assigned voice server-side). Audio
 * is always an enhancement — a text reply renders with or without it.
 */

/** The budget-exhausted conversion card the runtime returns in place of an error. */
export interface PublicChatConversionCard {
  kind: string
  title: string
  body: string
  resetsAt: string | null
  actions: Array<{type: 'follow' | 'subscribe'; handle?: string | null; url?: string | null; label: string}>
}

export interface PublicChatRemaining {
  unit: 'tokens' | 'messages'
  amount: number
  resetsAt: string
}

export type PublicChatResult =
  | {
      ok: true
      message: string
      sessionId: string
      agent: string
      remaining: PublicChatRemaining | null
      /** True once this turn used the last of the window's allowance. */
      exhausted: boolean
      /** Whether spoken audio is available for this reply (⇒ call fetchPublicAgentAudioBase64). */
      hasVoice: boolean
    }
  | {
      /** Budget/rate/ceiling reached — render the Follow/subscribe conversion card, NOT an error. */
      ok: false
      kind: 'exhausted'
      code: 'budget-exhausted' | 'global-ceiling' | 'rate-limited'
      sessionId: string | null
      agent: string
      resetsAt: string | null
      cta: PublicChatConversionCard | null
    }
  | {
      /** A hard failure (disabled surface, unknown agent, network) — the caller shows a soft note. */
      ok: false
      kind: 'error'
      code: 'public-chat-disabled' | 'unknown-agent' | 'bad-request' | 'network'
      sessionId: string | null
      agent: string
    }

/** Best-effort viewer bearer (only to key the budget per-DID). Never required. PURE-ish. */
async function optionalBearer(): Promise<string | null> {
  try {
    return await getSupabaseAccessToken()
  } catch {
    return null
  }
}

/**
 * Send ONE public visitor-chat turn to POST /public/chat. Never throws — a network/parse
 * failure resolves to a soft `{ok:false, kind:'error', code:'network'}` the UI renders as a
 * gentle "try again". The runtime enforces every bound; the client only shapes the response.
 */
export async function publicChat(input: {
  agent: string
  message: string
  sessionId?: string | null
  signal?: AbortSignal
}): Promise<PublicChatResult> {
  const agent = String(input.agent ?? '').trim()
  const message = String(input.message ?? '').trim()
  const token = await optionalBearer()
  try {
    const res = await expoFetch(PUBLIC_CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? {Authorization: `Bearer ${token}`} : {}),
      },
      body: JSON.stringify({agent, message, ...(input.sessionId ? {sessionId: input.sessionId} : {})}),
      signal: input.signal,
    })
    const data: any = await res.json().catch(() => ({}))

    if (res.status === 429 || data?.exhausted || data?.code === 'budget-exhausted' || data?.code === 'global-ceiling') {
      const code = data?.code === 'rate-limited' ? 'rate-limited' : data?.code === 'global-ceiling' ? 'global-ceiling' : 'budget-exhausted'
      return {ok: false, kind: 'exhausted', code, sessionId: data?.sessionId ?? input.sessionId ?? null, agent, resetsAt: data?.resetsAt ?? null, cta: (data?.cta as PublicChatConversionCard) ?? null}
    }
    if (!res.ok || typeof data?.message !== 'string') {
      // Check the runtime's explicit code BEFORE falling back to the HTTP status, so an
      // unknown-agent 404 isn't misread as the surface being disabled.
      const code =
        data?.code === 'unknown-agent'
          ? 'unknown-agent'
          : data?.code === 'public-chat-disabled'
            ? 'public-chat-disabled'
            : data?.code === 'agent-required' || data?.code === 'message-required'
              ? 'bad-request'
              : res.status === 404
                ? 'public-chat-disabled'
                : 'network'
      return {ok: false, kind: 'error', code, sessionId: data?.sessionId ?? input.sessionId ?? null, agent}
    }
    return {
      ok: true,
      message: data.message,
      sessionId: data.sessionId ?? input.sessionId ?? '',
      agent: data.agent ?? agent,
      remaining: (data.remaining as PublicChatRemaining) ?? null,
      exhausted: Boolean(data.exhausted),
      hasVoice: Boolean(data.hasVoice),
    }
  } catch (e) {
    logger.warn('agent-runtime publicChat failed', {safeMessage: e})
    return {ok: false, kind: 'error', code: 'network', sessionId: input.sessionId ?? null, agent}
  }
}

/**
 * Fetch spoken audio for `text` in the agent's ASSIGNED voice from POST /public/tts and
 * return it as base64 (ready for the cross-platform clip player). Returns `null` on ANY
 * failure — the surface being unconfigured (503 no EL key), an EL error (502), a rate/budget
 * cap (429), or a network drop — so the caller simply shows the text with no audio. The
 * ElevenLabs key never touches the client; the voice is resolved server-side from the agent's
 * persona. Mirrors the owner tts.ts fail-open contract.
 */
export async function fetchPublicAgentAudioBase64(input: {
  agent: string
  text: string
  sessionId?: string | null
  signal?: AbortSignal
}): Promise<string | null> {
  const agent = String(input.agent ?? '').trim()
  const text = String(input.text ?? '').trim()
  if (!agent || !text) return null
  const token = await optionalBearer()
  try {
    const res = await expoFetch(PUBLIC_TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
        ...(token ? {Authorization: `Bearer ${token}`} : {}),
      },
      body: JSON.stringify({agent, text, ...(input.sessionId ? {sessionId: input.sessionId} : {})}),
      signal: input.signal,
    })
    if (!res.ok) {
      // 503 unconfigured / 502 EL error / 429 capped → no audio, text only. Not user-facing.
      logger.warn('agent-runtime public tts non-ok; text only', {status: res.status})
      return null
    }
    const buf = await res.arrayBuffer()
    if (!buf || buf.byteLength === 0) return null
    return bytesToBase64(new Uint8Array(buf))
  } catch (e) {
    logger.warn('agent-runtime public tts fetch failed; text only', {safeMessage: e})
    return null
  }
}
