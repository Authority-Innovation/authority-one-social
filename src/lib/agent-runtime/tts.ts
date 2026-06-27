import {fetch as expoFetch} from 'expo/fetch'

import {logger} from '#/logger'
import {getSupabaseAccessToken} from './authToken'
import {BOB_VOICE_ID, TTS_ENDPOINT} from './config'

/**
 * Fetch spoken audio for `text` in the branded "Bob" voice from the runtime's
 * ElevenLabs proxy (POST /app/tts) and return it as base64 (ready to hand to the
 * native audio player). Returns `null` on ANY failure — signed-out, the proxy
 * being unconfigured (503), an EL error (502), or a network drop — so the caller
 * can FALL BACK to the on-device AVSpeechSynthesizer voice. ElevenLabs is an
 * enhancement, never a hard dependency.
 *
 * The ElevenLabs API key NEVER touches the client: we send only the user's
 * Supabase session bearer; the Worker adds the EL key server-side.
 */
export async function fetchBobAudioBase64(
  text: string,
  opts: {voiceId?: string; signal?: AbortSignal} = {},
): Promise<string | null> {
  const t = text.trim()
  if (!t) return null

  let token: string | null
  try {
    token = await getSupabaseAccessToken()
  } catch {
    return null
  }
  // Signed out → no bearer → can't synthesize. Fall back to on-device voice.
  if (!token) return null

  try {
    const res = await expoFetch(TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        text: t,
        // Optional: only override the server default when a build pins a voice.
        voiceId: opts.voiceId ?? BOB_VOICE_ID,
      }),
      signal: opts.signal,
    })

    // 503 (proxy unconfigured) / 502 (EL error) / 401 etc → fall back. Not an error
    // worth surfacing to the user; on-device voice will speak instead.
    if (!res.ok) {
      logger.warn('agent-runtime tts proxy non-ok; using on-device voice', {
        status: res.status,
      })
      return null
    }

    const buf = await res.arrayBuffer()
    if (!buf || buf.byteLength === 0) return null
    return bytesToBase64(new Uint8Array(buf))
  } catch (e) {
    // Aborted (barge-in / new turn) or network error → silent fall back.
    logger.warn('agent-runtime tts fetch failed; using on-device voice', {
      safeMessage: e,
    })
    return null
  }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/**
 * Encode bytes to a base64 string. A tiny self-contained encoder (no Buffer / no
 * global btoa) so it behaves identically on Hermes (device) and Node (jest). PURE.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63]
  }
  const rem = bytes.length - i
  if (rem === 1) {
    const n = bytes[i] << 16
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '=='
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8)
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '='
  }
  return out
}
