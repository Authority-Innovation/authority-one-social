import {type TtsEvents, type TtsModule, type TtsVoice} from './types'

// Web fallback. Could be backed by the Web Speech API (speechSynthesis) later.
export const TTS: TtsModule = {
  getVoices: (): TtsVoice[] => [],
  speak: (_text: string) => '',
  // Web has no native audio-clip player here; the web app uses the no-op TTS and
  // (if desired later) the Web Audio / Audio() API. Returns '' = nothing played.
  playClip: (_base64: string) => '',
  stop: () => {},
  pause: () => {},
  resume: () => {},
  addListener:
    <E extends keyof TtsEvents>(_e: E, _l: TtsEvents[E]) =>
    () => {},
}

export * from './types'
