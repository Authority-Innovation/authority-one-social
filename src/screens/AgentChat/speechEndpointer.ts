/**
 * SILENCE-BASED END-OF-UTTERANCE DETECTOR ("endpointer") — pure & timer-injectable.
 *
 * In continuous voice-chat the hard problem is deciding when the user has actually
 * FINISHED talking. Apple's SpeechTranscriber streams two kinds of updates while the
 * user speaks: volatile *partials* (the in-progress hypothesis) and committed
 * *finals* (a segment is locked in). A brief mid-sentence pause — or the gap right
 * after the engine commits a final segment — is NOT the end of a turn, yet that is
 * exactly when no fresh partial is arriving. Endpointing purely on "no partial for a
 * moment" therefore cuts the user off mid-thought.
 *
 * This endpointer fixes that: EVERY speech update (partial OR final) re-arms a single
 * silence timer, and the turn is finalized only after a SUSTAINED silence of
 * {@link END_OF_SPEECH_SILENCE_MS}. So a natural ~1s thinking pause is tolerated, but
 * a clear stop (~2s) ends the turn.
 *
 * The detector is a pure object with injectable timer fns so the timing behaviour
 * (a partial resets the timer; only sustained silence finalizes) is unit-testable
 * without React, the mic, or real wall-clock waits.
 */

/**
 * Sustained silence, in milliseconds, after the LAST speech update before we treat
 * the utterance as finished. This is the one knob to turn for "did they stop talking
 * or just pause to think?": a person can pause ~1s mid-thought without being cut off,
 * but a clear stop (~2s) ends the turn. Tune this single constant to taste.
 */
export const END_OF_SPEECH_SILENCE_MS = 1800

/** Minimum trimmed length that counts as real speech (filters stray one-char blips). */
export const MIN_SPEECH_CHARS = 2

export interface SilenceEndpointerOptions {
  /** Silence window in ms before finalizing (defaults to END_OF_SPEECH_SILENCE_MS). */
  silenceMs?: number
  /** Minimum chars for an update to count as speech (defaults to MIN_SPEECH_CHARS). */
  minChars?: number
  /**
   * Called exactly once when sustained silence is reached AFTER real speech was
   * heard. Receives the full accumulated transcript observed at the endpoint.
   */
  onEndpoint: (text: string) => void
  /** Injectable timer fns (tests pass fakes); default to the host globals. */
  setTimeoutFn?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void
}

export interface SilenceEndpointer {
  /**
   * Note a speech update — a partial OR a final — carrying the FULL accumulated
   * transcript so far. Re-arms the silence timer. Updates below the speech threshold
   * are recorded but won't (re)arm until real speech has been heard.
   */
  noteSpeech: (fullText: string) => void
  /** The latest (most complete) transcript observed since the last reset. */
  current: () => string
  /** Cancel any pending endpoint and clear state. Call on START/STOP listening. */
  reset: () => void
  /** True once real speech (>= minChars) has been observed since the last reset. */
  hasSpeech: () => boolean
}

/** Create a silence endpointer. See module docs for the timing contract. */
export function createSilenceEndpointer(
  opts: SilenceEndpointerOptions,
): SilenceEndpointer {
  const silenceMs = opts.silenceMs ?? END_OF_SPEECH_SILENCE_MS
  const minChars = opts.minChars ?? MIN_SPEECH_CHARS
  const setT =
    opts.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms))
  const clearT = opts.clearTimeoutFn ?? (handle => clearTimeout(handle))

  let timer: ReturnType<typeof setTimeout> | null = null
  let transcript = ''
  let sawSpeech = false

  const clearTimer = () => {
    if (timer !== null) {
      clearT(timer)
      timer = null
    }
  }

  return {
    noteSpeech(fullText: string) {
      const trimmed = fullText.trim()
      // Always keep the most complete transcript we've seen.
      if (trimmed.length > 0) transcript = trimmed
      // Don't start the silence countdown until we've actually heard real speech;
      // otherwise stray empty/blip updates would arm (and then fire) an endpoint.
      if (trimmed.length < minChars && !sawSpeech) return
      if (trimmed.length >= minChars) sawSpeech = true
      // Any qualifying update (partial OR final) restarts the silence window.
      clearTimer()
      timer = setT(() => {
        timer = null
        const finalText = transcript.trim()
        if (sawSpeech && finalText.length >= minChars) {
          opts.onEndpoint(finalText)
        }
      }, silenceMs)
    },
    current: () => transcript,
    reset() {
      clearTimer()
      transcript = ''
      sawSpeech = false
    },
    hasSpeech: () => sawSpeech,
  }
}
