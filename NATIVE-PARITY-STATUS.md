# Native Parity Status — iOS/Android vs Web

Assessed 2026-07-20 against main `fbbab44c2`. Read-only assessment; nothing was merged,
pushed, or built.

## TL;DR

- `feat/native-parity` is **already fully merged into main** (landed ~2026-07-11). There is
  nothing to merge. The branch and its stale "12 commits ahead, never pushed" reputation can
  be retired; it is safe to delete locally and on the `private` remote.
- The real gap is **release lag, not missing code**: 27 commits have landed on main since the
  last TestFlight build bump (b31, cut 2026-07-15) and none have run on a device. That span
  contains the entire GameRoom, the agent-first nav redesign, Messages wiring, the asset
  gallery, both feed fixes, and the KB delete/toggle.
- Per-feature audit verdict: **everything is native-ready except one guaranteed break** —
  the GameRoom chat composer has no keyboard avoidance, so on iOS/Android the soft keyboard
  covers the input. Fix is a known in-repo pattern, a few hours.
- Fastest honest path: fix the ChatLane keyboard, bump the build number, cut TestFlight from
  main, smoke-test three flagged items on device. Roughly **half a day to a build in
  Elliott's hands**.

---

## 1. Branch state: `feat/native-parity`

| Fact | Value |
|---|---|
| Tip | `9365149de` (2026-07-11, "chore(billing): import-order lint autofix") |
| Relation to main | Tip **is the merge-base** — every commit is an ancestor of main; main is 48 commits ahead, branch contributes 0 |
| Pushed? | Yes — `private/feat/native-parity` is identical (0/0 divergence) |
| Merge risk | None. There is nothing to merge. |

Its content is all in main's history: the iOS billing gate (`c673b989c`), the native
knowledge-base file picker (`d0a23123a`), the eas.json EXPO_PUBLIC_* config mirror
(`3ad8703ea`), and the merged feature branches (sms-groups-chats, video-post-as-current-
profile, group-read-mirror-ui). The prior "merge it to close the gap" framing is obsolete —
that merge already happened around 2026-07-11 and subsequent TestFlight builds (b27–b31)
included it.

**Action:** delete the branch (local + `private` remote) to prevent future confusion.
(Not done in this assessment.)

## 2. The real gap: 27 commits since TestFlight b31

Last build bump: `ff48c1d90` (30→31, 2026-07-15). Everything after it is web-verified only:

- **GameRoom** (11 commits, 2026-07-19/20): tic-tac-toe, checkers, chess, Connect Four
  boards; story/mystery scene pane; live WebSocket game client; no-login guest `?t=` mode;
  launcher; rematch + series score; phone-layout and chess-contrast fixes.
- **Agent-first nav redesign** (`3c7cbbd51`), Messages tab rename + SMS mirror rows + unread
  rollup badges (`8bc4b46b7`), live conversations wiring (`980edb3ec`).
- **Agent asset gallery tab** (`e64490c43`).
- **Feed fixes**: dag-json blob-ref normalizer (`9d1586250`), persisted stale-feed fix
  (`591d61dd4`).
- **KB delete + enable/disable toggle** (`edd264c96`, `fbbab44c2`); KB PDF uploads
  (`79de8eaba`) landed just before b31 but pairs with these.
- Web-only / CI: deploy-web verify gate, SPA-fallback cache fixes, repo-transfer workflow
  retarget — irrelevant to native.

Main's tip is pushed and CI verify (typecheck + **full** Jest suite) is green on it. The
standalone Lint workflow failure is the known 51-error debt, already accounted for.

## 3. Per-feature native audit

Code was read, not guessed at. "Ready" = audited for web-only APIs and found clean.

| Feature | Verdict | Evidence / notes |
|---|---|---|
| GameRoom chat lane (all modes) | **BROKEN on native** | `src/screens/GameRoom/components/ChatLane.tsx:59-141` — composer is a plain flex child; no `KeyboardAvoidingView` / `useReanimatedKeyboardAnimation` / `KeyboardStickyView`. Keyboard covers input + Send on both phone and tablet layouts. Same bug class already fixed in `src/screens/AgentChat/index.tsx` (animated spacer) and `Messages` (`KeyboardStickyView`); `KeyboardProvider` is app-wide, GameRoom just doesn't consume it. **Fix: hours.** |
| GameRoom boards (TTT/checkers/chess/C4) | Ready | Pure `Pressable`/`View`/`Text`; no DOM, no CSS-only tricks; forced-capture/flash hints are `setTimeout`-based (`useFlashHint.ts`). |
| Chess piece contrast | **Degraded, verify on device** | `ChessBoard.tsx:34-61` — the crisp 8-direction outline ring is `web({textShadow:[…]})`; native gets a deliberate single `textShadowRadius:3` fallback. Both colors share glyph shapes, distinguished only by fill+halo, so legibility may suffer. Eyeball on device; stacked-Text outline fix if needed (hours). |
| Connect Four hover ghost | Ready (minor UX diff) | `onHoverIn/Out` no-ops on native but the same handler is wired to `onPressIn/Out` — ghost shows on touch-down. Cosmetic only. |
| Live WebSocket client | Ready | `liveGameClient.ts:353-358` uses the RN-global `WebSocket`; URL derived from `EXPO_PUBLIC_GAME_SERVER_URL ?? AGENT_RUNTIME_BASE_URL` — **no `window.location` anywhere**. Reconnect/backoff/chat-queue are plain JS timers. |
| Guest `?t=` mode | Code ready; **entry path untested** | The auth bypass is native-aware (`createNativeStackNavigatorWithAuth.tsx:129-144` waives login under `IS_NATIVE`; query params parse on native via `router.ts:49-54`). But an `https://app.authority-one.com/...` guest link only opens the app if associated-domains (iOS) / intent-filters (Android) are configured for that domain — an app-config/infra question, never exercised. If unconfigured, guest links fall through to the web app, which is acceptable. No GameRoom code change needed. |
| Launcher / rematch / series score | Ready | `createMatch.ts` is a bearer-token `fetch` POST + `navigation.navigate`; no `window.open`, no `navigator.clipboard`. Rematch rides the same wire contract. |
| GameRoom navigation entry | Ready | Registered as a common screen (`Navigation.tsx:224-227`) AND has Drawer entries in both signed-in and signed-out branches (`Drawer.tsx:302-303,716-728`). Web-only `web({maxHeight:'100dvh'})` / transform nudges are inert no-ops on native; layout split is `useWindowDimensions`-driven (wide ≥900 native). |
| Agent-first nav + Messages + badges | Ready | Both surfaces wired (the historical two-place gotcha is satisfied): `Drawer.tsx:653-728` AgentGrid + Chats/ForYou/GameRoom items, `desktop/LeftNav.tsx:397-412` web. Grid/badges pure RN. iOS app-icon badge explicitly implemented (`useAgentUnreadIconBadge.ts` → `expo-notifications setBadgeCountAsync`), mounted in the native shell. |
| Asset gallery tab | Ready | `expo-image`, `FlatList` with measured `numColumns`, lightbox via native `Dialog` bottom sheet (`Dialog.Handle`/`Close` exist in the native Dialog implementation). |
| Feed fixes (blob refs + stale cache) | Ready | Both in shared files. The persisted-cache fix (`react-query.tsx`) uses one persister path for both platforms — the `PERSIST_CACHE_GENERATION=2` buster busts the native MMKV cache too; **no separate native bump needed**. |
| KB delete / toggle / PDF | Ready | Pure RN screen (`Prompt.Basic`, `Toggle`, no Menu/Dialog web-isms). Native picker (`expo-document-picker`) reads bytes via XHR→Blob to handle `content://` URIs; upload is a raw-Blob `fetch` (same pattern as image upload) — no `FileReader`/`FormData`. PDFs ride the identical transport. |
| Approval-card resurrection fix | Ready | Pure shared decision logic in `approvals.ts`; no platform imports. |

## 4. TestFlight readiness checklist

| Item | Status |
|---|---|
| App points at OUR infra, not Bluesky | ✅ Structural since `0983f7ba5`: every default in `src/lib/constants.ts` / `src/env/common.ts` resolves to authority-one hosts; eas.json carries the full `EXPO_PUBLIC_*` env block in every profile. A missing `.env` can no longer silently read public Bluesky. **Caveat:** "fail-closed" = safe defaults, not a build-time crash — a true fail-loud assertion doesn't exist (small optional add). |
| Build config / native projects | ✅ `ios/` prebuilt (AuthorityOne.xcworkspace, Pods installed, prior archives in `ios/build`); `android/` prebuilt. |
| Signing / upload flow | ✅ Proven flow is **local headless xcodebuild archive + upload via Xcode's Apple-ID session** (not EAS; the `build-submit-ios.yml` workflow exists and is retargeted to Authority-Innovation but the local flow is what has shipped b21–b31). |
| Version / build number | ⚠️ `app.config.js` `buildNumber: '31'` — b31 was already cut 07-15, so a new build **needs 31→32**. ASC numbers have historically run ahead of the repo; confirm in App Store Connect before archiving. |
| CI safety | ✅ Cutting an iOS build does not touch the web deploy gate; but the build-number bump commit, when pushed to main, triggers deploy-web (verify job is green on tip, so low risk). |
| App Store review — billing | ✅ Gate is on main (`c673b989c`): Stripe Upgrade/Manage CTAs hidden on iOS, read-only "managed on the web app" note; screen still renders. StoreKit/IAP parity is an acknowledged separate track. Guideline 3.1.1 exposure is mitigated for TestFlight and reasonably for review. |
| Quality gates on tip | ✅ typecheck + full Jest green in CI on `fbbab44c2`; Lint failure = known 51-error debt. |

## 5. Android

- **Voice is confirmed as the one large outstanding lift, and it's already written:**
  `feat/android-voice-parity` = 3 commits, ~1,200 lines of Kotlin (SpeechRecognizer STT,
  TextToSpeech + clip player TTS, expo-module wiring, contract tests). Branch is 42 commits
  behind main but **test-merges cleanly** (verified in a scratch worktree, discarded).
- Remaining work is validation, not implementation: merge (clean), cut an Android build
  (EAS `testflight-android`/`production-apk` profile or local Gradle), verify STT/TTS on a
  device. Estimate: **1–3 days** dominated by device testing and the first Android build of
  this fork in a while, not code.
- Everything else in the audit above is Android-ready to the same degree as iOS (same shared
  code), with the same ChatLane keyboard break and the same guest-link intent-filter caveat.

## 6. Recommendation

**Path (b), minimal version: one focused fix, then cut the build.** Merging isn't part of
the picture (nothing to merge); the only thing that would be *visibly broken* on device is
GameRoom chat under the keyboard — and GameRoom is the flagship of this release span, so
shipping it typeable is worth the few hours.

### Must have before a usable TestFlight (≈ half a day)
1. **Fix ChatLane keyboard avoidance** — port the AgentChat animated-spacer pattern (or
   `KeyboardStickyView`) into `GameRoom/components/ChatLane.tsx`. (hours; the pattern,
   provider, and prior art are all in-repo)
2. **Bump buildNumber 31→32** in `app.config.js`, confirming against ASC first. (minutes)
3. **Cut the archive** via the proven local xcodebuild flow; upload. (mechanical)
4. **On-device smoke pass** of the three flagged items: chess piece legibility (native
   single-shadow fallback), GameRoom phone layout + chat, agent-first drawer nav + unread
   badges. (an hour)

### Ship-and-fix-after (nice to have)
5. Chess native halo upgrade if the device check says it's illegible. (hours)
6. Associated-domains / intent-filter config so guest `?t=` links open the app instead of
   the browser. Acceptable interim: guests land on web. (config + hours)
7. Optional true fail-loud env assertion (crash the build on missing AppView vars) if wanted
   beyond the current safe defaults. (hours)
8. **Android voice**: merge `feat/android-voice-parity` (clean), Android build, device
   validation. (1–3 days, mostly validation)
9. StoreKit/IAP parity for billing — separate track, not a TestFlight blocker.
10. Delete `feat/native-parity` (local + private remote) as housekeeping.

### Direct answer to "can we just cut from main as-is?"
Almost. A build from main today would work — nav, gallery, KB, feeds, boards, live games all
audited clean — except that **typing in GameRoom chat would be impossible on a phone**
(keyboard covers the composer), and that's the marquee feature of the last week. Spend the
~2–4 hours on the ChatLane fix first; everything else is safe to evaluate on the device.
