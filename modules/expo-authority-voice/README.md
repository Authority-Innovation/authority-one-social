# expo-authority-voice

On-device speech-to-text and text-to-speech for the One app, bridged to React Native via Expo Modules. **iOS and Android** (web compiles to graceful no-ops). Both platforms implement the SAME JS contract (`src/STT/types.ts`, `src/TTS/types.ts`), so `useVoice`, `playAgentClip.ts`, and the mic UI behave identically without any platform branching in the app.

## Modules

- **STT** (`AuthoritySpeechModule`) — live, on-device transcription.
  - iOS primary: Apple **SpeechAnalyzer / SpeechTranscriber** (iOS 26+), streaming, with volatile partial results.
  - iOS fallback: **WhisperKit** (Argmax, Core ML / Neural Engine) for iOS 17–25. Currently disabled in the native build (see `AuthoritySpeechModule.swift` — the transcriber impl was removed for the first TestFlight; restoring it is a non-trivial follow-up: re-add the WhisperKit SPM package and reinstate `WhisperKitTranscriber.swift`).
  - Android: **`android.speech.SpeechRecognizer`** (on-device where available via `createOnDeviceSpeechRecognizer`, API 31+; otherwise the platform recognizer). It is single-shot by design, so `AndroidSpeechRecognizer` runs it CONTINUOUSLY — restarting a fresh session after each `onResults`/transient error — to match the iOS "stream until `stop()`" contract. Volatile `onPartialResults` map to non-final updates and `onResults` to final ones.
  - Backend is chosen at runtime via `getCapabilities()`. The reported `backend` string is `speechAnalyzer` (iOS 26+), `whisperKit` (iOS 17–25, when enabled), `androidSpeechRecognizer`, or `unavailable`.
- **TTS** (`AuthorityTtsModule`) — two voices behind one event stream:
  - `speak(text, opts)` → on-device synthesizer. iOS: `AVSpeechSynthesizer` (behind the `SpeechSynthesizing` Swift protocol). Android: `android.speech.TextToSpeech` (behind the `SpeechSynthesizing` Kotlin interface). The swap point for a neural engine is `makeBackend()` on each platform.
  - `playClip(base64, opts)` → plays already-synthesized audio (the ElevenLabs "Bob" voice, fetched server-side via the runtime `/app/tts` proxy and handed down as base64 MP3) through `AudioClipPlayer` — `AVAudioPlayer` on iOS, `MediaPlayer` (fed from an in-memory `MediaDataSource`, no disk I/O) on Android.
  - Both emit the same lifecycle events (`onSpeechStart/Done/Canceled/Error`) and are both silenced by the same `stop()` (barge-in). On Android a new `speak` (QUEUE_FLUSH) or `stop()` surfaces the superseded utterance as `onSpeechCanceled`, matching iOS.
- **Echo cancellation** — iOS `MicrophoneTap` enables Apple voice-processing I/O (`setVoiceProcessingEnabled`) so the mic can stay open during playback (continuous mode / barge-in) without Bob's audio self-triggering. On Android the platform `SpeechRecognizer` uses the `VOICE_RECOGNITION` audio source, which applies the system AEC; there is no separate mic-tap class.

## Android permissions & build

- `android/src/main/AndroidManifest.xml` declares `RECORD_AUDIO` (merged into the app manifest at prebuild) plus `<queries>` for `RecognitionService` / `TTS_SERVICE` (required for Android 11+ package visibility). The app requests `RECORD_AUDIO` at runtime through `STT.requestPermissions()` (Expo `Permissions`).
- Kotlin sources live in `android/src/main/java/expo/modules/authorityvoice/{stt,tts}`; the module classes autolink from `expo-module.config.json`. No `Info.plist`-style usage string is needed on Android.

## TS usage

```ts
import {STT, TTS} from '../../modules/expo-authority-voice'

const caps = STT.getCapabilities()          // {backend, available, supportsPartialResults, osVersion}
await STT.requestPermissions()
const off = STT.addListener('onPartialTranscript', e => console.log(e.text))
STT.start('en-US')
// ...
STT.stop(); off()

const id = TTS.speak('Hello from One', {rate: 0.5})    // on-device voice
TTS.playClip(base64Mp3, {})                            // ElevenLabs "Bob" clip
TTS.stop()                                             // barge-in (stops either)
```

For the full hands-free experience (continuous listen↔think↔speak loop, barge-in, ElevenLabs Bob voice with on-device fallback) see `src/screens/AgentChat/` (`useVoiceConversation` + `voiceConversationMachine`) and `pilot-agent-runtime/IN-APP-VOICE.md`.

## Owner setup (Xcode) — required before the native build

1. **WhisperKit SPM package** (enables the iOS 17–25 fallback). In Xcode → *File → Add Package Dependencies* → `https://github.com/argmaxinc/WhisperKit` → pin a release (e.g. `0.9.x`) → add `WhisperKit` to the app target. The Swift fallback is wrapped in `#if canImport(WhisperKit)`, so the app builds without it (fallback just reports `unavailable`); add it to light up iOS 17–25.
2. **Info.plist usage strings** — already added in `app.config.js`: `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription`. Re-run `npx expo prebuild` to regenerate the native project.
3. **Deployment target** — module podspec floor is iOS 17. The app target stays at its configured `deploymentTarget`.
4. After `expo prebuild` + `pod install`, the two modules autolink from `expo-module.config.json`.

See `../../VOICE-CHAT-INTEGRATION.md` (repo root) for the full report and step-by-step.

## Notes / assumptions

- The WhisperKit `AudioStreamTranscriber` call shape follows the current public API; if you pin a version with a different signature, adjust `WhisperKitTranscriber.swift` (one file, isolated behind `canImport`).
- SpeechAnalyzer model assets download on first use per locale via `AssetInventory` — first run for a new locale may pause briefly while the model installs.
