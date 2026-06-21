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

// The module only ships an iOS implementation (Apple SpeechAnalyzer / WhisperKit).
// On Android we degrade gracefully so the shared `index.native.ts` import never throws.
const Native: NativeSpeechModule | null =
  Platform.OS === 'ios'
    ? requireNativeModule<NativeSpeechModule>('AuthoritySpeechModule')
    : null

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
