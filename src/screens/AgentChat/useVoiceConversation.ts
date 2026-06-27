import {useCallback, useEffect, useRef, useState} from 'react'

import {
  createSilenceEndpointer,
  MIN_SPEECH_CHARS,
  type SilenceEndpointer,
} from './speechEndpointer'
import {type UseVoice, useVoice} from './useVoice'
import {
  INITIAL_VOICE_CONV_STATE,
  type VoiceConvCommand,
  type VoiceConvEvent,
  type VoiceConvState,
  voiceConvReducer,
} from './voiceConversationMachine'

/** Ignore mic activity for this long after Bob starts speaking (echo/onset guard). */
const BARGE_IN_GRACE_MS = 600
/** Minimum transcript length that counts as a real barge-in / utterance. */
const MIN_ACTIVITY_CHARS = MIN_SPEECH_CHARS

export interface UseVoiceConversation {
  /** The shared voice engine (partial transcript, capabilities, manual speak). */
  voice: UseVoice
  /** Current conversation state for UI (off/listening/thinking/speaking). */
  convState: VoiceConvState
  /** Is continuous voice-chat mode on? */
  isOn: boolean
  /** Toggle continuous mode on/off (the single ON/OFF control). */
  toggle: () => void
}

/**
 * Drives the continuous, hands-free voice-chat loop on top of the pure
 * `voiceConvReducer` state machine and the `useVoice` STT/TTS engine.
 *
 * Wiring:
 *  - on-device STT partials → endpoint timer (silence ⇒ end of utterance) and
 *    barge-in (speech while Bob talks ⇒ cut playback);
 *  - end of utterance ⇒ `send(text)` (one agent turn);
 *  - the turn finishing (`isStreaming` falling) ⇒ speak the reply (ElevenLabs Bob);
 *  - playback finishing ⇒ back to listening — looping until toggled off.
 *
 * @param send         send a user turn to the agent (from useAgentChat).
 * @param isStreaming  true while an agent turn is in flight.
 * @param getReplyText returns the latest assistant reply text (read at turn end).
 */
export function useVoiceConversation(args: {
  send: (text: string) => void
  isStreaming: boolean
  getReplyText: () => string
  localeId?: string
  voiceId?: string
}): UseVoiceConversation {
  const {send, isStreaming, getReplyText, localeId = 'en-US', voiceId} = args

  const [convState, setConvState] = useState<VoiceConvState>(
    INITIAL_VOICE_CONV_STATE,
  )
  // Authoritative current state (read synchronously inside callbacks/commands,
  // which can run before React commits the state update).
  const stateRef = useRef<VoiceConvState>(INITIAL_VOICE_CONV_STATE)

  // Keep the latest inputs in refs so the (stable) callbacks never go stale.
  const sendRef = useRef(send)
  const getReplyTextRef = useRef(getReplyText)
  useEffect(() => {
    sendRef.current = send
    getReplyTextRef.current = getReplyText
  }, [send, getReplyText])

  const speakStartRef = useRef(0)

  const voiceRef = useRef<UseVoice | null>(null)

  // Silence-based end-of-utterance detector. Every speech update (partial OR final)
  // re-arms its timer; only a sustained silence (~END_OF_SPEECH_SILENCE_MS) closes
  // the mic, at which point useVoice flushes the full transcript via
  // onFinalUserUtterance → ENDPOINT. Created once.
  const endpointerRef = useRef<SilenceEndpointer | null>(null)
  if (!endpointerRef.current) {
    endpointerRef.current = createSilenceEndpointer({
      onEndpoint: () => {
        // Real speech then sustained silence → stop the mic; the engine stays alive
        // until we explicitly stop, so it's OUR silence window that ends the turn.
        voiceRef.current?.stopListening()
      },
    })
  }

  // ── command runner ────────────────────────────────────────────────────────
  const runCommand = useCallback((cmd: VoiceConvCommand) => {
    const v = voiceRef.current
    if (!v) return
    switch (cmd.type) {
      case 'START_LISTENING':
        endpointerRef.current?.reset()
        void v.startListening()
        break
      case 'STOP_LISTENING':
        endpointerRef.current?.reset()
        v.stopListening()
        break
      case 'SEND':
        sendRef.current(cmd.text)
        break
      case 'SPEAK':
        speakStartRef.current = Date.now()
        v.speak(cmd.text)
        break
      case 'STOP_SPEAKING':
        v.stopSpeaking()
        break
    }
  }, [])

  const dispatch = useCallback(
    (event: VoiceConvEvent) => {
      const {state: next, commands} = voiceConvReducer(stateRef.current, event)
      if (next !== stateRef.current) {
        stateRef.current = next
        setConvState(next)
      }
      for (const cmd of commands) runCommand(cmd)
    },
    [runCommand],
  )

  // ── the voice engine, wired to the machine ─────────────────────────────────
  const voice = useVoice({
    localeId,
    voiceId,
    preferElevenLabs: true,
    onPartialUserUtterance: text => {
      const trimmed = text.trim()
      const state = stateRef.current

      if (state === 'speaking') {
        // Barge-in — but ignore the brief onset window + sub-threshold blips so
        // Bob's own audio (echo) can't interrupt himself. The longer silence
        // window is about deciding the user is DONE, NOT about detecting that they
        // STARTED, so barge-in stays as responsive as before.
        if (
          trimmed.length >= MIN_ACTIVITY_CHARS &&
          Date.now() - speakStartRef.current > BARGE_IN_GRACE_MS
        ) {
          dispatch({type: 'SPEECH_ACTIVITY', text: trimmed})
          // After barge-in we're listening; arm endpointing for the interruption.
          endpointerRef.current?.noteSpeech(text)
        }
        return
      }

      if (state === 'listening') {
        // Partial OR final (useVoice forwards both here) → reset the silence timer.
        endpointerRef.current?.noteSpeech(text)
      }
    },
    onFinalUserUtterance: text => {
      // Fired when we stop the mic at end-of-utterance — the authoritative,
      // fully accumulated transcript. Feed it as the endpoint so the machine sends.
      dispatch({type: 'ENDPOINT', text})
    },
  })
  voiceRef.current = voice

  // Turn finished (isStreaming fell) while thinking → speak the reply.
  const wasStreamingRef = useRef(false)
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      if (stateRef.current === 'thinking') {
        dispatch({type: 'REPLY_READY', text: getReplyTextRef.current()})
      }
    }
    wasStreamingRef.current = isStreaming
  }, [isStreaming, dispatch])

  // Playback finished (speaking fell) while in `speaking` → loop back to listening.
  const wasSpeakingRef = useRef(false)
  useEffect(() => {
    if (wasSpeakingRef.current && !voice.speaking) {
      if (stateRef.current === 'speaking') {
        dispatch({type: 'SPEAK_DONE'})
      }
    }
    wasSpeakingRef.current = voice.speaking
  }, [voice.speaking, dispatch])

  const toggle = useCallback(() => {
    if (stateRef.current === 'off') dispatch({type: 'TOGGLE_ON'})
    else dispatch({type: 'TOGGLE_OFF'})
  }, [dispatch])

  // Cleanup on unmount: stop the loop.
  useEffect(() => {
    return () => {
      endpointerRef.current?.reset()
      if (stateRef.current !== 'off') dispatch({type: 'TOGGLE_OFF'})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {voice, convState, isOn: convState !== 'off', toggle}
}
