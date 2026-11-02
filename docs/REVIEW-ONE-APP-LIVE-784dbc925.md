# Review: One app Live mode, build 43 gate, 27020b222..784dbc925

Task 377eb6bb. Independent, read-only re-review of `fix/agent-live-review-2026-11-01` @ 784dbc925, against the prior verdict on 27020b222 (33fbbd896). No device run, no deploy, no EAS, no TestFlight, no live system touched. The feature branch was not changed.

## Verdict: CLEAN for build 43 at the BLOCKER/HIGH gate (0 BLOCKER, 0 HIGH, 0 MEDIUM)

F11, F12 and F13 are closed. What remains is 1 inert flag-gate finding and 5 new LOW items (F18 to F22). Device items are NOT VERIFIED, and the prebuild gate has not been run. Two rating calls are the orchestrator's to overrule (see "Questions").

**F11: CLOSED. `createAccount` sends `/end` at `src/state/session/index.tsx:147`, then switches at `:148`. Removing the call turns `sessionHook.test.tsx:242` red.**

**Prebuild gate: NOT RUN on Windows. The Mac still has to run it with the flag off and on. No native change in the range.**

**Flag gate: only `development-live` sets the flag true (`eas.json:103`; the other 8 profiles are false; `eas.json` is not in the range). FINDING LOW: `state/session/index.tsx:147` runs outside the flag, but is inert with the flag off.**

| # | Check | Result |
| --- | --- | --- |
| 1 | F11: `createAccount` ends, end before switch | CLEAN |
| 2 | F12: no "ended" while `/end` is out or failed | CLEAN. Adjacent LOWs: F18 (`AgentLive/index.tsx:588`), F19 (`:544`) |
| 3 | F13: tap sites pinned; P5b, P5j | CLEAN. N1 and N2 are red. P5b and P5j are still green (LOW, F5). Limit noted in section 3 |
| 4 | Tap never `/end`; switch and sign-out end | CLEAN. Adjacent LOW: F21 (`DeleteAccountDialog.tsx:130`) |
| 5 | Earlier closures and the refusal rule | CLEAN. LOW test gap: F20 (`session.ts:787`) |
| 6 | Flag gate | FINDING LOW (inert), `state/session/index.tsx:147` |
| 7 | Prebuild gate | NOT RUN (Windows). No native change |
| 8 | Tests | Live 333/333. Full suite: 4 excused suites fail, none Live, none in range |
| 9 | Typecheck | tsc clean. tsgo 82 errors, all in `src/locale` |
| 10 | Scope | 8 files (section 8) |
| 11 | Device items | NOT VERIFIED |

**Questions for the orchestrator:**

1. **F18: does the Cancel-while-starting copy count under F12?** "Live session ended." shows while the start call is out and before any `/end` has gone. `/end` is not in flight at that moment, so I read it as outside F12 and rated it LOW. A wider reading makes it MEDIUM. Neither reading changes the gate.
2. **F21: is deleting the current account a sign-out under the ruling?** It logs out without `endOpenLiveSessions`. I rated it LOW: it is not a switch, it predates the range, and the bearer is probably already dead by then. If the ruling is meant to cover it, the rating and possibly the gate should be revisited.

## 1. F11 (check 1): CLOSED

`createAccount`, `src/state/session/index.tsx:132-159`:

| Order | Line | Step |
| --- | --- | --- |
| 1 | `:137` | `await createAgentAndCreateAccount(...)` |
| 2 | `:142` | Return if superseded by a newer task: no end, no switch |
| 3 | `:147` | `endOpenLiveSessions()` |
| 4 | `:148` | `store.dispatch({type: 'switched-to-account', ...})` |

This is the same order as `login` (`:177`, then `:178`).

**Bearer, by reading:** `endOnRuntime` reaches `bearerFor` (`features/agentLive/api.ts:293`) and `getAgentRuntimeAccessToken` with no await before the persisted read, so the old account is still current when the token is read. `sessionHook.test.tsx` mocks the registry, so no test runs a real `/end` through `createAccount`. The registry-to-`/end` path is covered separately (`AgentLive.test.tsx:1349`).

| Mutation | Result | Test that goes red |
| --- | --- | --- |
| F11a, remove `:147` | RED | `sessionHook.test.tsx:242` |
| F11b, end after the switch | RED | `sessionHook.test.tsx:242` |
| F11c, end before the account exists | RED | `sessionHook.test.tsx:242`, `:268` |

The last two pin the order in both directions. `:268` also pins that a failed `createAccount` ends nothing.

All `switched-to-account` dispatches are now accounted for: `:149` (create, ends), `:179` (login, ends), `:292` (`resumeSession`, ends on a switch unless `keepLive`). The `resumeSession` callers with no switch flag are app start (`App.native.tsx:127`, `App.web.tsx:115`) and tab sync (`state/session/index.tsx:359`), which is a no-op on native (`state/persisted/index.ts:46-51`). I did not assess Live on web tabs; the build 43 gate is iOS.

## 2. F12 (check 2): CLOSED

All in `src/screens/AgentLive/index.tsx`:

| Copy | Line | Condition |
| --- | --- | --- |
| "Couldn't reconnect." | `:545` | `reconnect_failed` and (`ending` or `endFailed`) |
| "Couldn't reconnect, so the live session has ended." | `:546` | `reconnect_failed`, `/end` answered ok |
| "Ending the live session." | `:586` | Default reason, not `leftRunning`, `ending` |
| "The live session may not have ended." | `:587` | Default reason, not `leftRunning`, `endFailed` |
| "Live session ended." | `:588` | Default reason, none of the above (see F18) |
| "The live session has ended." | `:579` | `ended_elsewhere`: the server said so, no `/end` from here. Unchanged |

**Render probe.** I recorded every message `Finished` rendered, with `ending` and `endFailed`, across the whole screen suite (66 tests, 33 of them reach the panel). **0 renders claimed "ended" with `ending` or `endFailed` true.** The probe only sees paths that suite exercises.

- Owner End with `/end` 503: "Ending the live session." then "The live session may not have ended."
- Outage ladder with `/end` 503: "Couldn't reconnect." (`ending`) then "Couldn't reconnect." (`endFailed`).

**No flash before `ending`.** `finish()` sets the phase at `session.ts:484` and `endOnRuntime` sets `ending` at `:380` in the same synchronous run, so the two updates arrive in one render. The probe saw no intermediate frame.

| Mutation | Result | Test that goes red |
| --- | --- | --- |
| F12a, `:544` always "has ended" | RED | `AgentLive.test.tsx:688` |
| F12c, `:544` drop `endFailed` | RED | `AgentLive.test.tsx:688` |
| F12d, drop `:586` | RED | `AgentLive.test.tsx:663` |
| F12e, drop `:587` | RED | `AgentLive.test.tsx:663` |
| **F12b, `:544` drop `ending`** | **GREEN** | **None (F19, LOW)** |

## 3. F13 and the P5 LOWs (check 3): CLOSED

New test: `src/lib/hooks/__tests__/notificationTapKeepsLive.test.ts:17`. It reads the two source files and requires every `onPressSwitchAccount(...)` call to end in `'Notification'`.

| Mutation | Result | Test case that goes red |
| --- | --- | --- |
| N1, `useNotificationHandler.ts:240` passes `'SwitchAccount'` | RED | `:17`, `useNotificationHandler.ts` case |
| N2, `Navigation.tsx:1070` passes `'SwitchAccount'` | RED | `:17`, `Navigation.tsx` case |
| N1b, call removed | RED | `:17`, `useNotificationHandler.ts` case |
| N2b, call removed | RED | `:17`, `Navigation.tsx` case |

**Limit, by reading (F22):** this is a source-text check, not behaviour. A renamed alias of `onPressSwitchAccount`, or a direct `resumeSession(account, true)` in either handler, would pass it.

**P5b and P5j are still GREEN (F5, LOW, confirmed):** P5b, `session.ts:801`, a ladder mint refusal not noted. P5j, `session.ts:545`, `signed_out` not a refusal. Neither has a `/end` effect, as the prior review found.

## 4. Notification tap and owner actions (check 4): CLEAN

**A tap never sends `/end`.** Both tap sites pass `'Notification'`, `useAccountSwitcher.ts:43` turns it into `keepLive: true`, and `state/session/index.tsx:276` then skips the end. The range changes none of this code. `createAccount` is not reachable from a tap directly: a tap for an account not on the device only shows the logged-out screen (`useNotificationHandler.ts:242`, `Navigation.tsx:1072`), and creating an account from there is the owner's action.

| Path | Line | Mutation | Test that goes red |
| --- | --- | --- | --- |
| Tap keeps Live | `useAccountSwitcher.ts:43` | N3 RED | `useAccountSwitcher.test.tsx:32` |
| Switcher ends | `useAccountSwitcher.ts:43` | N4 RED | `useAccountSwitcher.test.tsx:40` |
| `keepLive` honoured | `state/session/index.tsx:276` | N5 RED | `sessionHook.test.tsx:232` |
| Account switch ends | `:280` | N6 RED | `sessionHook.test.tsx:217` |
| Password sign-in ends | `:177` | SO1 RED | `sessionHook.test.tsx:162` |
| Sign-out, current | `:200` | SO2 RED | `sessionHook.test.tsx:197` |
| Sign-out, every | `:239` | SO3 RED | `sessionHook.test.tsx:207` |

The real-router probe from the prior review was not re-run: the screen's navigation code is not in the range. `AgentLive.test.tsx:1099` still passes.

## 5. Earlier closures and the refusal rule (check 5): CLEAN

The brief's line numbers have moved or point at the method: P1's rule is now at `session.ts:1080`, and `:777` is the docblock above P2's reset at `:787`.

| Item | Where | Mutation | Test that goes red |
| --- | --- | --- | --- |
| P1: `admitted: false`, no `/end` | `session.ts:1078-1082` | RED | `session.test.ts:282` |
| P2: refusal per ladder | `session.ts:787-788`, `:873`, read at `:470` | **GREEN alone** (F20); RED with `:873` also removed | `session.test.ts:1780`, `:1520` |
| F3: refused camera proof | `session.ts:984` | RED | `session.test.ts:1573` |
| P3: blur never ends | `AgentLive/index.tsx:238-241` | RED | `AgentLive.test.tsx:1321` |
| P3: unmount never ends | `AgentLive/index.tsx:152-158`, `session.ts:1223-1239` | RED | `AgentLive.test.tsx:1224`, `:1349` |
| P3: background never ends | No `AppState` use in the Live code. Device behaviour NOT VERIFIED | n/a | n/a |
| P4: an unasked drop sends no `/end` | `session.ts:474` | RED, 9 tests | `session.test.ts:393` among them |
| Item 8: takeover only where held | `session.ts:1045-1046` | RED, 3 tests | `session.test.ts:2026` |
| Item 8: panel Cancel leaves it | `session.ts:1206-1209` | RED | `session.test.ts:346` |
| Refusal rule: never `/end` on a refusal | `session.ts:470` | RED, 12 tests | `session.test.ts:282` among them |
| A reused session not taken over | `session.ts:467` | RED, 10 tests | The `7f87024af` block in `session.test.ts` |
| 16 s give-up for outages | `session.ts:511` | RED, 7 tests | `session.test.ts:1502` |

**The F17 change is safe (`session.ts:873`).** It clears the refusal record when a ladder recovers. The only path that continues a ladder after recovery is a removal inside the grace window, `rejoin(true, true)` at `:726`, and that sets the record again through its `refusal` argument (`:788`). A refused rung never reaches `:873`, so no refusal is forgotten mid-ladder. `/end` still has one decision point, `finish()`. `session.test.ts:1520` goes red if the line is removed.

## 6. LOW findings

**Prior:** F5 unchanged (section 3). F7 and F9 unchanged, as allowed. F14, F15 and F16 unchanged: not in the range. F17 CLOSED (section 5). The README item from the prior review is CLOSED (`src/features/agentLive/README.md:76-78`).

**New:**

- **F18, LOW: "Live session ended." while Cancel waits on the start call.** `AgentLive/index.tsx:588`, `session.ts:1207`. Cancel during `starting` runs `finish()` with no session yet, so the panel says "ended" and the screen leaves at once (`index.tsx:180`). `begin` then sends `/end` when the runtime answers (`session.ts:1037`). The probe rendered this on `AgentLive.test.tsx:1202`. In real use it should last only as long as the pop animation; device NOT VERIFIED. See question 1.
- **F19, LOW: `state.ending` at `AgentLive/index.tsx:544` has no test.** Mutation F12b stays green because `AgentLive.test.tsx:688` asserts only after the give-up. The code is right (the probe saw "Couldn't reconnect." with `ending` true); nothing would catch a regression.
- **F20, LOW: `session.ts:787` no longer has a test of its own.** `:873` clears the record first on the recovery path that `session.test.ts:1780` uses, so removing `:787` alone stays green. The line is still live. A scratch probe with a refused rung, then a network drop while the next rung finishes, then outages, gave `reconnect_failed` with 1 `/end` as the code stands, and `refused_reconnect` with 0 `/end` without it. The behaviour matches the per-ladder ruling. A regression here would err toward not ending.
- **F21, LOW: deleting the current account logs out with no end.** `src/screens/Settings/components/DeleteAccountDialog.tsx:130` calls `removeAccount`, and `state/session/index.tsx:322` never calls `endOpenLiveSessions`. The reducer logs out when the current account is removed. Reach is narrow: Live hides the tab bar, so the owner must have Live covered or owed. It runs after the account is deleted, and the runtime checks the bearer against the PDS, so a `/end` at that point would probably get a 401; the session would run to its time limit. By reading, not probed. Not in the range. See question 2. The other caller, `Settings.tsx:692`, only ever gets other accounts (the list is filtered at `:151`).
- **F22, LOW: the F13 guard reads source text.** `notificationTapKeepsLive.test.ts:17`; see the limit in section 3. The tap sites are right today.

**Cosmetic, not rated:** the screen shows "Ending the live session." directly above "Ending the session…" (`AgentLive/index.tsx:586`, `:613`).

## 7. Tests and typecheck (checks 8, 9)

**Live suites**, pattern `features/agentLive|screens/AgentLive|state/shell|useAccountSwitcher|notificationTapKeepsLive`: **16 suites, 333 tests, all passed** (15 and 326 at the prior review).

**Full suite, `NODE_ENV=test jest --forceExit --maxWorkers=4`: 200 of 204 suites passed; 2654 passed, 2 failed, 28 todo, of 2684. Exit 1.**

| Failed suite (excused, not counted) | Result | Live? In range? |
| --- | --- | --- |
| `src/lib/lexicon/__tests__/lexicon.test.ts` (`group/post.json`) | 1 test fails | No, no |
| `__tests__/lib/string.test.ts` | Fails to run | No, no |
| `plugins/uiSceneLifecycle/__tests__/withUISceneLifecycle.test.js` | Fails to run | No, no |
| `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts` | 1 test fails | No, no |

- `tsc --noEmit -p tsconfig.communities.json`: exit 0.
- `tsgo -p tsconfig.check.json`: exit 2, 82 errors, **all in `src/locale`**, 0 elsewhere. Same count as the prior review. The compiled messages are absent here, and I did not compile them (CI's job).

**Mutations:** 33 listed plus one combined run.

- **RED (29):** F11a, F11b, F11c, F12a, F12c, F12d, F12e, N1, N1b, N2, N2b, N3, N4, N5, N6, SO1, SO2, SO3, F17, P1, F3, P3a, P3b, P4, R1, R3, Out1, I8a, I8b.
- **GREEN (4):** F12b (F19), P5b and P5j (F5), P2 alone (F20).
- **Combined:** P2 with F17 removed, RED: `session.test.ts:1780`, `:1520`.

## 8. Scope (check 10)

`git diff --stat 27020b222..784dbc925`: one commit, 8 files, 189 insertions, 5 deletions.

- `src/features/agentLive/README.md`
- `src/features/agentLive/__tests__/session.test.ts`
- `src/features/agentLive/__tests__/sessionHook.test.tsx`
- `src/features/agentLive/session.ts`
- `src/lib/hooks/__tests__/notificationTapKeepsLive.test.ts` (new)
- `src/screens/AgentLive/__tests__/AgentLive.test.tsx`
- `src/screens/AgentLive/index.tsx`
- `src/state/session/index.tsx`

No file under `ios`, `android`, `plugins` or `modules`, and no `app.config.js`, `eas.json`, `package.json` or `pnpm-lock.yaml`.

**Outside the flag:** `state/session/index.tsx:147` runs on every `createAccount`. It only walks the registry, which is empty unless a session started, and a session can only start behind the flag (`AgentLive/index.tsx:72`, `GoLiveButton.tsx:26`). The registry imports no Live client (`sessionHook.test.tsx`, "the registry pulls in nothing"). `session.ts` and the screen changes are inside the flag.

## 9. Prebuild and device items (checks 7, 11)

**Prebuild: NOT RUN on Windows.** The Mac runs it with the flag off and on. No native change in the range.

**NOT VERIFIED (device only):** the physical swipe, the lock screen, a phone call, the notification tap on a device (both kinds), permissions, background, stage rendering, the iOS archive, how long the F18 copy is visible, and creating an account with Live held.

## 10. How this was run

- The worktree's local feature branch was at 571924785, not the head. This review branch was created from 784dbc925. No feature ref was changed.
- `node_modules` was a junction to `C:\ao\worktrees\f2caccaa-independent-priority-hig\node_modules` (`pnpm-lock.yaml` hash identical), used read-only and removed before the commit. Jest, tsc and tsgo ran directly rather than through pnpm, as the brief specified.
- Mutations and probes were temporary source edits inside this worktree, restored by the scripts and checked with `git status`. Scratch files and the Jest cache stayed in the worktree and were deleted. None is committed.
