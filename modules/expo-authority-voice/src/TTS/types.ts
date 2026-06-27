export interface TtsVoice {
  id: string
  name: string
  language: string
}

export interface SynthesisOptions {
  /** BCP-47 locale, e.g. "en-US". */
  localeId?: string
  /** Backend-specific voice id (see getVoices()). */
  voiceId?: string
  /** Normalized 0..1 speaking rate; backend scales to its own range. */
  rate?: number
  /** Pitch multiplier 0.5..2.0 (AVSpeechSynthesizer range). */
  pitch?: number
}

export interface TtsLifecycleEvent {
  utteranceId: string
}

export interface TtsErrorEvent {
  utteranceId: string
  message: string
}

export type TtsEvents = {
  onSpeechStart: (e: TtsLifecycleEvent) => void
  onSpeechDone: (e: TtsLifecycleEvent) => void
  onSpeechCanceled: (e: TtsLifecycleEvent) => void
  onSpeechError: (e: TtsErrorEvent) => void
}

export interface TtsModule {
  getVoices(): TtsVoice[]
  /** Speak text on-device (AVSpeechSynthesizer). Returns the utteranceId. */
  speak(text: string, options?: SynthesisOptions): string
  /**
   * Play already-synthesized audio (e.g. ElevenLabs "Bob" voice fetched via the
   * runtime proxy) from a base64-encoded clip (MP3). Emits the SAME lifecycle
   * events as `speak` (onSpeechStart/Done/Canceled/Error) keyed by the returned
   * utteranceId, so callers treat remote and on-device voices uniformly.
   * `stop()` interrupts it (barge-in), exactly like `speak`.
   */
  playClip(base64: string, options?: SynthesisOptions): string
  /** Stop immediately — used for barge-in (cuts both `speak` AND `playClip`). */
  stop(): void
  pause(): void
  resume(): void
  addListener<E extends keyof TtsEvents>(
    event: E,
    listener: TtsEvents[E],
  ): () => void
}
