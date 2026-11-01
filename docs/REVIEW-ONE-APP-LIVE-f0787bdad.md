# Review: One app Live mode delta, cd5aab174..f0787bdad

Task d8f8f16e. Independent, read-only review of `fix/agent-live-review-2026-11-01` @ f0787bdad. No
device run, no deploy, no EAS, no TestFlight, no live system touched. The feature branch was not changed.

## Verdict: CLEAN for Dev build 42 (no BLOCKER, no HIGH)

The swipe fix holds in the code. No exit path skips `/end` silently. Two MEDIUM and three LOW findings
are new or sharpened by this delta; none blocks the build under the stated rule.

The two MEDIUMs, because the orchestrator may want to rule on them before the build:

- **H1: a push over a live session whose `/end` fails tells nobody.** `/end` goes out and is retried,
  but after it gives up there is no toast. The failed-end panel only exists behind the pushed screen,
  and if that screen later unmounts, the toast is suppressed as "already seen".
- **H2: while `/end` is out and not answering, the owner now has no exit at all.** This is the earlier
  G7, raised from LOW. The delta removed the drawer, the tab bar and the swipe, which were the escapes.

Three answers differ from what the brief expected:

- **The push does not call `/end` before navigating.** It calls it in reaction to the blur, after the
  navigation has committed. It always ends the session, so this is not the HIGH the brief describes.
- **The drawer and tab bar do not come back when the session ends.** They come back when the screen
  loses focus or unmounts. An exit control is always on screen, so the owner is not stuck on a failed end.
- **The simulator run does not show a push ending a session, or the stage's End button working.** It
  covers the swipes and Cancel only.

| # | Check | Result |
| --- | --- | --- |
| 1 | Back swipe off, open and ending | CLEAN in code and on the simulator. Device NOT VERIFIED |
| 2 | Push ends the session | CLEAN (`/end` always sent, owner's bearer). FINDING, MEDIUM (H1, `index.tsx:212-216`). Order: after the navigation. Sim and device NOT VERIFIED |
| 3 | No drawer swipe, no tab bar | CLEAN for the tab bar. FINDING, LOW (H3, `index.tsx:201-206`): drawer flag overwritten on one path |
| 4 | Every exit path | CLEAN, nothing skips `/end` silently. FINDING, MEDIUM (H2, `index.tsx:189`, `:525`) |
| 5 | Simulator evidence | Swipe: shown. Cancel: shown. Push and stage End: NOT shown |
| 6 | Earlier items | F1, F2, F3 CLOSED. F6, F8, F10 PARTIAL. F11 OPEN. No regression |
| 7 | R2 contract | CLEAN, unchanged. No line touched in `api.ts` or `session.ts` |
| 8 | Flag gate | CLEAN: only `eas.json:103`. All new code is behind it |
| 9 | Tests | Live 266/266. Full suite: 3 suites fail, none Live |
| 10 | Typecheck | tsc clean, tsgo clean |
| 11 | Prebuild gate | NOT RUN (Windows). No native change in the range |
| 12 | Scope | CLEAN: 4 files |
| 13 | Device items | NOT VERIFIED |

**Prebuild gate: NOT RUN by me on Windows. The Mac runs `expo prebuild --platform ios --no-install --clean` flag off and on.**

**Flag gate: CLEAN. Only `development-live` sets it true (`eas.json:103`). No gate file changed; no new code runs outside the flag.**

## 1. The back swipe (2889012ac)

The only line that disables the gesture is `src/screens/AgentLive/index.tsx:191`:

| Line | Code |
| --- | --- |
| `index.tsx:178-181` | `open`: phase is not `idle`, `ended` or `failed` |
| `index.tsx:189` | `const blockGesture = open \|\| state.ending` |
| `index.tsx:190-192` | `navigation.setOptions({gestureEnabled: !blockGesture})` in an effect |

**Open and ending both covered.** `finish` sets the phase to `ended` first and `ending: true` straight
after (`session.ts:349-358`, `:305`), so `open` drops as `state.ending` rises, in one synchronous call.
The gesture comes back when `/end` answers, so the failed-end and ended panels can be swiped away.

**The option.** `gestureEnabled`, a native-stack screen option, set on the AgentLive route
(`src/Navigation.tsx:203-204`, which sets none itself). `fullScreenGestureEnabled: true` is still at
`src/Navigation.tsx:797`, unchanged. A `setOptions` value overrides it for this route.

**From the option to the recognizer** (react-native-screens 4.24.0, native-stack 7.15.0):

1. `NativeStackView.native.tsx:369-374` passes `gestureEnabled` to the screen on iOS.
2. `RNSScreenStack.mm:1192` returns NO when `!topScreen.gestureEnabled`, ahead of the iOS version split.
3. So the iOS 26 content-pop recognizer (`:1209`, delegate set at `:417`), the pan recognizer (`:1205`,
   `:1219`) and the edge recognizer all stop there.

The commit message and report name `gestureRecognizerShouldBegin` (`:882`). The check is actually in
`gestureRecognizer:shouldReceivePressOrTouchEvent:` (`:1179`). Same effect, wrong name.

**Backstops.** `usePreventRemove` (`index.tsx:182-184`) still turns a programmatic back into End. If the
screen does go, the unmount sends `/end` (`:145-149`). The effect runs after commit, so there is a window
of one commit where a session is open and the gesture is on. Those backstops cover it.

Mutations: `blockGesture = open` and `blockGesture = false` each turn `AgentLive.test.tsx` "the back
swipe is off..." red. Reverted.

## 2. A push over a live session (7e014963d)

**Handler:** `index.tsx:210-219`, a `blur` listener. **Line:** `:215`, `void controller?.end()`.

**It calls `/end`:** `end()` (`session.ts:908`), `finish` (`:340`, `:358`), `endOnRuntime` (`:304`),
`api.endLiveSession({sid, auth: s.auth})` (`:308`).

**With the owner's bearer, captured at start:** `captureLiveAuth` at `session.ts:721`, pinned on the session
at `:747`. `bearerFor` (`api.ts:279-287`) uses a fresher token only while the account is still that owner.
A throwaway probe confirmed the `/end` carries an Authorization header. No value was printed.

**Not before navigating.** The listener does not intercept the push. React Navigation emits `blur` from an
effect after the state has changed (`@react-navigation/core` `useFocusEvents.tsx`), so `/end` follows the
navigation. Nothing can navigate without ending, which is the HIGH condition, so I do not raise it, but
the order is not what the brief asked for.

**The mic.** `finish` also leaves the room (`session.ts:359`), and a probe saw one `disconnect`. The mic
stops at once, whether or not `/end` succeeds.

**Does the event really fire?** The suite mocks the navigation object and calls the listener directly
(`AgentLive.test.tsx:909`), so it cannot show this. I ran a throwaway test with the real
`@react-navigation/core` and routers, a tab navigator over nested stacks:

| Action | Events seen on the Live route |
| --- | --- |
| Push another screen in the same stack | `blur` fires |
| Navigate to another tab | `blur` fires (the parent's blur reaches the nested focused route) |
| Back to Live | Focus effect re-runs: drawer off again |

**On return:** the panel shows the end, with Done. A pop that would remove the route is a `beforeRemove`,
already covered by `usePreventRemove`.

Mutation: removing `:215` turns the blur test red. Reverted.

See H1 for the failure case.

## 3. No drawer swipe and no tab bar (7e014963d)

| What | Line | How |
| --- | --- | --- |
| Tab bar | `index.tsx:199` | `useEnableMinimalShellModeForScreen()`. Slides out and takes no touches: `useMinimalShellTransform.ts:15-24`, applied at `view/shell/bottom-bar/BottomBar.tsx:161` |
| Drawer swipe | `index.tsx:200-206` | `setDrawerSwipeDisabled(true)` on focus, `false` on cleanup. Read at `view/shell/index.tsx:149`, gesture failed at `:194` |

**When they come back.** Both are scoped to focus, not to the session (`index.tsx:204`,
`state/shell/minimal-mode.tsx:113-120`). They stay off on the ended and failed panels and return when the
owner leaves, or when something pushes over the screen.

**The owner is not stuck on a failed end.** Exits on each panel:

| Panel | Exit | Line |
| --- | --- | --- |
| Ended or failed | Done, and the swipe is back on | `index.tsx:525-540`, `:191` |
| Failed end | Try again, Leave anyway, and the swipe | `index.tsx:500-509`, `:525-540` |
| Binding failed to load | Done | `index.tsx:221-227` |
| Idle or starting | Cancel | `index.tsx:238`, `:367` |
| Reuse | Not now | `index.tsx:246`, `:411` |
| Consent | Cancel | `index.tsx:255` |
| Stage | End | `index.tsx:698-707` |
| Not owned, flag off, Android | Not in `LiveSession`, so the shell is untouched | `index.tsx:68`, `:76-79` |

The exception is the window while `/end` is unanswered: H2.

See H3 for the one path where the drawer flag does not hold.

## 4. Every exit path

| Exit | Result | Line |
| --- | --- | --- |
| End button | `/end`, "Ending…", then leaves. A failure stays on screen | `index.tsx:703`, `:158-165` |
| Consent Cancel | Same | `index.tsx:255` |
| Cancel while starting | Same. `/end` goes when the runtime answers | `index.tsx:238`, `session.ts:754-759` |
| Reuse, Not now | No `/end`, by design: it may be live on another device | `index.tsx:246`, `session.ts:918` |
| Push or tab change | `/end` from blur. Failure not shown off-screen: H1 | `index.tsx:212-216` |
| Back gesture | Off. If reached anyway: End, or the unmount's `/end` | `index.tsx:191`, `:182-184`, `:145-149` |
| Done while ending | No Done is rendered | `index.tsx:525` |
| Leave anyway | Leaves after a visible warning. Sign-out re-sends | `index.tsx:490-499`, `session.ts:749-751` |
| Sign-out and account switch | Hook, then unmount. A give-up shows the toast | `state/session/index.tsx:197`, `:236`, `:275`; `session.ts:749-751`, `:323` |
| Login | Same hook, after the login succeeds | `state/session/index.tsx:174` |
| Unmount | `/end`, toast on a give-up | `index.tsx:145-149` |
| App kill | Cannot send. The session's time limit covers it | Unchanged |

**No exit skips `/end` silently.** `state/session/index.tsx` is not in the range.

## 5. Simulator evidence (f0787bdad)

File: `src/features/agentLive/REPORT-review-fix-2026-11-01.md:185-213`. The brief calls this a docs commit;
that is right, the commit touches this file only.

Setup, `:187-191`: "iPhone 17 Pro, iOS 26.5, Xcode 27.1, Release build with Live on", "a mock runtime
serving the runtime's REAL `handleLive`", "`/end` held 8 s".

| Question | Shown? | Quote |
| --- | --- | --- |
| Swipe blocked | **Yes** | `:207-208`: "A full-screen swipe and an edge swipe on an open session leave it in place with no `/end`" |
| Swipe while ending blocked | **Yes** | `:209`: "a swipe during "Ending…" leaves it in place" |
| One `/end`, screen waits | **Yes**, on Cancel | `:210`: "the screen goes only after `/end` answers. Mock log: one `/end` per session, after Cancel." |
| Push ends the session | **No** | Only `:199-200`: "blur ends an open session", listed as part of the fix. No run is described |
| End still works | **Not End. Cancel only** | `:208`: "Cancel shows "Ending…" with no Done" |

The report's own "not verified" list (`:212-213`) leaves out the push and the End button, so a reader could
take them as covered. "An open session" also reads as the consent sheet, since run 1 names that screen and
Cancel is its control, and no LiveKit server is described; so a connected stage was probably not driven.
I cannot confirm that from the text.

**Not covered by the sim run:**

- the physical swipe on a real device
- any iOS below 26 (the pan recognizer path)
- the lock screen and background
- a phone call or other interruption
- a push or tab change over a session
- the stage's End button, or a session with real media
- `/end` failing or never answering (it was held 8 s, then answered)

The XCUITest target and the stack were removed afterwards (`:192`), so I cannot re-run this. I take the report
as stated. The source trace in section 1 agrees with it.

## 6. Earlier items after the delta

`session.ts`, `api.ts` and `rejoin.ts` have no diff in this range, so every `session.ts` line from the
cd5aab174 report still stands. `index.tsx` lines moved; the current ones are below.

| Id | Status | Where | Note |
| --- | --- | --- | --- |
| F1 | **CLOSED** in code, swipe on simulator. Device NOT VERIFIED | `index.tsx:145-149`, `:182-192`, `:525` | The iOS 26 swipe the earlier source trace could not settle really did leave the screen (report `:201-204`). Now blocked |
| F2 | **CLOSED** | `session.ts:487-496` | Unchanged. G6 (no test holds the carry) still open |
| F3 | **CLOSED** | `session.ts:657-679` | Unchanged |
| F6 | **PARTIAL** | `session.ts:507`, `:625` | Unchanged. G2, G3 |
| F8 | **PARTIAL** | `session.ts:677`; `index.tsx:564-575`, `:657-663` | Unchanged. The switch still has no `agent_waiting` case, so the notice renders nothing. `REPORT...:174` still claims copy that does not exist |
| F10 | **PARTIAL** | `REPORT-review-fix-2026-11-01.md:130` | Unchanged. Still says the app ends with "removed" |
| F11 | **OPEN** | `sessionHook.test.ts` | Unchanged |

The LOWs at `session.ts:493`, `:625`, `:659` are unchanged. G5 and G8 are unchanged: G8's leave effect is now
`index.tsx:170-172` and `:182`. G7 is raised: H2.

## 7. R2 contract: CLEAN, unchanged

`git diff cd5aab174..f0787bdad` on `api.ts` and `session.ts` is empty. **The delta touches no line in either.**

## 8. Flag gate: CLEAN

- `eas.json:103` is the only `"true"`. Lines 16, 45, 74, 130, 163, 196, 228, 261 are `"false"`.
- `eas.json`, `plugins/`, `app.config.js`, `metro.config.js`, `react-native.config.js`, `package.json`,
  `ios/`, `android/`, `modules/` and `src/Navigation.tsx`: no diff in the range.
- `index.tsx:68` returns the Notice when the flag is off or on Android. Every new line is inside
  `LiveSession`, or in `ConsentSheet`, which only `LiveSession` renders.

**No new code outside the flag.** The new imports (`useFocusEffect`, `#/state/shell`,
`react-native-safe-area-context`) already exist in the app and do nothing until those components render.

## 9. Findings

| Id | Severity | Where | What |
| --- | --- | --- | --- |
| H1 | **MEDIUM** | `index.tsx:147`, `:212-216`; `session.ts:323`, `:928-931` | **A failed `/end` after a push is shown to nobody.** See below |
| H2 | **MEDIUM** | `index.tsx:189`, `:199-206`, `:525`; `api.ts` `post` | **No exit while `/end` hangs.** G7 raised. See below |
| H3 | LOW | `index.tsx:201-206`; `view/com/pager/Pager.tsx:79-87` | **The drawer flag can be overwritten.** See below |
| H4 | LOW | `index.tsx:190-192` | **The gesture effect has no cleanup.** If `LiveSession` unmounts while the route stays (the agent drops out of `useOwnedAgent`, `:76-79`), `gestureEnabled: false` stays on the Notice screen. The tab bar is back, so there is an exit. From reading: my probe could not render the Notice outside the test wrapper |
| H5 | LOW | `index.tsx:196-198`, `:175-176`; commit 7e014963d | **Stale comments.** `:196-198` says "the only way back is the native back swipe, which usePreventRemove turns into End". The next commit switched that swipe off, and `:185-188` says the opposite |

### H1, in detail

Throwaway probe in the screen's own harness: `goLive`, `/end` set to 503 four times, then `blur`:

```
ends 4, toast after give-up 0, panel true, retry true, done true, disconnects 1
after unmount: toast 0
```

- `endOnRuntime` only toasts when `detached` (`session.ts:323`). A blurred screen is not detached.
- The panel renders, but behind the pushed screen. The owner sees it only by coming back.
- If the screen unmounts later, `index.tsx:147` passes `failureSeen: latest.current.endFailed`, which is
  true. That flag means "the owner saw the panel", which is not true here, so `session.ts:930` stays quiet too.

**What limits it:** the mic is already off, as the room is left regardless. Coming back shows Try again.
Sign-out re-sends `/end`. The session's time limit applies. It needs a push and a failed `/end` together.

**Why not HIGH:** `/end` is sent, so nothing "skips /end". **Why not LOW:** the agent may keep running, with
the owner told nothing, on the path this delta added. A fix would treat blurred as not seen: toast on a
give-up while blurred, and pass `failureSeen` only when the panel was on screen.

### H2, in detail

While `state.ending` holds: no Done (`index.tsx:525`), no swipe (`:189`), no drawer and no tab bar
(`:199-206`). "Ending the session…" shows with no control. Before this delta, the drawer and tab bar could
still walk away, so **the delta made G7 worse**.

`api.ts` has no timeout, `AbortController` or signal. `endOnRuntime` makes up to 4 attempts plus 11 s of
waits (`session.ts:204`, `:307-319`). RN passes the XHR's timeout through (`RCTNetworking.mm:326`) and
nothing here sets one. I did not establish what iOS does with that. If the usual 60 s applies, the worst case
is about 4 minutes; **NOT VERIFIED**.

**What limits it:** it needs a server that accepts and never answers. A fast failure reaches the failed-end
panel with exits. The mic is already off. Force-quit works. A fix would bound the wait, or show Leave anyway
after some seconds.

### H3, in detail

Real `@react-navigation/core`, Live pushed directly over a screen with Pager's focus effect:

```
push Live over Under: live:disable->true | pager:cleanup->false
```

A child's mount effect runs before the navigator's blur event, so Pager's cleanup
(`Pager.tsx:84`, `setDrawerSwipeDisabled(false)`) lands last. The flag is a plain boolean, unlike minimal mode,
which counts (`minimal-mode.tsx:46-58`), so the tab bar is not affected.

- **Reached by:** a deep link to `/agents/:agent/live` while Home, Notifications, Profile, Search or another
  Pager screen is focused. **Not reached by** the normal path, as AgentHub has no Pager.
- **The other gate:** `view/shell/index.tsx:149` also requires being at a tab root. Simulator run 1 saw the
  drawer open on this screen regardless (report `:196`), so I do not count that gate as cover. I did not
  establish why it let the drawer through.
- **What limits it:** choosing a drawer item navigates, which blurs, which sends `/end`. So nothing is
  skipped silently; the session just ends unexpectedly.

The probe used a stand-in with Pager's effect, not the real Pager or drawer. On a device: NOT VERIFIED.

## 10. Tests

Node 24.14.0 (`package.json` asks for >=24.15.0). `pnpm` is not on this machine's PATH, so I ran the Jest, tsc
and tsgo binaries directly. Checkout is CRLF.

**Live suites: 17 suites, 266 tests, all passed.** 243 at 8c01c1e11, 262 at cd5aab174, +4 here. Same pattern as
the last review: `features/agentLive|screens/AgentLive|iosArchiveGuard|routeTable|brandConfig|flags`.

**Full suite, `NODE_ENV=test jest --forceExit --maxWorkers=4`: 197 of 200 suites passed; 2590 tests passed, 2
failed, 28 todo, of 2620.** Exit 1. cd5aab174 was 2586 passed with the same 2 failed and the same 3 suites.
None is a Live file.

| Failed suite | Cause | Evidence |
| --- | --- | --- |
| `src/lib/lexicon/__tests__/lexicon.test.ts` | **Still fails.** group/post.json hash, Communities, not Live | Expected `678fa536…`, received `79c0a46b…` |
| `plugins/uiSceneLifecycle/__tests__/withUISceneLifecycle.test.js` | CRLF checkout | Passes on LF |
| `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts` | CRLF checkout | Passes on LF |

The 2 CRLF suites on LF: 2 suites, 17 tests, passed, with a temporary conversion that was restored.
The full-suite figures above are the CRLF run.

**The 4 new tests' limit:** they mock the navigation object, `useFocusEffect` and `#/state/shell`. They hold the
screen's logic (each mutation below goes red), not the real navigator. The real behaviour comes from my
probes and the simulator.

| Mutation (each reverted) | Result |
| --- | --- |
| `blockGesture = open` | Red: "the back swipe is off" |
| `blockGesture = false` | Red: same |
| Remove `controller?.end()` from the blur | Red: "something pushed over a live session" |
| `setDrawerSwipeDisabled(false)` on focus | Red: "Live is immersive" |

ESLint on `index.tsx` and `ConsentSheet.tsx`: exit 0. Not run on the test file or the rest of the repo.

## 11. Typecheck

- `tsc --noEmit -p tsconfig.communities.json`: exit 0, no output.
- `tsgo -p tsconfig.check.json`: exit 0, no output.

## 12. Prebuild gate

**Prebuild gate: NOT RUN by me on Windows. The Mac runs `expo prebuild --platform ios --no-install --clean` flag off and on.**

The delta adds no native change, by the file list below: nothing under `ios/`, `android/`, `modules/` or
`plugins/`, and no `package.json` or config. The XCUITest target was only in the generated `ios/` project on
the Mac and is not in the range.

## 13. Scope: CLEAN

Every file changed in cd5aab174..f0787bdad (4 files, +183 / -9, matching the brief):

| File | +/- | Area |
| --- | --- | --- |
| `src/screens/AgentLive/index.tsx` | 47 | Live screen |
| `src/screens/AgentLive/components/ConsentSheet.tsx` | 10 | Live screen: safe-area padding only, not in the brief's list, named in commit 7e014963d |
| `src/screens/AgentLive/__tests__/AgentLive.test.tsx` | 105 | Live screen tests |
| `src/features/agentLive/REPORT-review-fix-2026-11-01.md` | 30 | Docs, in the Live feature directory |

**No file is outside the Live screen and feature.** `src/Navigation.tsx` and `session.ts` are not changed:
the fix is entirely in the screen, using the existing `#/state/shell` hooks.

## 14. Device-only items: NOT VERIFIED

No device run. NOT VERIFIED: the physical swipe on a real device, permissions, background and lock,
interruptions, stage rendering, the iOS archive. Also a real push or deep link over a session, H2's real
timeout, and H3's drawer on a device. The Dev runtime having ac11bd0 is also still NOT VERIFIED, as
the cd5aab174 report says: build 42 needs it.

**What would settle the gaps,** on a `development-live` build on a device, connected to a real stage:

1. Swipe from the edge and mid-screen, live and during "Ending…". Expect nothing to move, and no `/end`.
2. Tap End on the stage. Expect "Ending…", the screen goes, and one `/end` in the Dev runtime log.
3. Tap a notification or deep link while live. Expect one `/end`; on return, the ended panel with Done.
4. Repeat 3 with the network off after going live. This shows H1: no warning until you come back.
5. Deep link to Live while on Home, then swipe right. This settles H3.

## How this was run

For anyone auditing the run:

- This worktree started at 571924785, not the target, and had no `node_modules`. I created this branch from
  f0787bdad.
- `node_modules` was a junction to the f2caccaa worktree's, whose `pnpm-lock.yaml` and `package.json` hashes
  match f0787bdad's. Nothing there was changed. The junction was removed afterwards.
- 41 compiled catalogs (`messages.ts`, git-ignored) were copied from that worktree for the runs, then deleted.
  No intl command was run.
- Two throwaway probe test files, the mutations and the LF conversion were removed or reverted. `src` matched
  f0787bdad afterwards. Logs stayed inside this worktree and were deleted. Only this report is committed.
