import {Platform} from 'react-native'
import {requireNativeModule} from 'expo-modules-core'

import {
  type SynthesisOptions,
  type TtsEvents,
  type TtsModule,
  type TtsVoice,
} from './types'

/** Subscription handle returned by the native module's `addListener`. */
interface NativeSubscription {
  remove(): void
}

/**
 * Typed surface of the iOS native module (`AuthorityTtsModule`). The Expo native
 * module is otherwise `any`; this interface keeps the rest of the file type-safe.
 */
interface NativeTtsModule {
  getVoices(): TtsVoice[]
  speak(
    text: string,
    utteranceId: string,
    options: SynthesisOptions | null,
  ): void
  playClip(
    base64: string,
    utteranceId: string,
    options: SynthesisOptions | null,
  ): void
  stop(): void
  pause(): void
  resume(): void
  addListener<E extends keyof TtsEvents>(
    event: E,
    listener: TtsEvents[E],
  ): NativeSubscription
}

// iOS-only native impl (AVSpeechSynthesizer). Android degrades to no-op.
const Native: NativeTtsModule | null =
  Platform.OS === 'ios'
    ? requireNativeModule<NativeTtsModule>('AuthorityTtsModule')
    : null

let counter = 0
function nextUtteranceId(): string {
  counter += 1
  return `utt_${Date.now()}_${counter}`
}

export const TTS: TtsModule = {
  getVoices(): TtsVoice[] {
    if (!Native) return []
    return Native.getVoices()
  },
  speak(text: string, options?: SynthesisOptions): string {
    const id = nextUtteranceId()
    Native?.speak(text, id, options ?? null)
    return id
  },
  playClip(base64: string, options?: SynthesisOptions): string {
    const id = nextUtteranceId()
    Native?.playClip(base64, id, options ?? null)
    return id
  },
  stop(): void {
    Native?.stop()
  },
  pause(): void {
    Native?.pause()
  },
  resume(): void {
    Native?.resume()
  },
  addListener<E extends keyof TtsEvents>(
    event: E,
    listener: TtsEvents[E],
  ): () => void {
    if (!Native) return () => {}
    const sub = Native.addListener(event, listener)
    return () => sub.remove()
  },
}

export * from './types'
