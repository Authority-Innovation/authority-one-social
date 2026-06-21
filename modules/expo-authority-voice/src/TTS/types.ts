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
  /** Speak text. Returns the utteranceId used in lifecycle events. */
  speak(text: string, options?: SynthesisOptions): string
  /** Stop immediately — used for barge-in. */
  stop(): void
  pause(): void
  resume(): void
  addListener<E extends keyof TtsEvents>(
    event: E,
    listener: TtsEvents[E],
  ): () => void
}
