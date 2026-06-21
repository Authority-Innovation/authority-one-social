// Public entry point for the on-device voice module.
//
//   import {STT, TTS} from '../../modules/expo-authority-voice'
//
// Platform resolution:
//   - iOS / Android: src/STT/index.native.ts + src/TTS/index.native.ts (iOS native, Android no-op)
//   - Web:           src/STT/index.ts + src/TTS/index.ts (no-op fallbacks)
export {STT} from './src/STT'
export type {
  FinalTranscriptEvent,
  PartialTranscriptEvent,
  SpeechBackend,
  SpeechCapabilities,
  SpeechErrorEvent,
  SpeechEvents,
  SpeechModule,
} from './src/STT/types'
export {TTS} from './src/TTS'
export type {
  SynthesisOptions,
  TtsErrorEvent,
  TtsEvents,
  TtsLifecycleEvent,
  TtsModule,
  TtsVoice,
} from './src/TTS/types'
