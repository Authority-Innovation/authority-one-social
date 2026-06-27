# Windmill brand-mark swap — report

**Date:** 2026-06-23 · **Branch:** `feat/authority-one-theme` (left **uncommitted**, no push, no deploy)
**Source art:** uploaded JPEG — black ink-brush **windmill** on cream/paper.

Replaced the leftover Bluesky butterfly **and** the interim varsity **"1"** mark with the
Authority One windmill across app icon, splash, and in-app logo surfaces.

## Brand decision (palette)
The mark is **black ink `#1A1511` on cream paper `#F4F0E8`**, matching the new paper theme in
`src/alf/themes-authority-one.ts` (light bg `#F4F0E8`, text `#1A1511`, dark bg `#110C09`).
This shifts the icon/splash **from the old brand orange (`#E8431F`) to paper/cream** so the mark is
coherent with the theme. Dark surfaces use a cream windmill on warm near-black `#110C09`.

Two forms of the mark are used, by surface:
- **Raster brush art** (full fidelity) → app icons, splash background images, favicon. Built by
  cutting the ink out of the photo (anti-aliased alpha), recoloring to `#1A1511`, square-padding,
  and compositing onto the paper backgrounds.
- **Vector path** (scales + takes a `fill`) → in-app SVG logos and the splash "bloom" animation.
  Auto-**traced** from the brush art with OpenCV contour tracing, normalized to a `0 0 64 64` grid,
  stored once in `src/lib/windmillPath.ts` and imported everywhere.

## EXISTS-vs-changed map

### App icon
| Path | Existed? | Action | Result |
|---|---|---|---|
| `assets/app-icons/ios_icon_default_next.png` | yes (orange + "1", 1024² RGB) | **replaced** | 1024² **RGB, no alpha**, cream bg, black windmill, ~72% centered (iOS-safe) |
| `assets/app-icons/android_icon_default_next.png` | yes (1024²) | **replaced** | 1024² opaque, cream bg, black windmill |
| `assets/icon-android-foreground.png` | yes (white "1" on transparent, 1024²) | **replaced** | 1024² transparent, black windmill in adaptive **safe zone** (~56%) |
| `assets/icon-android-monochrome.png` | yes | **replaced** | 1024² white windmill silhouette on transparent (themed-icon channel) |
| `app.config.js` → `ios.icon` / `IOS_ICON_FILE` | yes | unchanged path | still points at `ios_icon_default_next.png` |
| `app.config.js` → `android.adaptiveIcon.backgroundColor` | `#E8431F` | **changed** | `#F4F0E8` (cream, so black foreground reads) |

### Splash
| Path | Existed? | Action | Result |
|---|---|---|---|
| `assets/splash/splash.png` | yes (orange full-screen + white "1", 1290×2796) | **replaced** | 1290×2796 RGB, **cream** bg, black windmill centered |
| `assets/splash/splash-dark.png` | yes | **replaced** | 1290×2796 RGB, **dark `#110C09`** bg, **cream** windmill |
| `assets/splash/android-splash-logo-white.png` | yes (white "1", 306²) | **replaced** | 306² transparent, **black** windmill (now shown on cream android bg) |
| `assets/splash/android-splash-logo-dark.png` | **no** | **created** | 306² transparent, **cream** windmill (for android dark splash) |
| `app.config.js` → `expo-splash-screen` backgrounds | orange `#E8431F`/`#7A1E0C` | **changed** | iOS+android light `#F4F0E8`, dark `#110C09`; android dark image → new dark logo |
| `src/Splash.tsx` (native **bloom**/wipe Logo) | yes — **Bluesky butterfly path** | **replaced** | windmill vector; `logoBg` now cream/dark to match the splash images; animation kept |
| `src/Splash.web.tsx` (web fade splash) | yes — orange "1" tile | **replaced** | cream "paper" tile + black windmill |
| `web/index.html` (static pre-React splash) | yes — orange "1" tile | **replaced** | cream tile + black windmill (no flash of old mark) |

### In-app logo (SVG, transparent strokes per brief)
| Path | Existed? | Action | Result |
|---|---|---|---|
| `src/lib/windmillPath.ts` | **no** | **created** | single source of truth: `WINDMILL_PATH` + `WINDMILL_VIEWBOX` |
| `src/components/icons/Logo.tsx` | yes (`Mark`/`Full`, "1") | **changed** | `Mark` + `Full` now draw the windmill (transparent, takes `fill`) |
| `src/view/icons/Logo.tsx` | yes (orange tile + "1") | **changed** | tile removed → windmill strokes on transparent, theme `fill` |
| `src/view/icons/Logomark.tsx` | yes (tile + "1") | **changed** | windmill strokes on transparent |
| `src/view/icons/LogomarkWithType.tsx` | yes (tile + "1" + "One") | **changed** | windmill (scaled into the mark slot) + "One" wordmark |

### iOS under-icon name (separate request)
| Path | Action | Result |
|---|---|---|
| `app.config.js` → `ios.infoPlist.CFBundleDisplayName` | **added** | `'a.One'` (home-screen label only). App Store `name` (`Authority-One`), `bundleIdentifier`, and `CFBundleSpokenName` left untouched. |

## Notes / follow-ups

**(a) Animated splash + SVG trace — DONE, with one caveat.**
The native bloom in `src/Splash.tsx` needed a vector to animate; it now uses the auto-traced
windmill path, so the reveal animation is **kept** (no fallback to static). The web splash already
used a gentle fade and now shows the windmill tile. Caveat: the original butterfly was a fairly
solid shape; the windmill is **open** (lots of negative space). The bloom grows the mark to ~500×
while the wrapper fades out simultaneously, so any momentary gap at screen-center is covered by the
fade — **but this should be eyeballed once on a real device.** If a hole is ever visible, the fix is
a one-liner (a solid backing `Rect` behind the windmill in the bloom `Logo`, or revert that screen
to the gentle fade). Optional polish: the trace is a clean machine trace of the brush silhouette; a
hand-refined SVG (smoother brush edges) can drop straight into `src/lib/windmillPath.ts` with **zero**
call-site changes.

**(b) Needs the next native build (iOS build 6) — NOT an OTA push.**
App icons and the native splash are baked into the binary at build time, so they will **not** appear
via an over-the-air update — they require a fresh native iOS build (build 6) / TestFlight upload. The
in-app SVG logos and `web/index.html`/`Splash.web.tsx` changes *do* ship via web/JS, but the icon and
launch screen do not.

**(c) `CFBundleDisplayName: 'a.One'` rejection fallback.**
If Apple rejects the under-icon name at upload with **ITMS-90129** (name already taken), it's a
one-line swap in `app.config.js` to try a different label.

## Verification
- **Typecheck** (`tsc --noEmit` via `tsconfig.check.json`): all touched files compile clean. The only
  8 `error TS` lines are pre-existing and live entirely in `src/lib/agent-runtime/__tests__/`
  (test-mock typings) — none in any file changed here.
- **Image audit:** iOS icon confirmed **RGB / no alpha** (App Store requirement); all sizes/dimensions
  preserved vs. the assets they replace; new dark android logo matches `306²` sibling.
- **No leftovers:** no remaining references to the butterfly path or the old "1" numeral in `src/` or
  `web/index.html`.
- `app.config.js` passes `node --check`.

## Not touched
- `src/view/com/auth/SplashScreen.tsx` / `.web.tsx` (auth landing screen) — already modified by the
  theme branch before this work; they render the in-app `Logo`, so they pick up the windmill
  automatically. Left as the branch had them.
- `ios.buildNumber` and any release/version fields — left as-is (no deploy).
- Wordmark text components (`Logotype`, etc.) — these are the "One" word, not the mark.
