# One (Authority One) — de‑Bluesky + re‑identifier pass for first TestFlight

Scope: **config/code only, no deploy.** All social‑app functionality is intact — only
Bluesky *branding* was stripped and *identifiers* swapped. `app.config.js` is the Expo
source of truth, so `npx expo prebuild --clean -p ios` regenerates a correctly‑identified,
de‑Bluesky'd native project from these changes. `ios/` is git‑ignored, so it is not edited
directly — prebuild rebuilds it (this also re‑resolves the earlier `dm.mp3` / deployment‑target
issues).

Full project typecheck (`tsc --noEmit -p tsconfig.check.json`, covering `src` + `app.config.js`)
passes with **0 errors** after these changes.

---

## New identifiers & brand values

| Thing | Before | After |
|---|---|---|
| App display name | One *(already done)* | **One** |
| iOS bundle identifier | `xyz.blueskyweb.app` | **`com.authorityone.app`** *(changeable — must match the App ID you register under your Apple team)* |
| Android package | `xyz.blueskyweb.app` | `com.authorityone.app` |
| iOS `CFBundleSpokenName` | `Blue Sky` | `One` |
| App Group entitlement | `group.app.bsky` | **removed** (nothing depends on it once extensions are stripped) |
| Associated domains | `applinks:bsky.app`, `staging.bsky.app`, `appclips:bsky.app`, `appclips:go.bsky.app` | `applinks:authority-one.com` |
| Android intent‑filter host | `bsky.app` | `authority-one.com` |
| Brand color (`primaryColor`, adaptive‑icon bg, notification color, splash bg) | `#006AFF` / `#1185fe` blue | **`#E8431F`** (One orange) + `#7A1E0C` dark |

The bundle identifier is freely changeable: pick whatever you register as the App ID in your
Apple Developer account, and keep `app.config.js` `ios.bundleIdentifier` in sync.

---

## Every file changed

**Config (source of truth)**
- `app.config.js`
  - `ios.bundleIdentifier` → `com.authorityone.app`; `android.package` → `com.authorityone.app`
  - `CFBundleSpokenName` → `One`; contacts‑permission string → "One"
  - App Group entitlement (`group.app.bsky`) removed
  - `ASSOCIATED_DOMAINS` → `['applinks:authority-one.com']` (App Clip `appclips:` entries gone)
  - `primaryColor`, splash `backgroundColor`s, adaptive‑icon `backgroundColor`, notification `color` → One orange
  - iOS icon path simplified to a single PNG (`ios_icon_default_next.png`) — dropped the Apple Icon Composer `.icon` bundles (`ios_icon_default.icon` / `ios_icon_testflight.icon`, which held the Bluesky butterfly) for the first build
  - **Removed** the three extension config plugins (`shareExtension`, `notificationsExtension`, `starterPackAppClipExtension`) and the EAS `extra.eas.build.experimental.ios.appExtensions` block (Share‑with‑Bluesky, BlueskyNSE, BlueskyClip)

**Branding assets — replaced with on‑brand "One" placeholders** (orange `#E8431F` tile, black varsity "1" with white outline, matching the in‑app `src/view/icons/Logo.tsx` mark)
- `assets/app-icons/ios_icon_default_next.png` — iOS home‑screen / App Store icon (1024²)
- `assets/app-icons/android_icon_default_next.png` — Android icon (1024²)
- `assets/icon-android-foreground.png` — Android adaptive‑icon foreground (white "1", transparent)
- `assets/splash/splash.png` — iOS splash (orange, white "1")
- `assets/splash/splash-dark.png` — iOS dark splash (dark‑orange)
- `assets/splash/android-splash-logo-white.png` — Android splash logo (white "1")

**In‑app logo (leftover Bluesky butterfly)**
- `src/components/icons/Logo.tsx` — `Mark` and `Full` rewritten from the Bluesky butterfly/wordmark to the One varsity‑"1" mark + "One" wordmark (used by `PostThread/.../GrowthHack.tsx` and `ageAssurance/.../NoAccessScreen.tsx`)

**Bluesky text on the login/auth surfaces** ("the login screen still says Bluesky")
- `src/components/dialogs/ServerInput.tsx` — default‑provider tab label and copy "Bluesky" → "One"
- `src/view/com/auth/SplashScreen.tsx` — sign‑in / create‑account accessibility hints
- `src/view/com/auth/SplashScreen.web.tsx` — accessibility hints + footer links (repointed `bsky.social` → `authority-one.com`)

**WhisperKit drop**
- `modules/expo-authority-voice/ios/STT/WhisperKitTranscriber.swift` — code path removed (file left as a tombstone comment; the sandbox blocks hard‑delete via shell — see note below, safe to `git rm`)
- `modules/expo-authority-voice/ios/STT/AuthoritySpeechModule.swift` — `.whisperKit` branch no longer constructs the removed class; SpeechAnalyzer path + `#if canImport(WhisperKit)` guard kept so it compiles with or without the package
- `modules/expo-authority-voice/ios/ExpoAuthorityVoice.podspec` — description updated (no WhisperKit)

---

## Branding swapped vs. placeholder you must supply

**Swapped (working now):** the iOS/Android app icon, splash, adaptive‑icon foreground, and all
in‑app SVG logos (`src/view/icons/*` were already One; `src/components/icons/Logo.tsx` is now One too).

**Placeholders — drop final art at these exact paths** (the 6 generated PNGs above are clean,
on‑brand stand‑ins, not finished artwork). Overwrite in place; no config change needed. The iOS
icon must stay a 1024×1024 PNG with no alpha/transparency.

**Still Bluesky artwork, deliberately left (a feature, low‑visibility):** the alternate app‑icon
set behind the `@bsky.app/expo-dynamic-app-icon` plugin in `app.config.js` —
`assets/app-icons/ios_icon_legacy_*.png`, `ios_icon_core_*.png` and the `android_icon_*`
equivalents. These only appear in **Settings → App Icon**, not on the home screen. To fully
de‑brand, either replace those PNGs with One variants, or remove the `@bsky.app/expo-dynamic-app-icon`
plugin block (and the `AppIconSettings` entry point) to drop the icon‑switcher feature.

---

## Extensions removed (first TestFlight = one provisioning profile)

- **Share extension** (`Share-with-Bluesky`)
- **Notification Service Extension** (`BlueskyNSE`)
- **App Clip** (`BlueskyClip`)

Removed from both the `plugins` array and the EAS `appExtensions` block in `app.config.js`. The
exact lines to restore each are left as comments in `app.config.js`. Re‑adding any extension that
needs shared storage also means re‑adding an App Group (`group.com.authorityone.app`).

## WhisperKit — confirmed dropped

WhisperKit was **never a declared dependency** in the repo; it was added manually in Xcode via SPM
(the source of the `Ld`/linkage errors). `prebuild --clean` wipes manually‑added SPM packages, so it
stays gone. All Swift usage was already behind `#if canImport(WhisperKit)`; the transcriber file is
removed and its construction site neutralized. On the owner's iPhone 17 Pro Max (iOS 26), STT uses
Apple **SpeechAnalyzer** natively; on iOS < 26 STT now reports `unavailable`. TTS is unchanged.

---

## Known residual "Bluesky" references (NOT blockers for the iOS first build)

- **Locale catalogs** `src/locale/locales/*/messages.ts` and many deep feature‑dialog strings still
  contain "Bluesky". Scrubbing all ~40 locales is out of scope for a config/code first‑build pass and
  risks i18n breakage. English renders the changed source strings via lingui fallback. Find the rest:
  `grep -rn "Bluesky" src --include=*.tsx --include=*.ts | grep -v locale/locales`
- **Android‑only / web‑only / test** ids: `expo-receive-android-intents` (hardcoded Android package),
  `bskyweb/` + `bskylink/` web services, `src/screens/Settings/NotificationSettings/index.tsx` value,
  starter‑pack Play Store URLs. None affect the iOS bundle identity.
- **EAS‑only fields** in `app.config.js`: `owner: 'blueskysocial'` and `extra.eas.projectId` point at
  Bluesky's EAS account. Irrelevant to a local Xcode build/archive; update them only if you ever build
  via EAS.
- **OTA updates** `updates.url: 'https://updates.bsky.app/manifest'` is only active when
  `EXPO_PUBLIC_ENV` is `testflight`/`production`. A manual Xcode Archive does **not** set that, so
  updates stay disabled. Do **not** set `EXPO_PUBLIC_ENV=testflight` when archiving locally (or repoint
  the updates URL first).

Note: the `git rm` for `WhisperKitTranscriber.swift` — the shell here couldn't delete it (mount is
read‑only to `rm`), so it's a tombstone comment. Run `git rm modules/expo-authority-voice/ios/STT/WhisperKitTranscriber.swift`
locally if you want it gone entirely; leaving the empty file also compiles fine.

---

## Owner runbook (you run these — nothing was deployed)

Requires a **paid Apple Developer Program membership** ($99/yr) and creating the app record in
App Store Connect. TestFlight is owner‑only from here.

1. **Regenerate the native project** from the Expo config:
   ```
   npx expo prebuild --clean -p ios
   ```
2. **Install pods:**
   ```
   npx pod-install
   ```
3. **Open the workspace** (`ios/One.xcworkspace`) in Xcode.
4. **Set your Team:** select the app target → *Signing & Capabilities* → choose your Apple Developer
   **Team**; let Xcode manage signing. Confirm the bundle id is `com.authorityone.app` (or whatever
   App ID you registered). There should be **one** target needing a profile (extensions are gone).
5. **Create the app record** in **App Store Connect** (apps → +) using the same bundle id.
6. **Build to your device** (iPhone 17 Pro Max) first to smoke‑test.
7. **Archive:** *Product ▸ Archive* (scheme set to the app, "Any iOS Device").
8. **Distribute:** Organizer → *Distribute App* → App Store Connect → **Upload**.
9. **TestFlight:** once processed in App Store Connect, add yourself as a tester and install via the
   TestFlight app.

If signing complains about App Groups or associated domains, confirm the App Group capability is
**off** (we removed it) and that Associated Domains is either empty or `applinks:authority-one.com`
with no Bluesky entries.
