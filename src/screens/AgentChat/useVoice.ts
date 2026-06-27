import {useCallback, useEffect, useRef, useState} from 'react'

import {BOB_VOICE_ID, fetchBobAudioBase64} from '#/lib/agent-runtime'
import {
  type SpeechCapabilities,
  STT,
  TTS,
} from '../../../modules/expo-authority-voice'

export interface UseVoice {
  /** On-device STT backend info; `available=false` hides the mic affordance. */
  capabilities: SpeechCapabilities
  /** True while the mic is capturing. */
  listening: boolean
  /** True while TTS is speaking (ElevenLabs clip OR on-device synth). */
  speaking: boolean
  /** Live partial transcript (volatile) — show as the user speaks. */
  partial: string
  /** Start/stop listening. Resolves the final transcript when stopping. */
  startListening: () => Promise<void>
  stopListening: () => void
  /** Speak assistant text — ElevenLabs "Bob" voice with on-device fallback. */
  speak: (text: string) => void
  /** Stop TTS immediately (barge-in) and cancel any in-flight ElevenLabs fetch. */
  stopSpeaking: () => void
}

/**
 * Couples the STT + TTS native modules and implements barge-in:
 * the moment the user's voice produces a partial transcript while TTS is talking,
 * TTS is cut off so the user can interrupt naturally.
 *
 * SPOKEN REPLIES use the branded ElevenLabs "Bob" voice: `speak()` fetches the audio
 * from the runtime proxy (key stays server-side) and plays it via the native clip
 * player. If that's unavailable (signed out, proxy unconfigured, EL error, offline),
 * it FALLS BACK to the on-device AVSpeechSynthesizer voice. Barge-in cancels both the
 * in-flight fetch and any active playback.
 *
 * `onFinalUserUtterance` is called with the committed transcript when the user
 * stops speaking — the screen uses it to send the message.
 */
export function useVoice(opts: {
  localeId?: string
  /** ElevenLabs voice id override; defaults to the configured Bob voice. */
  voiceId?: string
  /** Try ElevenLabs first (default true). Set false to force on-device voice. */
  preferElevenLabs?: boolean
  onPartialUserUtterance?: (text: string) => void
  onFinalUserUtterance?: (text: string) => void
}): UseVoice {
  const {
    localeId = 'en-US',
    voiceId = BOB_VOICE_ID,
    preferElevenLabs = true,
    onPartialUserUtterance,
    onFinalUserUtterance,
  } = opts

  const [capabilities] = useState<SpeechCapabilities>(() =>
    STT.getCapabilities(),
  )
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [partial, setPartial] = useState('')

  const speakingRef = useRef(false)
  // Committed final segments (space-joined) and the latest in-progress volatile
  // partial. The full transcript at any instant is finals + current volatile; we
  // keep them apart so a trailing volatile partial is never dropped at endpoint.
  const finalBufRef = useRef('')
  const volatileRef = useRef('')

  // ── ElevenLabs playback bookkeeping ──────────────────────────────────────
  // A monotonically increasing token: bumped whenever we stop/replace speech, so a
  // late-resolving fetch knows it's stale and must not start playing.
  const speakSeqRef = useRef(0)
  const ttsAbortRef = useRef<AbortController | null>(null)
  // The currently-playing EL clip, for the "clip failed to start → fall back to
  // on-device voice" path (keyed by the native utteranceId).
  const elClipRef = useRef<{id: string; text: string; started: boolean} | null>(
    null,
  )

  // Keep callbacks fresh without re-subscribing. Updated in an effect (not during
  // render) so the ref is never written mid-render; the STT/TTS listeners read it
  // at event time, which always runs after commit.
  const cbRef = useRef({onPartialUserUtterance, onFinalUserUtterance})
  useEffect(() => {
    cbRef.current = {onPartialUserUtterance, onFinalUserUtterance}
  }, [onPartialUserUtterance, onFinalUserUtterance])

  // Cut all speech NOW: invalidate any pending EL fetch + stop active playback.
  // Used by barge-in, by an explicit stop, and before starting a new utterance.
  const cutSpeech = useCallback(() => {
    speakSeqRef.current += 1
    ttsAbortRef.current?.abort()
    ttsAbortRef.current = null
    elClipRef.current = null
    TTS.stop()
    speakingRef.current = false
    setSpeaking(false)
  }, [])

  const stopSpeaking = useCallback(() => {
    cutSpeech()
  }, [cutSpeech])

  // The full transcript right now = committed finals + the in-progress volatile
  // segment. Apple's SpeechTranscriber reports these as disjoint ranges, so we
  // simply join them. Reads refs only, so it's stable.
  const combinedTranscript = useCallback(
    () =>
      [finalBufRef.current, volatileRef.current]
        .map(s => s.trim())
        .filter(Boolean)
        .join(' ')
        .trim(),
    [],
  )

  // STT listeners (subscribe once).
  useEffect(() => {
    const offPartial = STT.addListener('onPartialTranscript', e => {
      volatileRef.current = e.text
      const combined = combinedTranscript()
      setPartial(combined)
      // BARGE-IN: user is speaking while the agent talks → cut the agent off
      // (and cancel any in-flight EL fetch so it can't start after the interrupt).
      if (speakingRef.current && e.text.trim().length > 0) {
        cutSpeech()
      }
      cbRef.current.onPartialUserUtterance?.(combined)
    })
    const offFinal = STT.addListener('onFinalTranscript', e => {
      // Commit this segment; the full utterance is flushed on stopListening.
      finalBufRef.current = finalBufRef.current
        ? `${finalBufRef.current} ${e.text}`.trim()
        : e.text.trim()
      volatileRef.current = ''
      const combined = combinedTranscript()
      setPartial(combined)
      // A committed segment is also speech activity: forward it like a partial so
      // the endpoint timer is reset by finals too (not just volatile partials).
      // Without this, the gap right after the engine commits a segment looks like
      // silence and cuts the user off mid-sentence.
      if (speakingRef.current && e.text.trim().length > 0) {
        cutSpeech()
      }
      cbRef.current.onPartialUserUtterance?.(combined)
    })
    const offErr = STT.addListener('onError', () => {
      setListening(false)
    })
    return () => {
      offPartial()
      offFinal()
      offErr()
    }
  }, [cutSpeech, combinedTranscript])

  // TTS lifecycle listeners. These fire for BOTH the on-device synth and the EL
  // clip player (same native events). The EL refs drive the clip→on-device fallback.
  useEffect(() => {
    const offStart = TTS.addListener('onSpeechStart', e => {
      if (elClipRef.current && e.utteranceId === elClipRef.current.id) {
        elClipRef.current.started = true
      }
      speakingRef.current = true
      setSpeaking(true)
    })
    const settle = () => {
      speakingRef.current = false
      setSpeaking(false)
    }
    const offDone = TTS.addListener('onSpeechDone', e => {
      if (elClipRef.current && e.utteranceId === elClipRef.current.id) {
        elClipRef.current = null
      }
      settle()
    })
    const offCancel = TTS.addListener('onSpeechCanceled', e => {
      if (elClipRef.current && e.utteranceId === elClipRef.current.id) {
        elClipRef.current = null
      }
      settle()
    })
    const offErr = TTS.addListener('onSpeechError', e => {
      // If an EL clip ERRORED BEFORE it ever started playing, fall back to the
      // on-device voice with the same text (offline/decode failure recovery).
      const clip = elClipRef.current
      if (clip && e.utteranceId === clip.id && !clip.started) {
        elClipRef.current = null
        TTS.speak(clip.text, {localeId, voiceId})
        return
      }
      settle()
    })
    return () => {
      offStart()
      offDone()
      offCancel()
      offErr()
    }
  }, [localeId, voiceId])

  const startListening = useCallback(async () => {
    if (listening || !capabilities.available) return
    // Barge-in on tap as well: stop any agent speech before we start listening.
    cutSpeech()
    const ok = await STT.requestPermissions()
    if (!ok) return
    finalBufRef.current = ''
    volatileRef.current = ''
    setPartial('')
    STT.start(localeId)
    setListening(true)
  }, [listening, capabilities.available, localeId, cutSpeech])

  const stopListening = useCallback(() => {
    if (!listening) return
    STT.stop()
    setListening(false)
    // Flush the FULL accumulated utterance (finals + any trailing volatile
    // partial) so nothing the user said is dropped at the endpoint.
    const finalText = combinedTranscript()
    if (finalText) cbRef.current.onFinalUserUtterance?.(finalText)
    finalBufRef.current = ''
    volatileRef.current = ''
  }, [listening, combinedTranscript])

  const speak = useCallback(
    (text: string) => {
      const t = text.trim()
      if (!t) return

      // Supersede any previous utterance / in-flight fetch.
      ttsAbortRef.current?.abort()
      const seq = (speakSeqRef.current += 1)
      elClipRef.current = null

      // Forced on-device voice → speak directly.
      if (!preferElevenLabs) {
        TTS.speak(t, {localeId, voiceId})
        return
      }

      const controller = new AbortController()
      ttsAbortRef.current = controller
      void (async () => {
        const b64 = await fetchBobAudioBase64(t, {voiceId, signal: controller.signal})
        // Stale? (user barged in, a newer utterance started, or we stopped.)
        if (seq !== speakSeqRef.current) return
        ttsAbortRef.current = null
        if (b64) {
          const id = TTS.playClip(b64, {localeId, voiceId})
          elClipRef.current = {id, text: t, started: false}
        } else {
          // ElevenLabs unavailable/offline → on-device fallback.
          TTS.speak(t, {localeId, voiceId})
        }
      })()
    },
    [localeId, preferElevenLabs, voiceId],
  )

  // Stop everything on unmount.
  useEffect(() => {
    return () => {
      ttsAbortRef.current?.abort()
      STT.stop()
      TTS.stop()
    }
  }, [])

  return {
    capabilities,
    listening,
    speaking,
    partial,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  }
}
