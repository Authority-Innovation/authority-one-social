import {Platform} from 'react-native'
import {requireNativeModule} from 'expo-modules-core'

import {
  type SpeechCapabilities,
  type SpeechEvents,
  type SpeechModule,
} from './types'

/** Subscription handle returned by the native module's `addListener`. */
interface NativeSubscription {
  remove(): void
}

/**
 * Typed surface of the iOS native module (`AuthoritySpeechModule`). The Expo
 * native module is otherwise `any`, so this interface is what lets the rest of
 * the file stay type-safe.
 */
interface NativeSpeechModule {
  getCapabilities(): SpeechCapabilities
  requestPermissions(): Promise<boolean>
  start(localeId: string): void
  stop(): void
  addListener<E extends keyof SpeechEvents>(
    event: E,
    listener: SpeechEvents[E],
  ): NativeSubscription
}

const UNAVAILABLE: SpeechCapabilities = {
  backend: 'unavailable',
  available: false,
  supportsPartialResults: false,
  osVersion: Platform.Version?.toString() ?? '',
}

// Native implementations ship for BOTH iOS (Apple SpeechAnalyzer / WhisperKit) and
// Android (android.speech.SpeechRecognizer). On any other platform (there shouldn't
// be one that loads this `.native` file) we degrade gracefully so the import never
// throws. requireNativeModule is wrapped so a missing/unlinked native module reports
// `unavailable` rather than crashing the screen.
const Native: NativeSpeechModule | null = (() => {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null
  try {
    return requireNativeModule<NativeSpeechModule>('AuthoritySpeechModule')
  } catch {
    return null
  }
})()

export const STT: SpeechModule = {
  getCapabilities(): SpeechCapabilities {
    if (!Native) return UNAVAILABLE
    return Native.getCapabilities()
  },
  requestPermissions(): Promise<boolean> {
    if (!Native) return Promise.resolve(false)
    return Native.requestPermissions()
  },
  start(localeId: string = 'en-US'): void {
    Native?.start(localeId)
  },
  stop(): void {
    Native?.stop()
  },
  addListener<E extends keyof SpeechEvents>(
    event: E,
    listener: SpeechEvents[E],
  ): () => void {
    if (!Native) return () => {}
    const sub = Native.addListener(event, listener)
    return () => sub.remove()
  },
}

export * from './types'
