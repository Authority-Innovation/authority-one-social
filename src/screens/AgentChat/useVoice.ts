import {useCallback, useEffect, useRef, useState} from 'react'

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
  /** True while TTS is speaking. */
  speaking: boolean
  /** Live partial transcript (volatile) — show as the user speaks. */
  partial: string
  /** Start/stop listening. Resolves the final transcript when stopping. */
  startListening: () => Promise<void>
  stopListening: () => void
  /** Speak assistant text via TTS. */
  speak: (text: string) => void
  /** Stop TTS immediately (barge-in). */
  stopSpeaking: () => void
}

/**
 * Couples the STT + TTS native modules and implements barge-in:
 * the moment the user's voice produces a partial transcript while TTS is talking,
 * TTS is cut off so the user can interrupt naturally.
 *
 * `onFinalUserUtterance` is called with the committed transcript when the user
 * stops speaking — the screen uses it to send the message.
 */
export function useVoice(opts: {
  localeId?: string
  onPartialUserUtterance?: (text: string) => void
  onFinalUserUtterance?: (text: string) => void
}): UseVoice {
  const {
    localeId = 'en-US',
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
  const finalBufRef = useRef('')

  // Keep callbacks fresh without re-subscribing. Updated in an effect (not during
  // render) so the ref is never written mid-render; the STT/TTS listeners read it
  // at event time, which always runs after commit.
  const cbRef = useRef({onPartialUserUtterance, onFinalUserUtterance})
  useEffect(() => {
    cbRef.current = {onPartialUserUtterance, onFinalUserUtterance}
  }, [onPartialUserUtterance, onFinalUserUtterance])

  const stopSpeaking = useCallback(() => {
    TTS.stop()
    speakingRef.current = false
    setSpeaking(false)
  }, [])

  // STT listeners (subscribe once).
  useEffect(() => {
    const offPartial = STT.addListener('onPartialTranscript', e => {
      setPartial(e.text)
      // BARGE-IN: user is speaking while the agent talks → cut the agent off.
      if (speakingRef.current && e.text.trim().length > 0) {
        TTS.stop()
        speakingRef.current = false
        setSpeaking(false)
      }
      cbRef.current.onPartialUserUtterance?.(e.text)
    })
    const offFinal = STT.addListener('onFinalTranscript', e => {
      // Accumulate finals; the full utterance is flushed on stopListening.
      finalBufRef.current = finalBufRef.current
        ? `${finalBufRef.current} ${e.text}`.trim()
        : e.text
      setPartial(finalBufRef.current)
    })
    const offErr = STT.addListener('onError', () => {
      setListening(false)
    })
    return () => {
      offPartial()
      offFinal()
      offErr()
    }
  }, [])

  // TTS lifecycle listeners.
  useEffect(() => {
    const offStart = TTS.addListener('onSpeechStart', () => {
      speakingRef.current = true
      setSpeaking(true)
    })
    const settle = () => {
      speakingRef.current = false
      setSpeaking(false)
    }
    const offDone = TTS.addListener('onSpeechDone', settle)
    const offCancel = TTS.addListener('onSpeechCanceled', settle)
    const offErr = TTS.addListener('onSpeechError', settle)
    return () => {
      offStart()
      offDone()
      offCancel()
      offErr()
    }
  }, [])

  const startListening = useCallback(async () => {
    if (listening || !capabilities.available) return
    // Barge-in on tap as well: stop any agent speech before we start listening.
    stopSpeaking()
    const ok = await STT.requestPermissions()
    if (!ok) return
    finalBufRef.current = ''
    setPartial('')
    STT.start(localeId)
    setListening(true)
  }, [listening, capabilities.available, localeId, stopSpeaking])

  const stopListening = useCallback(() => {
    if (!listening) return
    STT.stop()
    setListening(false)
    const finalText = (finalBufRef.current || partial).trim()
    if (finalText) cbRef.current.onFinalUserUtterance?.(finalText)
    finalBufRef.current = ''
  }, [listening, partial])

  const speak = useCallback(
    (text: string) => {
      const t = text.trim()
      if (!t) return
      TTS.speak(t, {localeId: opts.localeId})
    },
    [opts.localeId],
  )

  // Stop everything on unmount.
  useEffect(() => {
    return () => {
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
