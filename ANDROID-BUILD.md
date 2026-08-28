# Android Build — First Debug APK (2026-08-29)

State and recipe for building the "One" Android app, from the first-ever Android
build attempt of this fork. Companion to NATIVE-PARITY-STATUS.md (whose Android
section is partly stale — corrections below).

## Corrections to NATIVE-PARITY-STATUS.md (assessed 2026-07-20)

1. **The GameRoom ChatLane keyboard blocker is FIXED on main** — `47c1da689`
   (2026-07-21, the day after the assessment): keyboard-height spacer in both
   GameRoom layouts + bar-clearance animation in ChatLane, the AgentChat pattern.
   Nothing left to do there.
2. **`android/` is NOT committed.** `.gitignore:98` ignores `/android/` (upstream
   Bluesky convention: native projects are `expo prebuild` artifacts). "android/
   prebuilt" in the parity doc means a *local, untracked* directory existed on the
   Mac — generated ~2026-06-28 and stale versus `app.config.js`:
   - package `com.authorityone` vs config's `com.authorityone.app`
   - app label "Authority-One" vs the "One" branding
   - missing the `@bitdrift/react-native` prebuild edits (Maven repo + Gradle
     plugin) — build failure #1
   - missing `color/iconBackground` for the adaptive launcher icon — build
     failure #2
3. `feat/android-voice-parity` merged cleanly (as predicted): branch
   `android/first-debug-build`, contract tests 15/15, full typecheck green.

## Toolchain (this Mac, verified working)

- **JDK 17**: Homebrew `openjdk@17` (not linked as system Java).
  `export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`
- **Android SDK**: `~/Library/Android/sdk` (platform-34, build-tools 34.0.0,
  NDK 26.x; all licenses accepted, so AGP auto-downloads anything newer it needs).
  `export ANDROID_HOME=$HOME/Library/Android/sdk`
- `android/local.properties` → `sdk.dir=$HOME/Library/Android/sdk` (untracked).

## Build recipe (durable path)

```bash
# 1. Regenerate the native project from app.config.js (fixes ALL the staleness
#    above in one shot: package id, label, bitdrift edits, icon colors):
npx expo prebuild --platform android --no-install

# 2. Build:
cd android && ./gradlew :app:assembleDebug -x lint
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

Notes:
- The bitdrift config plugin (in `app.config.js`, `networkInstrumentation: true`)
  injects `io.bitdrift.capture-plugin` 0.17.26 + the `dl.bitdrift.io/sdk/android-maven`
  repo into app/build.gradle and settings.gradle during prebuild. If building the
  stale local project instead, those edits must be applied by hand (they were,
  2026-08-29, along with `iconBackground` `#F4F0E8` in res/values/colors.xml).
- `google-services.json` exists at repo root (gitignored). The stale local
  project does NOT wire the google-services plugin, so the first debug APK has
  no FCM push. A fresh prebuild may wire it (verify).
- The **debug** variant does not bundle JS — the APK expects a Metro dev server
  (`pnpm android` / `npx expo start`). For a standalone installable build, use
  `:app:assembleRelease`: the release buildType is already signed with the
  checked-in debug keystore (`android/app/debug.keystore` in the generated
  project), so no secrets are needed for internal testing.
- Gradle heap is `-Xmx2048m` (gradle.properties) — fits the 16GB Mac; close
  browser farms during builds.
- First full build ~12–15 min on the M5; incremental rebuilds are minutes.

## RESULT (2026-08-29): first Android debug APK BUILT and INSTALLED

`app-debug.apk` — 318 MB (4 ABIs, uncompressed native libs; normal for RN debug),
package `com.authorityone.app` vc1/1.0, minSdk 24, target/compileSdk 36 (platform
36 + NDK 27.1 auto-downloaded by AGP), debug-keystore signed (apksigner verified).
Installed clean via `adb install` on a Samsung SM-A066B (Galaxy A06).
Copied to `/Users/clawbob/authority-one-spike/authority-one-social-android-debug.apk`.
NOTE: the debug variant expects a Metro dev server (`pnpm android` / `npx expo
start`) to serve the JS bundle at launch — install works standalone, running the
app does not. `assembleRelease` (debug-keystore signed, JS bundled) is the
standalone hand-to-someone artifact.

## Failure log (so nobody re-hits these)

| # | Failure | Cause | Fix |
|---|---|---|---|
| 1 | `Could not find io.bitdrift:capture:0.17.26` | stale prebuild lacks the bitdrift plugin's Maven-repo edits | hand-applied plugin edits (or re-prebuild) |
| 2 | AAPT `resource color/iconBackground not found` (ic_launcher.xml) | stale prebuild lacks the adaptive-icon color resource | added `<color name="iconBackground">#F4F0E8</color>` (or re-prebuild) |
| 3 | Kotlin `Unresolved reference 'R'/'BuildConfig'` in MainActivity/MainApplication | sources are package `com.authorityone.app` but gradle namespace/applicationId said `com.authorityone` (half-migrated prebuild) | set namespace + applicationId to `com.authorityone.app` in app/build.gradle |
| 4 | javac `cannot find symbol com.authorityone.BuildConfig` in generated `ReactNativeApplicationEntryPoint.java` | `android/build/generated/autolinking/autolinking.json` cached the old packageName and is not invalidated by the namespace change | `rm -rf android/build/generated/autolinking android/app/build/generated/autolinking`, rebuild |

Build-watching gotcha: during `:app:buildCMakeDebug[*]` the Gradle log goes silent
for 10+ minutes and the daemon JVM sits near 0% CPU — the work is in child NDK
`clang` processes. Check `ps aux | grep clang` before declaring a hang. Full build
~22–27 min on the M5/16GB.

## Remaining to a first customer-testable Android build

1. Debug APK from this recipe → install on a device/emulator, smoke the parity
   doc's flagged items (GameRoom chat + keyboard, chess contrast, drawer nav).
2. Voice validation on-device: STT (SpeechRecognizer) + TTS — the merged
   `modules/expo-authority-voice` Android implementation has only ever passed
   its mocked contract tests.
3. Fresh `expo prebuild -p android` for a config-true build (right package id
   `com.authorityone.app`, "One" label, FCM wiring) — the recipe above.
4. Distribution: assembleRelease (debug-keystore-signed) for a standalone APK,
   or set up Play internal testing later.
