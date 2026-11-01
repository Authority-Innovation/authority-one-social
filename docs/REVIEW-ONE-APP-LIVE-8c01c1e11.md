# Review: One app Live mode, 44f69af93..8c01c1e11

Task f2caccaa. Read-only review of `fix/agent-live-review-2026-11-01` @ 8c01c1e11, against
review 679a9d48 (28c7aa21c) and the R2 client contract. Runtime read through `git show`
from its local clone, at `feat/agent-live-r2-workers-v2` @ ac11bd0. No deploy, no EAS, no
TestFlight, no live system touched. No device run.

## Verdict: NOT CLEAN for Dev build 42

One HIGH is open: **F1**. The End button is fixed, but H2's failure is still reachable
another way. The iOS swipe-back gesture (and Done while "Ending…" shows) leaves the screen
before `/end` answers, and a `/end` that then gives up tells nobody. The owner may accept
this and downgrade it; that is the owner's decision, not this review's.

Everything else asked about holds on the bound path: prove then connect, full rejoin, and
a visible failed rejoin. Each of those is held by a test I watched go red under a mutation.

| # | Check | Result |
| --- | --- | --- |
| 1 | H2 | **FINDING, HIGH (F1)**: End button CLEAN; swipe-back and Done-while-ending still silent (`src/screens/AgentLive/index.tsx:119-122`, `src/Navigation.tsx:797`) |
| 2 | M2 | CLEAN for the app. Runtime rule unchanged and not in this range; it belongs to the runtime review |
| 3 | N1 | CLEAN as asked. New neighbouring race: F3, MEDIUM |
| 4 | N2 | CLEAN |
| 5 | L6 | CLEAN (config evaluated; the prebuilt Info.plist itself is NOT VERIFIED, needs the Mac) |
| 6 | Prove then connect | CLEAN |
| 7 | Full rejoin, no resume | CLEAN |
| 8 | Failed rejoin visible | CLEAN for bound sessions. **FINDING, MEDIUM (F2)** for unbound ones |
| 9 | L1 / L2 / L6 | OPEN / PARTIAL / CLOSED |
| 10 | Flag gate | CLEAN |
| 11 | Prebuild gate | NOT RUN (Windows) |
| 12 | Tests | Live 243/243. Full suite: 3 suites fail, none Live |
| 13 | Typecheck | tsc clean, tsgo clean |
| 14 | Scope | CLEAN; one file outside the Live tree, `src/state/session/index.tsx`, is the H2 hook |
| 15 | Device items | NOT VERIFIED |

**Dependency for build 42 (not an app defect):** see section 5. This app cannot join a bound
session on a runtime older than ac11bd0.

## 1. Findings from this review

### F1, HIGH: the swipe-back path still gives up silently (H2 residual)

The 679a9d48 H2 scenario was: leave, `/end` fails in a dead spot, nothing tells the owner,
and the agent job runs on. The fix holds the screen only when the **End button** is used.

- `AgentLive` sets no `gestureEnabled: false` (`src/Navigation.tsx:203-206`), and the stacks
  use `fullScreenGestureEnabled: true` (`src/Navigation.tsx:797`). The screen has no
  `usePreventRemove` or `beforeRemove` (no match in `src/screens/AgentLive`).
- A swipe back unmounts the screen, and the only thing that runs is the effect cleanup
  `void made?.end()` (`src/screens/AgentLive/index.tsx:119-122`). `/end` is sent and retried,
  but `endFailed` then goes to an unmounted `setState`. `endOnRuntime` logs nothing
  (`src/features/agentLive/session.ts:259-278`).
- Same result from three other paths:
  - **Done while "Ending the session…" shows.** The button is on the panel throughout
    (`index.tsx:449-459`), and its label stays "Done" until the failure is known.
  - **Cancel on the Intro panel during `starting`** (`index.tsx:163`, `onCancel={leave}`).
    `begin` ends the new session later (`session.ts:663-667`) with no screen.
  - **Sign-out or account switch.** The hook starts `/end` and the tree moves on
    (`registry.ts:7-9`). Nothing reports a give-up. This one is by design, but it is still silent.

Reproduced with a throwaway screen test (deleted): live session, four 503s on `/end`,
`unmount()`. Four `/end` calls went out, `goBack` was not called, and nothing surfaced. The
existing test `AgentLive.test.tsx:720` covers only a `/end` that succeeds.

Reachability of the gesture is from reading the navigator config. It is NOT VERIFIED on a
device. The give-up itself is shown over the fake room and fake runtime.

The only recovery is the "already open" prompt on the owner's next visit, as in 679a9d48.
That prompt now says the session may be on another device and to end it there
(`index.tsx:320-324`), which is misleading for a session orphaned on this one. "Continue
here" does still work for the same device key.

Smallest fix: block removal while a session is open or `ending` (`usePreventRemove`, or
`gestureEnabled: false` from the screen), routing it through `onEnd`; hide or relabel Done
while `ending`; and report a give-up that has no screen (a toast or a logged event). Add a
test for a failed `/end` after unmount.

### F2, MEDIUM: an unbound rejoin can loop for ever, never reaching a failure state

- `session.ts:434-440`: an unbound session treats `removed` while connected as "rejoin", and
  this check comes before the `still_open_elsewhere` branch (`:441-452`).
- Each `rejoin()` that reaches `connected` (`:548`) starts with a fresh backoff budget, so the
  31 s limit only bounds removals that land *during* a rejoin. `session.test.ts:553` tests
  those; `session.test.ts:587` tests a single removal while connected, answered by a 404.
- Scenario: no device key (keystore failure), a reused session, and another device still
  holding it. Per `mayReplace` (`live-tenant-do.js:333-342` @ ac11bd0) the fresh token is
  never admitted, and the mint keeps succeeding because the session is alive.

Reproduced with a throwaway test (deleted): 12 removals, each landing after `connected`,
gave 12 mints, 13 connects, final state `connected, micOn: true`, `endReason: null`. It never
reached `reconnect_failed` or `still_open_elsewhere`. On a device the owner would see
Reconnecting and "Mic on" alternate, and each cycle publishes the mic briefly until the
runtime removes it.

Why MEDIUM and not the HIGH that check 8 sets for a silent "connected": it needs a missing
device key plus a second holder, Reconnecting does show, and the bound path is unaffected.
If the orchestrator reads "Mic on" between removals as a silent connected, this moves to HIGH.
Whether the removal lands after `connected` depends on real timing: NOT VERIFIED on a device.

Smallest fix: carry the attempt budget across unbound removals until a connection has
survived past the departure timeout, then `reconnect_failed`, or `still_open_elsewhere` when
`reused`.

### F3, MEDIUM: a network drop during the first join shows "connected" on a dead room

`connect()` sets `phase: 'connected', micOn: true` when its mic call returns
(`session.ts:585-591`), without checking whether a rejoin started meanwhile. `rejoining` is
not consulted there. N1's fix covers drops during a rejoin, not during the first join.

Reproduced with a throwaway test (deleted), mic call held, `drop('network')`, mic call
released: `reconnecting`, then `connected, micOn: true` while the rejoin is still in its
backoff. The rejoin decides afterwards, so the final state is right: connected, or a visible
`reconnect_failed`. The false state lasts at most the backoff (31 s).

PLAUSIBLE on a real SDK: it needs `setMicrophoneEnabled` to resolve after the drop. If it
throws instead, `connect()` calls `fail('connect')`, which is visible. The window is narrow.
NOT VERIFIED on a device.

Fix: `if (over() || rejoining) return` before that `set`, and read the mic state consistently.

### LOW

| Id | Where | What |
| --- | --- | --- |
| F4 | `session.ts:766-806`, `:497` | A drop during the camera token mint runs `setCamera`'s swap alongside `rejoin()`. Throwaway test: the rejoin, which read `cameraOn: false` at its start, mints a camera-less token and rejoins last. Final `connected, cameraOn: true` with no camera published on the final connection. UI wrong, nothing exposed. A mint in flight on a dropped network usually fails first |
| F5 | `session.ts:810-813`, `:660-667` | After `/end` gives up and the owner leaves, the session stays in the registry and a later sign-out does not re-send `/end` (throwaway test: `endFailed`, 4 calls, still registered). Leaving during `starting` on a reused session never unregisters |
| F6 | `session.ts:449` | Any removal of a continued session reads "still open on your other device", including a real removal. Copy can be wrong |
| F7 | `src/state/session/index.tsx:163` | `login` ends open sessions before the credentials are checked, so a failed login still ends them. The screen is unlikely to be open at that point |
| F8 | `session.ts:611-613` | N2 covers the consent path only. A reused session whose start reply carries a token joins with no agent check (the start reply has no `agent`) |
| F9 | `session.ts:535-543`, `:787-791` | Blind is re-sent after mic and camera publish. Harmless only if the agent keeps its blind state across the rejoin. Not checked |
| F10 | comments | Stale: `session.ts:20-22` ("retried once"), `:178` and `:345` (orphan docblocks), `api.ts:4` (says 3dd4ac1; fixtures are ac11bd0), `rejoin.ts:8-12` (says a fresh token replaces and removal is always final; unbound differs), `REPORT-review-fix-2026-11-01.md:129-131` (superseded by its R2 v2 section) |
| F11 | `sessionHook.test.ts` | The sign-out hook is held by a source-order test only, no provider harness. The test says so. The controller side is tested (`session.test.ts:672`) |

## 2. The 679a9d48 items and the R2 contract, in order

### Check 1: H2 (End button path CLEAN; overall FINDING, see F1)

| H2 part | Now | Test |
| --- | --- | --- |
| Item 1, leaves before `/end` | `onEnd` sets `leaveWhenEnded` and calls `controller.end()`, no `leave()` (`AgentLive/index.tsx:131-138`). It leaves only when `ended` (`:139-145`). `/end` starts before the room is left (`session.ts:310-311`) | `AgentLive.test.tsx:606` |
| Item 2, silent give-up | Explicit state `endFailed` (`session.ts:122`, set at `:275-276`). Copy "Couldn’t end the session, so your agent may still be live. Try again, or it ends on its own at the session’s time limit." (`index.tsx:415-424`), **Try again** → `retryEnd` (`:425-435`, `session.ts:823-827`), **Leave anyway** (`:449-459`) | `AgentLive.test.tsx:628`, `:652`, `session.test.ts:636` |
| Item 3, 401 and stale bearer | Bearer refreshed per call while the account is current (`api.ts:278-287`). A 401 is a visible failure (`session.ts:270`, `:276`) | `session.test.ts:652`, `api.test.ts:449` |
| Item 4, sign-out hook | Hook is `endOpenLiveSessions()` (`registry.ts:24-28`), called from `src/state/session/index.tsx:163`, `:195`, `:234`, `:271-274`. Registered at `session.ts:660` | `sessionHook.test.ts:34`, `:51`, `session.test.ts:672`, `:688` |

The bearer read on the hook path is synchronous as claimed. `endOnRuntime` → `post` → `send`
→ `bearerFor` → `getAgentRuntimeAccessToken` reaches `persisted.get` with no await before it
(`src/lib/agent-runtime/authToken.ts:37-48`).

No premature leave in the state batch: `finish` sets `phase: ended` and then `ending: true`
in the same synchronous turn (`session.ts:301-310`), so the `ended` check never sees the gap.

Mutation: `leave()` straight after `end()` turned `AgentLive.test.tsx:606` and `:628` red.
Mutation: `endFailed` always false turned 4 tests red.

### Check 2: M2 (CLEAN for the app)

**The cited change does not exist in this range.** `live-tenant-do.js` is in the runtime tree,
and this app range does not carry it. At ac11bd0, lines 317-321 are now the `pop_required`
comment and its early return. The rule M2 was about is `mayReplace`
(`live-tenant-do.js:333-342`), and it still refuses a different device key: "A bound holder is
replaced only by the same device key". The runtime side was not changed in the direction of a
move; that stays a runtime or product decision and belongs to the runtime review.

What the app did:

- The "Continue here" copy no longer promises a move (`AgentLive/index.tsx:320-324`).
- A continued session that is then removed ends as `still_open_elsewhere`, no `/end` sent
  (`session.ts:441-452`), copy at `index.tsx:390-391`.
- Tests: `session.test.ts:807`, `AgentLive.test.tsx:693`.

Exception: an unbound session never reaches that branch (F2). Multi-device behaviour is NOT
VERIFIED on devices.

### Check 3: N1 (CLEAN as asked)

The old `session.ts:358` early return is now `:392-398`: while `rejoining`, a `disconnected` on
the new connection is kept in `rejoinDrop` rather than swallowed. `rejoinLive` is set once the
old connection has been left (`:380`). Taken after each step in the rejoin (`:532-546`,
`:550-556`) and the camera rejoin (`:785-797`) by `takeRejoinDrop` (`:477-486`).

The real SDK emits `Disconnected` before `room.disconnect()` resolves
(livekit-client 2.23.0 `Room.disconnect` → `handleDisconnect`), so our own leave cannot be
mistaken for a drop of the new connection. The fake room emits nothing on disconnect, so no
test covers that order; it is from reading the SDK.

Tests: `session.test.ts:700`, `:726`, `:746`, `:766`, `:605`.

### Check 4: N2 (CLEAN)

`readConsent` keeps `agent` (`api.ts:407-418`, at `:416`). Old lines 381-391 moved. Anything but
`started` or `running` fails as `agent_unavailable`, no join, `/end` sent
(`session.ts:707-712`). Copy: "Your agent couldn’t start, so the live session has ended. Try
again later." (`AgentLive/index.tsx:371-372`). The runtime's values match
(`live-consent-routes.js` @ ac11bd0: `running`, `started`, else the job's reason). Real reply in
`live.json` as `consentAgentUnavailable`. Tests: `session.test.ts:791`, `AgentLive.test.tsx:676`.
Residual: F8.

### Check 5: L6 (CLEAN; Info.plist from the Mac)

- `plugins/agentLive/index.js:118-121` holds the strings; `:123-135` applies them; `:148` adds the
  entry on flag-on builds only. Base strings unchanged at `app.config.js:283-286`.
- Camera: "Used for profile pictures, posts and other content, and, when you turn it on in a
  live session, to let your agent see you."
- Mic: "Used to talk to your agent by voice, including in live sessions, and for posts and other
  kinds of content."
- I evaluated both with `expo config --type introspect` (a config read, not a prebuild), with no
  `ios/` written. The plugin chain's final `modResults.ios.infoPlist`:
  - Flag on: the two strings above. No later plugin overwrites them, and no `locales` config
    in `app.config.js` overrides them.
  - Flag off: the original strings.
- Tests: `buildGate.test.ts:112` for the strings, `:103` for the entry.

The strings are the ones App Review would see for a flag-on build, as far as the config goes. The
written Info.plist needs the Mac prebuild (check 11).

### Check 6: prove then connect (CLEAN)

- `api.ts:239`: `send('/live/join/prove', null, {token, sig, exchange: true})`.
- `api.ts:243-250`: no token back, a malformed one, or the same one is `bad_response`.
- `session.ts:351-358`: `prove` returns `proved.data.token`, never the proven one for a bound token.
- Connect on that value: `session.ts:361-365` (first join), `:371-382` (rejoin and camera).
- An unbound token joins as minted (`:352`). That is the design, as there is nothing to prove.

**The test that goes red:** with `return j.token` at `session.ts:357`, 7 tests failed, including
`session.test.ts:424`, `:478`, `:210`, `AgentLive.test.tsx:420`. With `exchange: true` removed,
`api.test.ts:201` failed. Also `api.test.ts:217` for no token back. Runtime evidence in
`live.json`: the traded token's join is removed, the exchanged one's is admitted
(`session.test.ts:547`).

### Check 7: full rejoin, never a resume (CLEAN)

- `session.ts:492-564`: wait, then `mintJoin` (`:502`, `:332-343`: always `POST .../token`,
  clearing any token in hand), prove, disconnect, new connect.
- `room/livekit.tsx:53-55`, `:91`: `NO_SDK_RECONNECT`, so the SDK never sends `reconnect=1`. A null
  delay emits Disconnected at once, with no reason (pinned by `sdkContract.test.ts`).
- No resume or reconnect parameter: the token body is exactly `{camera, devicePubKey}`
  (`api.ts:212-215`), no query string is ever built, and no such field exists in
  `api.ts` or `session.ts` (searched).
- Backoff 1, 2, 4, 8, 16 s (`rejoin.ts:28-30`) and the six FINAL reasons (`:32-39`) equal the
  runtime's `live-agent/src/rejoin.js` @ ac11bd0. Read side by side.
- Tests: `session.test.ts:424`, `:478`, `:458`, `livekitBinding.test.ts:183` (red when the policy is
  removed), `api.test.ts:177`, `rejoin.test.ts`.

### Check 8: a failed rejoin is visible (CLEAN for bound; F2 for unbound)

| Failure | State | Copy |
| --- | --- | --- |
| Backoff exhausted | `phase: failed, error: reconnect_failed` (`session.ts:558`), testID `agentLiveFailed` | "Couldn’t reconnect, so the live session has ended." (`index.tsx:369-370`) |
| Mint 404 | `ended, ended_elsewhere` (`:506-511`) | "The live session has ended." |
| Mint 403 | `ended, consent_withdrawn` (`:513-518`) | "The live session stopped because consent was withdrawn." |
| Mint 401 | `failed, signed_out` (`:520-522`) | "You’re signed out. Sign in again to go live." |
| During the rejoin | `reconnecting`, controls off, no "Mic on" (`index.tsx:506-511`, `:550`, `:590`) | "Reconnecting…" |

Tests: `AgentLive.test.tsx:558`, `session.test.ts:458`, `:514`, `:446`. Mutation: replacing
`fail('reconnect_failed')` with `connected` turned `session.test.ts:458` and `AgentLive.test.tsx:558`
red. Failed rejoins also send `/end` and leave the room; if that `/end` fails, `agentLiveEndFailed`
shows as well.

Exceptions: F2 never reaches a failure state. F3 is a transient false "connected" that still
resolves visibly.

### Check 9: items still open

| Item | State | Evidence |
| --- | --- | --- |
| L1 Sentry breadcrumb scrub | **OPEN**, unchanged | No `beforeBreadcrumb` anywhere in `src` |
| L2 404 and 503 | **PARTIAL**, unchanged | 404 → "Live isn’t available for this agent." (`index.tsx:367-368`; wording is "available", not "enabled"). 503 → "Couldn’t reach your agent. Try again later." (`:376-380`). Go live has no `live.enabled` check (`GoLiveButton.tsx:26`) |
| L6 | **CLOSED** | Check 5 |

L5 is unchanged in part: see F10. The two 679a9d48 LOWs the fix report lists are done: blind
re-sent (`session.ts:595-605`, order: F9), and no mint after end (`:762-765`, `session.test.ts:840`).

### Check 10: flag gate (CLEAN)

Every profile sets it explicitly in `eas.json`, also read through `require`:

| Profile | Line | Value |
| --- | --- | --- |
| base | 16 | false |
| development | 45 | false |
| development-communities | 74 | false |
| **development-live** | 103 | **true** |
| preview | 130 | false |
| production | 163 | false |
| production-apk | 196 | false |
| testflight | 228 | false |
| testflight-android | 261 | false |

Held by `buildGate.test.ts:57`. No `AGENT_LIVE` in `.github`. `origin/one-dev/build-42-live` still has
one `true`; compared with 8c01c1e11 it differs only in `buildNumber` 42 and `development-live`
`simulator: false`. No local `.env` in this worktree.

| Gate | Where |
| --- | --- |
| Exact `'true'` only | `plugins/agentLive/index.js:33-35`, `src/features/agentLive/flag.ts:7-8` |
| JS stubbed when off | `metro.config.js:23`, `:29-31`, regex `plugins/agentLive/index.js:30-31`; UI off at `GoLiveButton.tsx:26`, `AgentLive/index.tsx:58` |
| Native excluded when off | `plugins/agentLive/index.js:138-141`, `react-native.config.js:5-7`, `app.config.js:556` |
| No `audio` when off | Only from `withAgentLiveBackgroundAudio` (`plugins/agentLive/index.js:94-100`, entry `:147`). Base modes `app.config.js:281` |

Introspected: flag off gives modes `remote-notification, location, fetch`, and the one plugin entry
`withAgentLiveExcluded.js`. Flag on adds `audio` and the four Live entries. No `voip` in either.

The registry import into `src/state/session` adds no Live code to a flag-off build: `registry.ts` has
no imports (`sessionHook.test.ts:59`) and does nothing with no session open.

Same limit as 679a9d48: a flag set in a local environment would turn it on for a local build.
`ios-archive-guard.sh` refuses that for an archive; `scripts/bundleUpdate.sh` has no flag handling.
Unchanged by this range.

### Check 11: prebuild gate: NOT RUN

I did not run `expo prebuild --platform ios --no-install --clean`; Windows refuses iOS. The Mac must
run it, flag off and flag on. Expected, from the code:

| | Flag off | Flag on |
| --- | --- | --- |
| Podfile `use_expo_modules!` | `exclude:` the three LiveKit packages | Bare |
| LiveKit podspec source | None | Added |
| `UIBackgroundModes` | remote-notification, location, fetch | remote-notification, location, **audio**, fetch |
| `voip` | Absent | Absent |
| Camera and mic strings | `app.config.js` originals | The Live strings in check 5 |

The fix report (`REPORT-review-fix-2026-11-01.md:133-134`) says the Mac re-ran it. I did not see that
run and it is not evidence here. `pod install` and an archive: NOT RUN.

### Check 12: tests

Node 24.14.0 here; `package.json` asks for >=24.15.0. Checkout is CRLF. Dependencies were installed
with the pinned pnpm 11.5.2. Its normal postinstall compiled the locale catalogs (ignored files); I
did not run an intl command myself.

**Live suites: 17 suites, 243 tests, all passed.** Pattern
`features/agentLive|screens/AgentLive|iosArchiveGuard|routeTable|brandConfig|flags`.

**Full suite, `NODE_ENV=test jest --forceExit --maxWorkers=4`: 196 of 199 suites passed; 2564 tests
passed, 2 failed, 28 todo, of 2594.** Exit 1. None is a Live file.

| Failed suite | Cause | Evidence |
| --- | --- | --- |
| `src/lib/lexicon/__tests__/lexicon.test.ts` | **Still fails.** group/post.json hash, Communities, not Live | Expected `678fa536…`, received `79c0a46b…` |
| `plugins/uiSceneLifecycle/__tests__/withUISceneLifecycle.test.js` | CRLF checkout (suite fails to run) | Passes on LF (13 tests); LF conversion temporary and restored |
| `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts` | CRLF checkout | 4/4 pass on LF, with `src/state/contextEngine/backgroundLocation.native.ts` converted; restored |

`string.test.ts`, which could not run in 679a9d48, passes now that catalogs exist.

The LF result was checked per suite, so the full-suite figures above are the CRLF run. ESLint: NOT RUN.

Mutation checks, each reverted with `git checkout`, working tree clean afterwards:

| Mutation | Red |
| --- | --- |
| Connect with the proven token | 7 tests |
| `exchange: true` removed | `api.test.ts:201` |
| `NO_SDK_RECONNECT` removed | `livekitBinding.test.ts:183` |
| Failed rejoin shows connected | `session.test.ts:458`, `AgentLive.test.tsx:558` |
| End leaves at once | `AgentLive.test.tsx:606`, `:628` |
| `endFailed` never set | 4 tests |

### Check 13: typecheck

- `tsc --noEmit -p tsconfig.communities.json`: exit 0, no output.
- `tsgo -p tsconfig.check.json`: exit 0, no output. The earlier 82 errors were all missing
  compiled catalogs, and catalogs exist in this install.

### Check 14: scope (CLEAN)

**Vs 44f69af93: 21 files, +1347/-123.** The range has four commits, two more than the brief names:
21d6edcde (L6) and 8c01c1e11 (R2 v2).

| Commit | Files |
| --- | --- |
| 95b57da75 | `src/features/agentLive/`: `README.md`, `REPORT-review-fix-2026-11-01.md`, `__tests__/livekitBinding.test.ts`, `__tests__/rejoin.test.ts`, `__tests__/session.test.ts`, `rejoin.ts`, `room/livekit.tsx`, `room/types.ts`, `session.ts` |
| ac97e154a | `scripts/agentLive/generateLiveFixtures.mjs`; `src/features/agentLive/`: `README.md`, `REPORT-review-fix-2026-11-01.md`, `__fixtures__/live.json`, `__tests__/api.test.ts`, `__tests__/buildGate.test.ts`, `__tests__/session.test.ts`, `__tests__/sessionHook.test.ts`, `api.ts`, `registry.ts`, `session.ts`; `src/screens/AgentLive/__tests__/AgentLive.test.tsx`, `src/screens/AgentLive/index.tsx`; **`src/state/session/index.tsx`** |
| 21d6edcde | `plugins/agentLive/index.js`, `plugins/agentLive/withAgentLiveUsageStrings.js` |
| 8c01c1e11 | `scripts/agentLive/generateLiveFixtures.mjs`; `src/features/agentLive/`: `README.md`, `REPORT-review-fix-2026-11-01.md`, `__fixtures__/live.json`, `__tests__/api.test.ts`, `__tests__/rejoin.test.ts`, `__tests__/session.test.ts`, `api.ts`, `rejoin.ts`, `session.ts`; `src/screens/AgentLive/__tests__/AgentLive.test.tsx` |

**Outside the Agent Live client, flag and prebuild code, and rejoin path: one file,
`src/state/session/index.tsx`.** One import and four calls to `endOpenLiveSessions()`, which is what
H2 item 4 asked for. It runs on every login, logout and account switch in every build, and is a no-op
when no session is open.

### Check 15: NOT VERIFIED (no device run)

- Permission prompts, mic and camera, keychain behaviour.
- Background, lock screen and interruptions.
- Stage rendering.
- The swipe-back gesture on this screen (F1), and removal timing (F2, F3).
- The real SDK's disconnect reasons and the rejoin under a real media server.
- The `/rtc/v1` 404 fallback against an R1 edge.
- Multi-device behaviour (M2).
- `pod install`, the written Info.plist and the iOS archive.
- Sign-out `/end` against the real PDS.

## 3. Throwaway tests

Five throwaway tests ran over the fake room and fake runtime, were never committed and were deleted:
F1 (screen), F2, F3, F4, F5. They show the controller's and screen's logic, not the real SDK's
behaviour.

## 4. Side effects outside this worktree

An early command appended `.review-tmp/` to the shared `.git/info/exclude`, outside this worktree. I
removed that line again straight away; the file is back to its earlier content. `core.hooksPath` is
`.husky/_` in the shared git config. The install's `prepare` step runs husky, which writes that value;
earlier installs ran the same step, so I expect it was already set, but I did not check before
installing.

## 5. Dependency for build 42

`proveLiveJoin` treats a reply without a new token as `bad_response` (`api.ts:243-247`). On a runtime
without the exchange, every bound join fails, visibly ("Couldn’t reach your agent"), with the session
ended.

- The exchange is on `feat/agent-live-r2-workers-v2` @ ac11bd0, and `live.json` was generated from it.
- `agent-live/integration` (local and origin) does **not** contain ac11bd0.
- ac11bd0's own review (`review/ac11bd0-r2-v2-r332` @ 2b993604) is headed NOT CLEAN: 0 HIGH, 3 MEDIUM,
  6 LOW. I read its commit title only, not the report.
- What the Dev runtime runs: NOT VERIFIED. I did not touch it.

Build 42 should not be tested until Dev carries the exchange.
