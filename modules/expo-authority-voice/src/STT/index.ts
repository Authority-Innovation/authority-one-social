import {
  type SpeechCapabilities,
  type SpeechEvents,
  type SpeechModule,
} from './types'

// Web fallback — no on-device STT. (The Web Speech API could be wired here later.)
const UNAVAILABLE: SpeechCapabilities = {
  backend: 'unavailable',
  available: false,
  supportsPartialResults: false,
  osVersion: '',
}

export const STT: SpeechModule = {
  getCapabilities: () => UNAVAILABLE,
  requestPermissions: () => Promise.resolve(false),
  start: () => {},
  stop: () => {},
  addListener:
    <E extends keyof SpeechEvents>(_e: E, _l: SpeechEvents[E]) =>
    () => {},
}

export * from './types'
