# expo-authority-voice

On-device speech-to-text and text-to-speech for the One app, bridged to React Native via Expo Modules. **iOS only** (Android/web compile to graceful no-ops).

## Modules

- **STT** (`AuthoritySpeechModule`) — live, on-device transcription.
  - Primary: Apple **SpeechAnalyzer / SpeechTranscriber** (iOS 26+), streaming, with volatile partial results.
  - Fallback: **WhisperKit** (Argmax, Core ML / Neural Engine) for iOS 17–25.
  - Backend is chosen at runtime via `getCapabilities()`. iPhone 13 (A15) runs both.
- **TTS** (`AuthorityTtsModule`) — `AVSpeechSynthesizer`, behind a `SpeechSynthesizing` Swift protocol so a neural/cloud engine (Orca, ElevenLabs) can drop in by changing only `AuthorityTtsModule.makeBackend()`.

## TS usage

```ts
import {STT, TTS} from '../../modules/expo-authority-voice'

const caps = STT.getCapabilities()          // {backend, available, supportsPartialResults, osVersion}
await STT.requestPermissions()
const off = STT.addListener('onPartialTranscript', e => console.log(e.text))
STT.start('en-US')
// ...
STT.stop(); off()

const id = TTS.speak('Hello from One', {rate: 0.5})
TTS.stop()                                   // barge-in
```

## Owner setup (Xcode) — required before the native build

1. **WhisperKit SPM package** (enables the iOS 17–25 fallback). In Xcode → *File → Add Package Dependencies* → `https://github.com/argmaxinc/WhisperKit` → pin a release (e.g. `0.9.x`) → add `WhisperKit` to the app target. The Swift fallback is wrapped in `#if canImport(WhisperKit)`, so the app builds without it (fallback just reports `unavailable`); add it to light up iOS 17–25.
2. **Info.plist usage strings** — already added in `app.config.js`: `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription`. Re-run `npx expo prebuild` to regenerate the native project.
3. **Deployment target** — module podspec floor is iOS 17. The app target stays at its configured `deploymentTarget`.
4. After `expo prebuild` + `pod install`, the two modules autolink from `expo-module.config.json`.

See `../../VOICE-CHAT-INTEGRATION.md` (repo root) for the full report and step-by-step.

## Notes / assumptions

- The WhisperKit `AudioStreamTranscriber` call shape follows the current public API; if you pin a version with a different signature, adjust `WhisperKitTranscriber.swift` (one file, isolated behind `canImport`).
- SpeechAnalyzer model assets download on first use per locale via `AssetInventory` — first run for a new locale may pause briefly while the model installs.
