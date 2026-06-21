# Voice + Agent Chat integration — report & owner runbook

On-device voice (STT/TTS) and a streaming agent-chat surface added to the One app fork. Everything is **additive** — no existing screen, route, or build setting was removed, and the module compiles even before the optional WhisperKit package is added. This environment can't build/sign iOS, so the code is written and typechecked here; **you run the Xcode build/test loop.**

Typecheck status: `tsc --noEmit --project ./tsconfig.check.json` → **0 errors**. (ESLint couldn't run in the build sandbox — its native resolver binary is macOS-only here; run `pnpm lint --fix` on your Mac, it will only re-sort imports if anything.)

---

## 1. What was built

Three modules plus wiring:

1. **STT** — live, on-device speech-to-text. Apple **SpeechAnalyzer/SpeechTranscriber** on iOS 26+, **WhisperKit** (Core ML / Neural Engine) fallback on iOS 17–25, chosen at runtime. Emits volatile partial transcripts (needed for barge-in).
2. **TTS** — **AVSpeechSynthesizer**, hidden behind a Swift `SpeechSynthesizing` protocol so Orca / ElevenLabs can drop in later by changing one factory method.
3. **Chat wiring** — a streaming client for the runtime's `POST /app/chat` (SSE over `expo/fetch`), a new **Agent Chat** screen that renders streamed replies + approval-action buttons, a mic affordance, and **barge-in** (new user speech cuts off TTS).

Both native capabilities are **Swift native modules bridged to React Native via Expo Modules**, each with a TypeScript interface. The package ships iOS only; Android and web resolve to graceful no-ops so the existing builds are unaffected.

---

## 2. Files added

Native voice module (`modules/expo-authority-voice/`):

- `expo-module.config.json` — registers `AuthoritySpeechModule` + `AuthorityTtsModule` (iOS).
- `index.ts` — public TS entry: `export {STT, TTS}` + types.
- `README.md` — module-level quickstart + setup summary.
- `ios/ExpoAuthorityVoice.podspec` — pod, iOS 17 floor, `ExpoModulesCore` dep.
- `ios/STT/SpeechRecognizing.swift` — backend protocol + `SpeechBackend` enum + `TranscriptUpdate`.
- `ios/STT/MicrophoneTap.swift` — shared `AVAudioEngine` capture + audio-session setup.
- `ios/STT/AnalyzerTranscriber.swift` — **iOS 26+** SpeechAnalyzer backend (volatile results, model auto-install).
- `ios/STT/WhisperKitTranscriber.swift` — **iOS 17–25** WhisperKit backend, wrapped in `#if canImport(WhisperKit)`.
- `ios/STT/AuthoritySpeechModule.swift` — Expo module: `getCapabilities`, `requestPermissions`, `start`, `stop` + events.
- `ios/TTS/SpeechSynthesizing.swift` — TTS backend protocol + options + delegate.
- `ios/TTS/AVSpeechSynthEngine.swift` — AVSpeechSynthesizer impl.
- `ios/TTS/AuthorityTtsModule.swift` — Expo module: `getVoices`, `speak`, `stop`, `pause`, `resume` + events; `makeBackend()` is the swap point.
- `src/STT/{types.ts,index.native.ts,index.ts}` — STT TS interface (native iOS / no-op web).
- `src/TTS/{types.ts,index.native.ts,index.ts}` — TTS TS interface.

Chat network layer (`src/lib/agent-runtime/`):

- `types.ts` — wire types: `ChatMessage`, `ChatStreamEvent`, `ApprovalAction`, …
- `config.ts` — base URL + endpoint + default agent.
- `authToken.ts` — **Supabase session token provider (STUBBED — see §6)**.
- `chatClient.ts` — `streamChat()` SSE streaming client over `expo/fetch` (with abort).
- `approvals.ts` — `postApprovalDecision()` (approve/reject an action).
- `index.ts` — barrel export.

Agent Chat screen (`src/screens/AgentChat/`):

- `index.tsx` — the screen (composer, mic button, live partial, auto-speak toggle, barge-in).
- `useAgentChat.ts` — chat state machine (streaming reply → one pending assistant bubble, approvals).
- `useVoice.ts` — couples STT+TTS, implements barge-in, flushes final utterance to send.
- `MessageBubble.tsx`, `ApprovalCard.tsx` — UI pieces.

Other:

- `src/components/icons/Microphone.tsx` — mic icon (none existed in the set).

## 3. Files changed (all additive)

- `app.config.js` — added `NSSpeechRecognitionUsageDescription`; broadened `NSMicrophoneUsageDescription` to mention voice chat.
- `src/lib/constants.ts` — added `AGENT_RUNTIME_SERVICE`.
- `src/lib/routes/types.ts` — added `AgentChat: {agent?: string}` to `CommonNavigatorParams`.
- `src/routes.ts` — added `AgentChat: '/agent'`.
- `src/Navigation.tsx` — imported + registered `AgentChatScreen` in `commonScreens` (reachable from every navigator; `requireAuth`).
- `src/view/shell/Drawer.tsx` — added a "Talk to your agent" drawer item → navigates to `AgentChat`.

---

## 4. The module interfaces

### STT (TypeScript) — `modules/expo-authority-voice/src/STT/types.ts`

```ts
type SpeechBackend = 'speechAnalyzer' | 'whisperKit' | 'unavailable'

interface SpeechModule {
  getCapabilities(): SpeechCapabilities          // {backend, available, supportsPartialResults, osVersion}
  requestPermissions(): Promise<boolean>          // mic + speech recognition
  start(localeId?: string): void                  // default 'en-US'
  stop(): void
  addListener(event, listener): () => void        // 'onPartialTranscript' | 'onFinalTranscript' | 'onError'
}
```

### STT (Swift bridge) — `AuthoritySpeechModule`

`Function("getCapabilities")`, `AsyncFunction("requestPermissions")`, `Function("start")`, `Function("stop")`; `Events("onPartialTranscript","onFinalTranscript","onError")`. A factory picks `AnalyzerTranscriber` (iOS 26+) or `WhisperKitTranscriber` (canImport), both conforming to `SpeechRecognizing`.

### TTS (TypeScript) — `modules/expo-authority-voice/src/TTS/types.ts`

```ts
interface TtsModule {
  getVoices(): TtsVoice[]
  speak(text: string, options?: SynthesisOptions): string   // returns utteranceId
  stop(): void                                               // barge-in
  pause(): void; resume(): void
  addListener(event, listener): () => void                   // onSpeechStart|Done|Canceled|Error
}
```

### TTS (Swift bridge) — `AuthorityTtsModule`

`getVoices`, `speak`, `stop`, `pause`, `resume` + lifecycle events. Backend is the `SpeechSynthesizing` protocol; `AuthorityTtsModule.makeBackend()` returns `AVSpeechSynthEngine` today. **To add a premium "Bob voice":** implement `SpeechSynthesizing` (e.g. `ElevenLabsSynthEngine`) and return it from `makeBackend()` — no JS or call-site change.

---

## 5. iOS setup you must do in Xcode (exact steps)

The native module is already structured; these steps make it build and run.

1. **Regenerate the native project** (picks up the new module + Info.plist strings):
   ```bash
   cd authority-one-social
   npx expo prebuild -p ios        # or `--clean` if you want a fresh ios/ dir
   ```
   The two Expo modules autolink from `expo-module.config.json` — nothing to add to the Podfile by hand.

2. **Add WhisperKit (Swift Package Manager)** — enables the iOS 17–25 fallback. Open `ios/*.xcworkspace`, then *File → Add Package Dependencies…* → URL `https://github.com/argmaxinc/WhisperKit` → pin a release (tested shape targets the current `0.9.x` API) → add the **WhisperKit** library product to the app target.
   - The fallback Swift is wrapped in `#if canImport(WhisperKit)`, so **the app builds without this**; on iOS 17–25 STT will just report `unavailable` until you add it. iOS 26+ (SpeechAnalyzer) works regardless.

3. **Info.plist usage strings** — already declared in `app.config.js` and emitted by prebuild:
   - `NSMicrophoneUsageDescription`
   - `NSSpeechRecognitionUsageDescription`
   If you maintain `ios/` manually instead of via prebuild, confirm both keys are present in `ios/<App>/Info.plist`.

4. **Deployment target** — app stays at its configured `deploymentTarget` (currently `15.1` in `app.config.js`). The module podspec floor is **iOS 17**. If your app target is below 17, either raise it or keep it — SpeechAnalyzer code is `@available(iOS 26)` gated and WhisperKit is `canImport`-gated, so nothing forces a bump, but **iOS 17 is the practical floor for the fallback to exist.** Target device is iPhone 13+ (A15), which covers both tiers.

5. **Entitlements** — none required. SpeechAnalyzer and WhisperKit are on-device; no Siri entitlement, no special capability. (If you later add background audio capture, add the `audio` background mode — not needed for foreground push-to-talk.)

6. **First run** — SpeechAnalyzer downloads the per-locale model on first use via `AssetInventory`; the first `en-US` session may pause briefly while it installs. WhisperKit downloads its model on first `WhisperKit(...)` init.

7. **`pod install`** runs as part of prebuild; if you edited `ios/` by hand, run it from `ios/`.

---

## 6. What's stubbed (and how to finish it)

**Supabase session token provider** — `src/lib/agent-runtime/authToken.ts`. The runtime authenticates `/app/chat` with the user's **Supabase** bearer (not the atproto/PDS session). Supabase login isn't wired into this fork yet, so `getSupabaseAccessToken()` currently returns `process.env.EXPO_PUBLIC_DEV_SUPABASE_TOKEN ?? null`. The network layer attaches `Authorization: Bearer <token>` cleanly when a token exists and surfaces a clear "not authorized" message when it doesn't.

To finish: call `setSupabaseTokenProvider(async () => …)` once Supabase auth lands, e.g.
```ts
import {setSupabaseTokenProvider} from '#/lib/agent-runtime'
setSupabaseTokenProvider(async () =>
  (await supabase.auth.getSession()).data.session?.access_token ?? null)
```
Only that one file changes. For local testing before then, set `EXPO_PUBLIC_DEV_SUPABASE_TOKEN` to a hand-issued token.

**`/app/chat` wire contract** — `src/lib/agent-runtime/types.ts` encodes what I assumed the parallel runtime task is building: SSE frames of `{type:'text',delta}` / `{type:'actions',actions}` / `{type:'done'}` / `{type:'error'}`, plus `[DONE]` sentinel support. If the runtime's event names/shapes differ, adjust `dispatch()` in `chatClient.ts` (one switch) — the screen and hooks don't change. `POST /app/approvals {actionId, decision, agent}` is assumed for approve/reject; adjust `approvals.ts` if the route differs.

**WhisperKit streaming call** — `WhisperKitTranscriber.swift` follows the current public `AudioStreamTranscriber` API. If you pin a version with a different signature, that one file (isolated behind `canImport`) is where you adjust it.

---

## 7. How barge-in works

`useVoice.ts` owns it. TTS lifecycle events keep a `speakingRef`. When STT emits `onPartialTranscript` with non-empty text **while** `speakingRef` is true, TTS is stopped immediately (`AVSpeechSynthesizer.stopSpeaking(.immediate)`). Tapping the mic or sending text also stops any in-flight speech. The audio session is `.playAndRecord` with `.duckOthers` so the mic can listen while audio plays.

---

## 8. Build & test (owner)

```bash
cd authority-one-social
pnpm install                      # if needed
npx expo prebuild -p ios
# add WhisperKit via SPM in Xcode (step 5.2)
pnpm typecheck                    # expect 0 errors (verified here)
pnpm lint --fix                   # re-sorts imports if needed (couldn't run in my sandbox)

# Run on device (iPhone 13+ recommended; SpeechAnalyzer needs a real device, not the sim, for mic):
npx expo run:ios --device
```

Manual test checklist:

- Open the drawer → **Talk to your agent** → screen loads; header shows "Voice unavailable" only if neither backend is present.
- Type a message → reply streams token-by-token into one bubble; when done it's spoken aloud (toggle the speaker in the header to mute).
- Tap the mic → grant mic + speech permission → speak → live partial text appears → tap mic again → the utterance is sent.
- While the agent is speaking, start talking → speech cuts off mid-sentence (barge-in).
- If the runtime returns an approval action, an **Approve / Reject** card renders; tapping posts the decision.
- Auth: with no Supabase token wired, expect a clear "Not authorized" message — confirms the bearer path is intact (set `EXPO_PUBLIC_DEV_SUPABASE_TOKEN` to test end-to-end).

Web/Android builds: STT/TTS are no-ops, the screen still renders (text chat works), nothing breaks.

---

## 9. Notes / assumptions to confirm

- The runtime `/app/chat` SSE shape and `/app/approvals` route are assumed (the parallel task owns the truth) — see §6.
- SpeechAnalyzer real-device only for mic; the iOS Simulator has no microphone input for live STT.
- Two Expo modules live in one package (`AuthoritySpeechModule`, `AuthorityTtsModule`), same pattern as `expo-bluesky-swiss-army`.
- Nothing was committed/pushed by me beyond writing files (git index was locked in the sandbox) — review the diff and commit on your Mac.
