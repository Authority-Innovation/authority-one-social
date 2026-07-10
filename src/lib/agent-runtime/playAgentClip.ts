import {Platform} from 'react-native'

import {logger} from '#/logger'
import {TTS} from '../../../modules/expo-authority-voice'

/**
 * Cross-platform "play ONE spoken-reply MP3 clip" for the public "Talk to <Agent>" chat.
 *
 * The public visitor chat must speak the agent's reply on WEB as well as native:
 *   - NATIVE: delegates to the existing on-device clip player (expo-authority-voice
 *     TTS.playClip), exactly like the owner voice UX — barge-in via TTS.stop().
 *   - WEB: the voice module's web player is a no-op, so we play the streamed MP3 with an
 *     HTMLAudioElement from a base64 data URI. Browsers gate audio playback behind a user
 *     gesture (autoplay policy), so the caller MUST invoke this from within the send-button
 *     press handler's async chain (right after the /public/tts fetch resolves). We still
 *     catch a rejected play() and log it rather than throwing — no audio is never fatal.
 *
 * Returns a `stop()` function the caller can invoke to cut playback (barge-in / a new turn /
 * unmount). Never throws.
 */
export function playAgentClipBase64(base64: string): () => void {
  const b64 = String(base64 ?? '').trim()
  if (!b64) return () => {}

  if (Platform.OS === 'web') {
    try {
      const audio = new Audio(`data:audio/mpeg;base64,${b64}`)
      // Kick playback synchronously in the gesture-initiated async chain; a policy block
      // rejects the promise (we log, show text only) instead of throwing.
      void audio.play().catch(e => {
        logger.warn('public chat: web audio autoplay blocked; text only', {safeMessage: e})
      })
      return () => {
        try {
          audio.pause()
          audio.currentTime = 0
        } catch {}
      }
    } catch (e) {
      logger.warn('public chat: web audio failed; text only', {safeMessage: e})
      return () => {}
    }
  }

  // Native: reuse the on-device clip player (same path as the owner voice reply).
  try {
    TTS.playClip(b64)
  } catch (e) {
    logger.warn('public chat: native clip play failed; text only', {safeMessage: e})
  }
  return () => {
    try {
      TTS.stop()
    } catch {}
  }
}
