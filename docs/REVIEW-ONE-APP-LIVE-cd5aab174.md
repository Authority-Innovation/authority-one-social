# Review: One app Live mode fix pass, 8c01c1e11..cd5aab174

Task 30f293f4. Independent, read-only re-review of `fix/agent-live-review-2026-11-01` @
cd5aab174, against review f2caccaa (report commit 6b0cec974). No device run, no deploy, no EAS,
no TestFlight, no live system touched. The feature branch was not changed.

## Verdict: CLEAN for Dev build 42 (no BLOCKER, no HIGH)

F1 HIGH is closed in the code, and F2 and F3 MEDIUM are closed. Eight new or residual LOW items
are listed below; none blocks the build.

Two things remain open outside this verdict:

- **The swipe-back gesture is NOT VERIFIED on a device.** F1 is closed from the code, the iOS
  library source and a test against the real navigation hook. Section 1 says what would settle it.
- **Build 42 needs the runtime exchange (ac11bd0) on the Dev worker.** ac11bd0 is not on
  `agent-live/integration`, and the Dev runtime is NOT VERIFIED. On an older runtime a bound
  session cannot join; it fails visibly.

**The fix report overstates one fix:** `REPORT-review-fix-2026-11-01.md:174` says F8 shows "Your
agent hasn't joined yet". That copy does not exist and nothing renders the notice (G1).

| # | Check | Result |
| --- | --- | --- |
| 1 | F1 swipe-back, Done while ending | CLEAN in code. Gesture on device NOT VERIFIED |
| 2 | F2 unbound rejoin | CLEAN, bounded and visible. FINDING, LOW (G6): no test holds the carry |
| 3 | F3 first-join drop | CLEAN, no false "connected". FINDING, LOW (G4) |
| 4 | F4 to F11 | F4, F5, F7, F9 CLOSED. F6, F8, F10 PARTIAL. F11 OPEN (all LOW) |
| 5 | R2 contract | CLEAN, unchanged |
| 6 | Failed rejoin visible | CLEAN. FINDING, LOW (G3): wrong copy on one path |
| 7 | Flag gate | CLEAN: only `eas.json:103` |
| 8 | Prebuild gate | NOT RUN (Windows) |
| 9 | Tests | Live 262/262. Full suite: 3 suites fail, none Live |
| 10 | Typecheck | tsc clean, tsgo clean |
| 11 | Scope | CLEAN, one addition to note: Sentry scrub (`src/logger/sentry/setup/*`) |
| 12 | Device items | NOT VERIFIED |

## 1. F1: CLOSED in code. Gesture on device NOT VERIFIED

### The named sites at cd5aab174

**`src/Navigation.tsx:797`: no line changed.** The file is not in the range.
`fullScreenGestureEnabled: true` is still there, so the gesture stays enabled and the fix handles it
on the screen rather than disabling it.

**`src/screens/AgentLive/index.tsx`, the old `:119-122` is now `:137-141`:**

| Line | Change |
| --- | --- |
| `:139` | New: `made?.detach({failureSeen: latest.current.endFailed})` before the existing `void made?.end()` (`:140`) |
| `:142` | Effect deps gain `i18n`. It is the global instance (`src/locale/i18nProvider.tsx:2`, `:15`), so a language change does not re-run the effect and end the session |

**The other changes that close F1:**

| Line | Change |
| --- | --- |
| `index.tsx:95`, `:116-119` | `latest` ref holds the current state for the unmount cleanup |
| `index.tsx:122-128` | `onEndGaveUp` shows a toast: "Couldn’t end your live session, so your agent may still be live. Open Live again to end it." |
| `index.tsx:170-176` | `usePreventRemove(open \|\| state.ending, ...)`: while open it runs `onEnd`; while ending it blocks and waits |
| `index.tsx:195` | Cancel during `starting` uses `onEnd`, not `leave` |
| `index.tsx:482` | No Done button while `state.ending` |
| `session.ts:323`, `:928-931` | A give-up after `detach` calls `onEndGaveUp`; `failureSeen` stops a second warning |

### Every exit path

| Exit | Result at cd5aab174 |
| --- | --- |
| End button | `/end`, wait, leave. A failure stays on screen (unchanged, CLEAN in f2caccaa) |
| Swipe or header back, connected or reconnecting | Prevented, becomes End |
| Swipe in `starting` | Prevented, becomes End. `begin` sends `/end` when the runtime answers (`session.ts:754-759`) |
| Swipe on the consent sheet | Prevented, becomes End and `/end` is sent |
| Swipe on the reuse prompt | Prevented, becomes End. Deliberately no `/end` (`session.ts:918`): it may be live on another device |
| Swipe or Done while "Ending…" | Blocked or hidden until `/end` answers |
| Swipe or Leave anyway on the failed-end panel | Leaves; the owner has seen the warning. The session stays registered, and sign-out re-sends `/end` |
| Swipe in `idle` | Allowed. No session exists |
| Tab double-tap, or `reset` while on the route | Same `beforeRemove`: prevented, becomes End. The reset destination is dropped |
| Sign-out or account switch | Hook (`state/session/index.tsx:174`, `:197`, `:236`, `:275`), then unmount runs `end()`. A give-up shows the toast |
| Create account | No hook (`state/session/index.tsx:146`, unchanged). The account change remounts on `key` (`src/App.native.tsx:157`), so the unmount cleanup sends `/end` with the pinned bearer |

The FINAL-reason finishes (`session.ts:469-486`, `:502-513`) still skip `/end` by design: the room or
session is already over or has moved. They are unchanged.

No exit path that should send `/end` skips it. App kill cannot send it; the session's time limit
covers that case.

### How the gesture reaches the code (source, no device)

With `react-native-screens` 4.24.0 and native-stack 7.15.0:

1. `NativeStackView.native.tsx:411` passes `preventNativeDismiss={isRemovePrevented}`.
2. iOS below 26 with a full-screen pan (`RNSScreenStack.mm:1010`) runs an interactive pop, so the
   back-button cancel at `RNSScreenStack.mm:1054-1066` does not apply. If the swipe completes,
   `RNSScreen.mm:1740-1743` restores the stack and calls `notifyDismissCancelled` instead of
   dismissing.
3. The edge-swipe and iOS 26 paths are not `handleSwipe` paths. They reach the same event through
   `RNSScreenStack.mm:1054-1066` or `RNSScreen.mm:1740`. I traced this by reading only; I did not
   establish which of the two fires for each iOS version.
4. `NativeStackView.native.tsx:611-617` dispatches `pop`, `beforeRemove` fires, and
   `usePreventRemove` calls `onEnd`.

`FindContactsFlowScreen.tsx:31` already uses the same hook on these navigators.

The likely visible cost is that the screen slides off and snaps back before "Ending…" shows. Not
checked on a device.

### Real-hook probe

The suite mocks the hook (`AgentLive.test.tsx:174`), so I ran a throwaway test (deleted) with the
real `@react-navigation/core`, in the screen's effect order. `goBack` was held and `onEnd`-equivalent
ran; when the prevent flag dropped, the leave went through to Home. See G8 for the caveat.

### Tests

- `AgentLive.test.tsx:726` swipe becomes End, `:738` not prevented before a session, `:744` no Done
  while ending, `:766` Cancel while starting, `:788` toast once after unmount, `:809` no second warning.
- `session.test.ts:740`, `:749`.
- Mutation: `usePreventRemove(false, ...)` turned `:726` and `:744` red. Reverted.

### What would settle the gesture

On a `development-live` build on a device, for both an edge swipe and a mid-screen swipe, ideally on
iOS 26 and on an older iOS:

1. While live, swipe back. Expect "Ending…", then the screen leaves, and exactly one `/end` in the
   Dev runtime log.
2. Repeat with `/end` failing (network off after going live). Expect the failed-end panel with Try
   again and Leave anyway.
3. Swipe while "Ending…" shows. Expect it to stay.

## 2. F2: CLOSED. Bounded and visible

- **Site.** The old `session.ts:434-440` is now `:487-496`. `carry` (`:493`) is true when the removal
  lands within `LIVEKIT_DEPARTURE_TIMEOUT_S` (30 s, `rejoin.ts:22`) of the last connect.
- **Bound.** `rejoin(carry)` resumes at `budgetIndex` (`:560-561`), so at most 5 attempts over
  `REJOIN_BACKOFF_MS` (1, 2, 4, 8, 16 s; 31 s, `rejoin.ts:30`) across those removals.
- **Failure state, visible** (`:625-632`):
  - unbound continued: `ended` / `still_open_elsewhere`, "This live session is still open on your other device. End it there, then try again here." (`index.tsx:423`)
  - unbound new: `failed` / `reconnect_failed`, "Couldn’t reconnect, so the live session has ended." (`index.tsx:402`), with `/end` sent
- **Tests.** `session.test.ts:585` (both cases), `:612`. See G6: neither holds the carry.
- **Probe.** f2caccaa's scenario, each removal landing after `connected`: 6 drops, 5 mints, then the
  failure state, with `micOn: false`, for both cases. With the carry mutated off: 14 drops, 14 mints,
  still `connected`, which reproduces F2. So the fix works and the carry is what does it.

A removal 30 s or more after the last connect starts a new budget (`:612` tests this). That connection
really was up for 30 s, and the runtime's held-participant removal lands sooner. Not a loop to worry about.

## 3. F3: CLOSED

- **Site.** The old `session.ts:585-591` is now `:657-679`. `connect()` returns when `rejoining`
  (`:659`, `:671`) and only then sets `connected` (`:674`). A failure while rejoining no longer calls
  `fail` (`:665`).
- **State.** No new phase: it stays `reconnecting` and the rejoin decides (`connected`, or a visible
  failure). `micOn: true` is recorded before the mic call (`:662`).
- **Test.** `session.test.ts:628`. Mutation: removing `rejoining` at `:671` turned it red. Reverted.
- **Residual.** A drop during `room.connect` itself leaves the mic off after the rejoin (G4).

## 4. F4 to F11

| Id | Status | Where | Result |
| --- | --- | --- | --- |
| F4 | **CLOSED** | `session.ts:291`, `:556`, `:858`, `:863-866` | Not a defect now. The `rejoinGen` check drops the camera request, with `camera_failed`. `session.test.ts:661`; the mutation went red |
| F5 | **CLOSED** | `session.ts:749-751`, `:757`, `:320-322` | Not a defect now. A failed `/end` stays registered and sign-out calls `retryEnd`. A reused session left while starting unregisters. `session.test.ts:701`, `:716` |
| F6 | **PARTIAL** | `session.ts:505-509` | Correct for a removal after 15 s. Still wrong in two cases: G2, G3. A real removal within 15 s of joining still reads "still open" (the heuristic's accepted limit). `session.test.ts:760` |
| F7 | **CLOSED** | `state/session/index.tsx:174` | Login ends sessions only after `createAgentAndLogin` succeeds and `signal.aborted` is checked, before the dispatch. `sessionHook.test.ts:34` (source order) |
| F8 | **PARTIAL** | `session.ts:675-679`; `index.tsx:521-532` | The state is set after 45 s but nothing renders it: G1. There is still no agent check on the join itself; the start reply has no `agent` |
| F9 | **CLOSED** | `session.ts:599`, `:886` | Blind now goes before mic and camera on both paths. `session.test.ts:792`. On the runtime @ ac11bd0, blind state is per job (`live-agent/src/blind-mode.js:5-7`, `:38-55`) and a repeat is a no-op, so the re-send is safe. That the job survives an owner rejoin on Dev is NOT VERIFIED |
| F10 | **PARTIAL** | `session.ts:20-23`, `api.ts:4`, `rejoin.ts:7-14`, orphans at old `:178`, `:345` | All fixed except `REPORT-review-fix-2026-11-01.md:129-131`, which still says the app ends with "removed". A note on the older heading (`:98`) was added instead |
| F11 | **OPEN** | `sessionHook.test.ts` | Still source order, no provider harness; the fix report says so. Login order added (`:34`). Controller tested at `session.test.ts:701`, `:935` |

**F4 and F5, the two that can leave state wrong: neither is a real defect now.**

Also from f2caccaa: **L1 CLOSED** at the unit level (`src/logger/sentry/setup/scrub.ts`, `index.ts:37`,
`scrub.test.ts`); not run against real Sentry. **L2 still PARTIAL** (no client `live.enabled` check).

## 5. New and residual findings (all LOW)

Each behaviour below was seen in a throwaway test, deleted afterwards, unless it says otherwise.

| Id | Where | What |
| --- | --- | --- |
| G1 | `src/screens/AgentLive/index.tsx:521-532` | **F8's notice renders nothing.** The switch has no `agent_waiting` case. After 46 s: `agentLiveNotice` absent, only the existing "Waiting for your agent’s stage…". `session.test.ts:773` checks state only, and `REPORT-review-fix-2026-11-01.md:174` claims copy that does not exist. Not silent, because the spinner text shows, but no one is told the agent has not joined |
| G2 | `src/features/agentLive/session.ts:507` | **M2 regression.** A removal during the first join, before `firstConnectedAt` is set, computes against `?? 0` and reads "You were removed from the live session." on a continued session. It should read "still open on your other device". The code's own comment (`:425-426`) says the runtime can refuse before `connect()` resolves, so this may be M2's usual timing. NOT VERIFIED on a device |
| G3 | `src/features/agentLive/session.ts:625-629` | **F6 residual.** An unbound continued session in a plain network outage (5 mint failures, no removal at all) ends with "still open on your other device", and no `/end`. Needs a missing device key. Failure is visible, the reason is wrong |
| G4 | `src/features/agentLive/session.ts:659`, `:675` | **F3 residual.** A drop during `room.connect` returns before `micOn: true` (`:662`), so the rejoin restores mic **off**: `connected, micOn: false`, `room.mic(false)`. The screen shows mic off accurately and it fails safe, but the owner tapped Go live. The stage timer is also never set on this path, so F8 does not apply |
| G5 | `src/features/agentLive/session.ts:515`, `:544`, `:560` | **The budget resets on a network-reason drop.** A connection that keeps being accepted and then drops got 12 fresh budgets in the probe with no give-up; it reached `reconnect_failed` only after the probe stopped dropping and ran out of token replies. F2's carry covers removals only. Reconnecting shows and End works, so it is visible, not silent, but this loop has no bound |
| G6 | `src/features/agentLive/__tests__/session.test.ts:585` | **No test holds F2's carry.** With `carry` forced false (`session.ts:493`), all 122 tests in `session.test.ts` and `AgentLive.test.tsx` still pass: this test's removals land during the rejoin, not after `connected`. The fix works (section 2), but a regression would go unnoticed |
| G7 | `src/features/agentLive/api.ts:311`; `src/screens/AgentLive/index.tsx:174`, `:482` | **No exit while `/end` hangs.** The fetch has no timeout, and Done and the gesture are both off while ending. Up to 4 attempts plus 11 s of waits, each bounded only by the platform's own timeout (from reading only, NOT VERIFIED). A fast failure is fine; a black-holed network holds the owner on "Ending…" |
| G8 | `src/screens/AgentLive/index.tsx:162-164`, `:174` | **Leaving depends on effect order.** The leave effect runs before the hook's own effects, and `left.current` makes it single-shot. It works because `use-latest-callback` uses a layout effect when `navigator.product === 'ReactNative'` (`react-native/Libraries/Core/setUpNavigator.js:21`). Without that flag, my probe saw the leave blocked by the stale callback, which with `left.current` would strand the owner on the panel with a dead Done. Fine on device and web as read, but the mocked hook means no test would catch it |

G5, if the orchestrator counts it as "the loop is bounded" failing for all sessions, is the one to
re-grade: f2caccaa rated the same shape MEDIUM for removals. I rate it LOW because it needs a server
or network that keeps accepting and dropping, and Reconnecting shows throughout.

Style only: `index.tsx:124-126` uses `i18n._(msg...)` where CLAUDE.md prefers `l`. It has a reason (the
toast can fire after unmount).

## 6. R2 contract: CLEAN, unchanged

Prove with `exchange: true`, then connect with the returned token. No logic changed in the range; the
diff in these areas is an orphan docblock removal and the `api.ts` header.

- `api.ts:240` sends `{token, sig, exchange: true}`. `api.ts:244-252` refuses a reply with no new token.
- `session.ts:398-405` `prove` returns `proved.data.token`; an unbound token joins as minted (`:399`).
- `session.ts:408-412` `join`, `:418-429` `swap`: connect with the returned token.

## 7. Failed rejoin visibility: CLEAN

| Session | Failure | State | Copy |
| --- | --- | --- | --- |
| Bound or unbound new | Budget out | `failed` / `reconnect_failed` | "Couldn’t reconnect, so the live session has ended." (`index.tsx:402`), `/end` sent |
| Unbound continued | Budget out | `ended` / `still_open_elsewhere` | "This live session is still open on your other device. End it there, then try again here." (`:423`). Wrong reason in an outage: G3 |
| Bound | Removed | `ended` / `removed` | "You were removed from the live session." (`:419`) |
| Bound continued | Removed within 15 s | `ended` / `still_open_elsewhere` | As above (`:423`). During the first join: G2 |
| Any | Mint 404 | `ended` / `ended_elsewhere` | "The live session has ended." (`:427`) |
| Any | Mint consent_required | `ended` / `consent_withdrawn` | "The live session stopped because consent was withdrawn." (`:425`) |
| Any | Mint 401 | `failed` / `signed_out` | "You’re signed out. Sign in again to go live." (`:398`) |

Reconnecting shows while it retries (`index.tsx:549`).

## 8. Flag gate: CLEAN

**Flag gate: CLEAN. Only `development-live` sets it true (`eas.json:103`); the other 8 build profiles
say `"false"`. No workflow, env file, script or Makefile sets it.**

- No file in the gate changed in this range (`eas.json`, `plugins/`, `app.config.js`, `metro.config.js`, `react-native.config.js`, `package.json`).
- Exactly `'true'` only (`plugins/agentLive/index.js:35`, `src/features/agentLive/flag.ts:8`); I evaluated `TRUE`: off.
- JS stubbed when off: `metro.config.js:29-31`. Native excluded when off: `react-native.config.js:6`, `plugins/agentLive/index.js:75-85`, `:153-158`.
- No audio when off: `app.config.js:281` has `['remote-notification', 'location']`; `audio` is added only by the on-build plugin (`plugins/agentLive/index.js:94-111`, `:142-149`). `voip` is never added.
- Evaluated `agentLivePlugins`: off gives only the exclusion; on gives the LiveKit plugin, the WebRTC plugin, background audio and usage strings. `buildGate.test.ts:57`, `:64`, `:84` pass.
- `scripts/ios-archive-guard.sh:106-111` refuses an archive with the flag on unless overridden.

## 9. Prebuild gate

**Prebuild gate: NOT RUN by me on Windows. The Mac runs `expo prebuild --platform ios --no-install --clean` with the flag off and on.**

Expected: flag off, LiveKit excluded, no LiveKit source, no audio; flag on, LiveKit source added, audio
added, no voip. The Info.plist itself is NOT VERIFIED until then.

## 10. Tests

Node 24.14.0 (`package.json` asks for >=24.15.0). `pnpm` is not on this machine's PATH, so I ran the Jest,
tsc and tsgo binaries directly. Checkout is CRLF. Dependencies and setup are under "How this was run".

**Live suites: 17 suites, 262 tests, all passed (243 before, +19).** Pattern
`features/agentLive|screens/AgentLive|iosArchiveGuard|routeTable|brandConfig|flags`.

**Full suite, `NODE_ENV=test jest --forceExit --maxWorkers=4`: 197 of 200 suites passed; 2586 tests
passed, 2 failed, 28 todo, of 2616.** Exit 1. None is a Live file.

| Failed suite | Cause | Evidence |
| --- | --- | --- |
| `src/lib/lexicon/__tests__/lexicon.test.ts` | **Still fails.** group/post.json hash, Communities, not Live | Expected `678fa536…`, received `79c0a46b…` |
| `plugins/uiSceneLifecycle/__tests__/withUISceneLifecycle.test.js` | CRLF checkout | Passes on LF |
| `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts` | CRLF checkout | Passes on LF |

The 2 CRLF suites passed on LF: 2 suites, 17 tests, run per suite with a temporary conversion, restored.
So the full-suite figures are the CRLF run.

An earlier full run without the compiled catalogs also failed `__tests__/lib/string.test.ts` (cannot find
`locales/en/messages`). That is my environment, not the code: it passes with catalogs present.

Mutations, each reverted with `git checkout`, working tree clean afterwards:

| Mutation | Result |
| --- | --- |
| `usePreventRemove(false, ...)` | Red: `AgentLive.test.tsx:726`, `:744` |
| `carry` forced false | **Survives, nothing red** (G6) |
| `rejoining` removed at `session.ts:671` | Red: `session.test.ts:628` |
| `rejoinGen` check removed at `session.ts:863` | Red: `session.test.ts:661` |

ESLint: NOT RUN.

## 11. Typecheck

- `tsc --noEmit -p tsconfig.communities.json`: exit 0, no output.
- `tsgo -p tsconfig.check.json`: exit 0, no output.

## 12. Scope

Every file changed in 8c01c1e11..cd5aab174 (12):

| File | Area |
| --- | --- |
| `src/features/agentLive/REPORT-review-fix-2026-11-01.md` | Agent Live client |
| `src/features/agentLive/__tests__/session.test.ts` | Agent Live client |
| `src/features/agentLive/__tests__/sessionHook.test.ts` | Agent Live client |
| `src/features/agentLive/api.ts` | Agent Live client (comment only) |
| `src/features/agentLive/rejoin.ts` | Agent Live client (comment only) |
| `src/features/agentLive/session.ts` | Agent Live client |
| `src/screens/AgentLive/__tests__/AgentLive.test.tsx` | Agent Live client |
| `src/screens/AgentLive/index.tsx` | Agent Live client |
| `src/state/session/index.tsx` | Session state: only `endOpenLiveSessions()` moved (F7) |
| `src/logger/sentry/setup/index.ts` | **Outside the named areas** |
| `src/logger/sentry/setup/scrub.ts` (new) | **Outside the named areas** |
| `src/logger/sentry/setup/__tests__/scrub.test.ts` (new) | **Outside the named areas** |

- **`src/Navigation.tsx`: not changed.** No flag or prebuild code changed either.
- **The Sentry files are the only ones outside the named areas.** They are the fix for L1 from f2caccaa,
  so they have a reason, but `beforeBreadcrumb` runs in **every build**, not just Live: it is not behind
  the flag. It only redacts `access_token`, `token` and `join_request` query values, so the risk is low.

## 13. Device-only items: NOT VERIFIED

No device run. NOT VERIFIED: the swipe-back gesture on device, permissions, background and lock,
interruptions, stage rendering, the iOS archive. Also: the real LiveKit SDK timing behind G2 and G4, and
the Dev runtime having ac11bd0.

## How this was run

Things I did outside the review itself, for anyone auditing the run:

- This worktree started at 571924785, not the target, and had no `node_modules`. I created this branch
  from cd5aab174.
- `node_modules` was a junction to the f2caccaa worktree's, whose `pnpm-lock.yaml` and `package.json`
  hashes match cd5aab174's. Nothing there was changed. The junction was removed afterwards.
- 41 compiled catalogs (`messages.ts`, git-ignored) were copied from that worktree for the runs, then
  deleted. No intl command was run.
- **One slip:** my first full Jest log went to `C:\ao\30f293f4-jest-full.log`, outside this worktree. I
  deleted it; nothing else was written outside.
- Throwaway probes and mutations were removed or reverted. Only this report is committed.
