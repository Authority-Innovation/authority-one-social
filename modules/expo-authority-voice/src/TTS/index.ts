import {type TtsEvents, type TtsModule, type TtsVoice} from './types'

// Web fallback. Could be backed by the Web Speech API (speechSynthesis) later.
export const TTS: TtsModule = {
  getVoices: (): TtsVoice[] => [],
  speak: (_text: string) => '',
  stop: () => {},
  pause: () => {},
  resume: () => {},
  addListener:
    <E extends keyof TtsEvents>(_e: E, _l: TtsEvents[E]) =>
    () => {},
}

export * from './types'
