export type SpeechBackend = 'speechAnalyzer' | 'whisperKit' | 'unavailable'

export interface SpeechCapabilities {
  /** Which on-device backend would be used. */
  backend: SpeechBackend
  /** `false` means no on-device STT on this device/OS. */
  available: boolean
  /** Whether live partial (volatile) results are emitted — required for barge-in. */
  supportsPartialResults: boolean
  /** e.g. "26.0", "17.5". */
  osVersion: string
}

export interface PartialTranscriptEvent {
  /** Volatile text — may change on the next event. */
  text: string
}

export interface FinalTranscriptEvent {
  /** Committed text for a segment. */
  text: string
}

export interface SpeechErrorEvent {
  message: string
}

export type SpeechEvents = {
  onPartialTranscript: (e: PartialTranscriptEvent) => void
  onFinalTranscript: (e: FinalTranscriptEvent) => void
  onError: (e: SpeechErrorEvent) => void
}

export interface SpeechModule {
  /** Inspect the active backend without starting capture. */
  getCapabilities(): SpeechCapabilities
  /** Request mic + speech-recognition permission. Resolves true only if both granted. */
  requestPermissions(): Promise<boolean>
  /** Start streaming transcription. `localeId` is BCP-47, default "en-US". */
  start(localeId?: string): void
  /** Stop streaming and finalize. */
  stop(): void
  /** Subscribe to a transcript/error event. Returns an unsubscribe fn. */
  addListener<E extends keyof SpeechEvents>(
    event: E,
    listener: SpeechEvents[E],
  ): () => void
}
