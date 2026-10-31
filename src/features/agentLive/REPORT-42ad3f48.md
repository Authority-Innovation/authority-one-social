# Report 42ad3f48 – Agent Live iOS background audio (r233)

Branch `coord/fix-agent-live-audio-background-r233`, base `agent-live/app-integration`
(5062916e). The worktree started on `main` (571924785, an ancestor of the base);
the branch was reset to 5062916e before any work.

## Config diff

`app.config.js` is unchanged. The mode is added by a config plugin that is
applied only when `EXPO_PUBLIC_AGENT_LIVE_ENABLED=true` (the `development-live`
EAS profile), so the location mode, its literal in `app.config.js` and the
location test that reads it are untouched.

Resolved iOS `Info.plist` `UIBackgroundModes`:

| Profile | Before | After |
| --- | --- | --- |
| development-live | `remote-notification, location` | `remote-notification, location, audio` |
| production, testflight, preview, development | `remote-notification, location` | unchanged |

- `plugins/agentLive/index.js`: `addBackgroundAudioMode` / `withAgentLiveBackgroundAudio`,
  appended to `agentLivePlugins()` on-build list.
- `plugins/agentLive/withAgentLiveBackgroundAudio.js`: path entry for app.config.js.

## Audio session

- `src/features/agentLive/room/audioSession.ts`: `LIVE_IOS_AUDIO_POLICY`, a
  LiveKit `IOSAudioSessionPolicy`. Category `playAndRecord` for `recording`,
  `recordingWithoutVoiceProcessing` and `playout`; mode `videoChat` (with VPIO)
  or `default`; options `allowBluetooth`, `allowBluetoothA2DP`, `allowAirPlay`,
  `defaultToSpeaker`; `deactivateOnStop: true`.
- `room/livekit.tsx`: `registerGlobals({autoConfigureAudioSession: false})` then
  `setupIOSAudioManagement(true, LIVE_IOS_AUDIO_POLICY)` (LiveKit RN 3.1.0 API;
  applied natively by `AudioDeviceModule.setAutomaticAudioSessionConfiguration`
  in webrtc 150.1.1). The existing `startAudioSession`/`stopAudioSession` calls
  are kept.
- Why not the SDK default: in 3.1.0 the default playout-only config is
  `playback`/`spokenAudio`, so muting the mic flips the category; unmuting on a
  locked phone would then need a category change to `playAndRecord` and a
  recording start from the background, which iOS refuses. Pinning
  `playAndRecord` avoids it. `mixWithOthers` (in the SDK default) is dropped so
  the session is primary and gets interruptions like a call.

## voip decision: not added

- `voip` is the PushKit VoIP push / CallKit mode. The app has no PushKit or
  CallKit code. Since iOS 13, VoIP pushes must be reported to CallKit, and App
  Review rejects background modes the app does not use (guideline 2.5.4).
- `audio` keeps the app running in the background while the audio session is
  playing or recording, which is the live-session case.
- Evidence, `node_modules/@livekit/react-native` 3.1.0 README: "simple
  background processing can be enabled by selecting the `audio` and `voip`
  UIBackgroundModes ... These background modes will keep the app alive in the
  background as long as a mic or audio track is playing." The only other place
  it requires `voip` is background camera ("Requires voip background mode and
  iOS 18+", `enableMultitaskingCameraAccess`), which we do not enable (camera
  is off by default, and not wanted in the background). For a more robust
  background it recommends CallKit, which would bring `voip` with it.
- Neither `@livekit/react-native-expo-plugin` 1.1.0 nor
  `@config-plugins/react-native-webrtc` 13.0.0 touches `UIBackgroundModes`
  (grepped their build output).
- Risk accepted: if a real device shows the session dropping with `audio` only
  (e.g. a long agent silence with the mic muted), the next step is CallKit plus
  `voip`, not `voip` alone.

## Tests

`src/features/agentLive/__tests__/backgroundAudio.test.ts` (new, 10 tests). It
evaluates `app.config.js` under each EAS profile's env from `eas.json` and
applies the plugin as prebuild would.

- iOS background modes: development-live declares audio, and keeps
  remote-notification and location; development-live does not declare voip;
  production / testflight / preview / development unchanged (4, `it.each`);
  adding the mode is idempotent and keeps existing modes.
- iOS audio session: is playAndRecord in every engine state; is a primary
  session (does not mix with other apps); the binding installs this policy
  instead of the SDK default.

`buildGate.test.ts`: on-build plugin list now includes the background audio
plugin; SDK mock gains `setupIOSAudioManagement`. 11 tests.

Run (Windows, jest directly, see below): `src/features/agentLive`,
`src/screens/AgentLive`, `src/features/aoSignature`,
`noBackgroundLocationShipped`: 254 passed, 1 failed. The failure is
pre-existing and environmental: `noBackgroundLocationShipped` expects
`return\n` and this Windows checkout has CRLF (`core.autocrlf=true`); its
`UIBackgroundModes` includes `'location'` assertion passes.

## Not run

- No Xcode build, no `pod install`, no prebuild: this is a Windows machine.
  Nothing here claims the iOS build passes with livekit-react-native 3.1.0 /
  webrtc 150.1.1. The API used (`setupIOSAudioManagement` with a policy,
  `registerGlobals` options) exists in the installed 3.1.0 sources and
  typechecks; the plugin only edits `ios.infoPlist` and adds no native code.
- No device test of locking the phone mid-session.
- Not the full jest suite. `pnpm test` / `pnpm typecheck` scripts use POSIX env
  syntax that fails under Windows cmd, so jest and tsc were run directly with
  the same flags. `tsc -p tsconfig.communities.json` is clean;
  `tsgo -p tsconfig.check.json` reports only the missing compiled locale
  catalogs (intl:compile is CI-only), nothing in touched files. ESLint on
  `src/features/agentLive` is clean (the `plugins/` dir is outside `pnpm lint`).
- Android background (foreground service) is out of scope.
