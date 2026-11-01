# Review: One app Live mode, build 43 candidate, f0787bdad..7919b5692

Task c9be6cc6. Independent, read-only review of `fix/agent-live-review-2026-11-01` @ 7919b5692, against the R2
contract rev 4. No device run, no deploy, no EAS, no TestFlight, no live system touched. The feature branch was
not changed.

## Verdict: NOT CLEAN for build 43 (1 HIGH)

The rev 4 alignment holds: no BLOCKER, HIGH or MEDIUM comes from the rev 4 change. It differs from the literal text in
three LOW ways (J3, J4, J6) and in the open ruling. The block comes from an older item that this range does not touch.

- **HIGH: H2. While `/end` hangs, the owner has no control at all, on an immersive screen.** The brief's rule makes
  this a HIGH. `index.tsx` changed by two copy cases only, so H2 is still open. It was MEDIUM on f0787bdad. The
  behaviour has not changed; the bar applied to it has. Mic off and force-quit limit the harm (section 10).
- **MEDIUM: H1. A failed `/end` after a push is still shown to nobody.** Also untouched in this range. The brief says
  the Mac is fixing H1 and H2. Neither fix is in 7919b5692.

Two things the orchestrator should see before any build:

- **Build 43 needs the runtime at 9fc23bd or later on Dev. NOT VERIFIED.** The app no longer sends `exchange`. A
  runtime at ac11bd0 (what build 42 needed) answers that with a plain `{ok: true}`, so every bound join on it fails
  as `server_outdated`. See section 1.
- **The AUTONOMOUS-LOG rev 4 entry is not in any tree I could read.** I checked rev 4 against the text in the brief,
  and matched the "7 cases" to the commit message and the tests, not to the log's own list.

| # | Check | Result |
| --- | --- | --- |
| 1 | Prove body, returned token, runtime | CLEAN (`api.ts:246`, `session.ts:408-410`, runtime `live-routes.js:408-420`). Dev runtime NOT VERIFIED |
| 2 | `server_outdated` | CLEAN (`api.ts:254-256`). FINDING, LOW (J9): no test of the copy |
| 3 | Refused ladder, no reset | CLEAN. FINDING, LOW (J4, `session.ts:187`, `:646`): the window is not measured from the connect |
| 4 | After the 16 s rung | CLEAN (`session.ts:672`, `:370`, `:314`) |
| 5 | Removal outside the window | CLEAN. FINDING, LOW (J7, `session.ts:506`): unbound never runs out if removed at 10 s or later |
| 6 | Refused mint | CLEAN on the status rule. FINDING, LOW (J2, `session.ts:611-612`): no 429 or 408 test. FINDING, LOW (J1, `session.ts:614-617`): no `/end`. FINDING, LOW (J6, `session.ts:690-695`): first join differs |
| 7 | Unbound wait | 31 s, unchanged by the 10 s rule. FINDING, LOW (J3, `session.ts:648`, `:499`): Reconnecting does not hold on one path |
| 8 | Open ruling | Reported, not decided. See below |
| 9 | H1 | FINDING, MEDIUM, OPEN (`index.tsx:147`, `:212-216`, `session.ts:329`) |
| 10 | H2 | **FINDING, HIGH, OPEN** (`index.tsx:189`, `:527`). Real timeout NOT VERIFIED |
| 11 | H3, H4, H5 | All OPEN, LOW |
| 12 | Earlier items | See section 12. F6, F8, F10 PARTIAL. F11, G1, G2, G3, G6 CLOSED. G4 OPEN |
| 13 | Swipe fixes present | CLEAN, not undone. Same order caveat as before: `/end` follows the push |
| 14 | Flag gate | CLEAN |
| 15 | Tests | Live 279/279. Full suite: 3 suites fail, none Live. Lexicon still fails |
| 16 | Typecheck | tsc clean, tsgo clean |
| 17 | Prebuild gate | NOT RUN (Windows). No native change in the range |
| 18 | Scope | CLEAN: 10 files, all Live |
| 19 | Device items | NOT VERIFIED |

**Prebuild gate: NOT RUN by me on Windows. The Mac runs `expo prebuild --platform ios --no-install --clean` flag off and on. Expected: flag off, livekit excluded, no livekit source, no audio; flag on, livekit source added, audio added, no voip.**

**Flag gate: CLEAN. Only `development-live` sets it true (`eas.json:103`). No gate file changed; no new code runs outside the flag.**

**Open ruling (item 8), not decided: an unbound continued session whose joins kept being removed ends with "This live session is still open on your other device. End it there, then try again here." and no `/end` (`session.ts:666-670`). The literal rev 4 text is "Couldn't reconnect" with `/end` sent.**

## 1. The prove body and the returned token: CLEAN

**App.**

| What | Line |
| --- | --- |
| Body `{token, sig}`, no `exchange` | `api.ts:246` |
| Prove returns the fresh token | `api.ts:263`; `session.ts:408-410` |
| First join connects with it | `session.ts:415`, `:417` |
| Every rejoin and the camera swap connect with it | `session.ts:425`, `:434` |
| Same token back, or a half reply, never joins | `api.ts:257-262` |

Tests: `api.test.ts:201`; `session.test.ts:222` (the "Go live" case). Mutations: `exchange: true` back gives 2 red.
Joining on the proven token gives 7 red.

**Runtime, read at 8a6ade0 (authority-one-runtime; 542b30f is an ancestor of it).**

| What | Line |
| --- | --- |
| Route | `src/live/tenant/live-routes.js:277` |
| Handler and parser | `:408-410`, `joinProve`, `readBody` |
| Accepts `{token, sig}`, requires only those two strings | `:411` |
| `exchange` ignored ("no prove-only path") | `:415` comment; `proveJoin` at `join-check.js:199` takes `{token, sig}` |
| Returns the new token | `:416`, `{ok: true, token, expiresAt}` |
| Runtime test: a proof without `exchange` trades too | `test/live-join-exchange-r3.test.js:129` |

**No mismatch.** The runtime does not need `exchange: true` at 8a6ade0 or 9fc23bd.

**What each runtime answers to the app's `{token, sig}`, read from each commit:**

| Runtime | Answer | App result |
| --- | --- | --- |
| 542b30f alone (`:414`) | `{ok: true}` | `server_outdated` |
| ac11bd0 (`:413`, `:415`) | `{ok: true}`: it trades only when `body.exchange === true` | `server_outdated` |
| 9fc23bd, 8a6ade0 (`:416`) | `{ok: true, token, expiresAt}` | Joins |

So **Dev must be at 9fc23bd or later before build 43.** Which commit Dev runs is NOT VERIFIED; I touched no live system.
This is a visible failure, not a silent one, and an unbound session (no device key) is unaffected. `{token, sig}` is
not safe on ac11bd0, the runtime build 42 needed.

## 2. `server_outdated`: CLEAN

| What | Line |
| --- | --- |
| Plain `{ok: true}` becomes `server_outdated` | `api.ts:254-256` |
| First join fails with it, `/end` sent | `session.ts:706-707`, `:370` |
| A rejoin stops at once | `session.ts:654-657` |
| Copy | `index.tsx:444-445`: "Live needs a server update that isn’t available yet, so this session was ended. Try again after the update." |

Tests: `api.test.ts:239`, `session.test.ts:491`, `:506`. Mutations: removing it from `api.ts` gives 3 red; removing the
rejoin stop gives 1 red. The copy has no test (J9).

## 3. The refused-rejoin ladder: CLEAN, one LOW

| What | Line |
| --- | --- |
| `REJOIN_REFUSED_GRACE_S = 10` | `rejoin.ts:41`. Runtime: `REJOIN_REFUSED_GRACE_MS = 10_000`, `live-agent/src/rejoin.js:52` |
| The rungs, 1/2/4/8/16 s | `rejoin.ts:30-32` |
| Removal within the window, after the rejoin finished | `session.ts:493-501`: `rejoin(true, true)` |
| Removal while the rejoin is finishing | `session.ts:539-548` `refusedRemoval`, checked at `:629`, `:635`, `:639`, `:643`, `:658` |
| No reset: the loop starts at `budgetIndex` | `session.ts:578-579` |
| Bound or unbound | Neither path reads `session.key` |

Only `rejoin()` with no carry restarts the ladder (`session.ts:530`), which is the workers' rule: a drop of a connection
that was not refused.

**Tests that go red if the reset comes back:**

| Mutation | Red |
| --- | --- |
| `session.ts:499` carry off | `session.test.ts:997` |
| `refusedRemoval` unbound only (the old rule) | `:944`, `:967`, `:1156`, `:1178` |
| Grace 30 s, or 5 s | `:997` |
| `connFromRejoin` never set | `:997` |
| `connFromRejoin` check removed | 6 red, including `:1058` |

`session.test.ts:997` is bound only. Unbound through `:499` has no test of its own, but the line does not branch on it,
and `session.test.ts:606` holds the unbound budget. My probe ran unbound through `:499`: sleeps
`[1000, 2000]`.

**The window's start (J4, LOW).** The brief asks for "from the rejoin's connect". The code differs in two small ways:

- `connectedAt` is set at `session.ts:646`, after blind, mic and camera have finished, not when `connect` resolved. The
  workers take it at connect (`sender.mjs:162`; `session-job.js:174`). The app's window is longer by the publish time.
  Removals before `:646` are refused anyway, so this widens the window and creates no gap.
- `nowS` floors to whole seconds (`session.ts:187`). The test at `:496` therefore treats a real age of about 9 to 11 s
  as the boundary. A removal at a real 9.2 s can read as 10, and be final for a bound session. The workers use ms.

## 4. After the 16 s rung: CLEAN

- **Copy:** `index.tsx:446-447`, "Couldn’t reconnect, so the live session has ended."
- **`/end`:** `session.ts:672` `fail('reconnect_failed')`, `:370` `endRuntime: true`, `:364`, `:314` `api.endLiveSession`.
- **Tests:** `session.test.ts:967` (state, sleeps `[1000, 2000, 4000, 8000, 16000]`, 5 mints, 1 `/end`), `:471`;
  `AgentLive.test.tsx:635` (the copy, on a plain outage). Mutation: no `/end` here gives 3 red.
- **Probe, always refused:** bound new and bound continued, and unbound new: 5 sleeps, 5 mints, `reconnect_failed`, 1 `/end`.

A bound **continued** session takes this path too, so its `/end` ends the session on the other device. That is the
literal rev 4 rule. I note it next to the open ruling because the two differ only by the device key.

## 5. A removal outside the window: CLEAN, one LOW

**Bound: final.**

- `session.ts:509-528`, `removed` or, for a continued session, `still_open_elsewhere`. No `/end`.
- Copy: `index.tsx:463-464`, "You were removed from the live session."
- Tests: `session.test.ts:997` (11 s), `:1058`, `:366`; `AgentLive.test.tsx:622` (the copy). Mutation at `:502`: 9 red.

**Unbound: the 30 s carry is gone.** Inside `REJOIN_REFUSED_GRACE_S` (`session.ts:496`) it carries on. Outside it, it
rejoins on a fresh ladder (`:506`), and "the next mint says if the session is really over". `LIVEKIT_DEPARTURE_TIMEOUT_S`
is no longer imported by `session.ts`; it remains at `rejoin.ts:22` and in `rejoin.test.ts`. Test: `session.test.ts:645`,
mutation red.

**J7, LOW: an unbound connection accepted and then removed at 10 s or later never runs out.** Probe: 11 s up, removed, 12
times over. Every cycle restarted at the 1 s rung, and it ended only when my probe stopped queueing tokens. Reconnecting
shows and End works, so it is visible. It needs a runtime that keeps accepting and then removing, and rev 4 as written
allows it. Same family as G5.

## 6. A refused mint: CLEAN on the rule, three LOWs

**Status check:** `session.ts:606-613`. Copy: `index.tsx:471-472`, "The live session has ended."

Probe, mint answer during a rejoin, then a good token queued:

| Mint | Result | Mints | `/end` |
| --- | --- | --- | --- |
| 400, 403, 409, 413 | ended, `ended_elsewhere` | 1 | 0 |
| 404 | ended, `ended_elsewhere` (`session.ts:586`) | 1 | 0 |
| 401 | failed, `signed_out` (`session.ts:600`) | 1 | 1 |
| 408, 429, 500, 503 | retried, connected | 2 | 0 |
| Garbled 200 | retried, connected | 2 | 0 |

Prove failures during a rejoin are retried, except `server_outdated` (`session.ts:650-661`). This matches rev 4, and N2
in the runtime: a failed mint inside `/prove` leaves the token unproven (`join-check.js`, `proveJoin`).

**Tests.** 400, 403, 409: `session.test.ts:1021`, 3 cases, mutation 3 red. 503 and network: `:1040`.

**J2, LOW: no test for 429 or 408.** The brief asks for the 429 test: there is none. Removing `!== 429` or `!== 408` from
`session.ts:611-612` leaves every test green. The code is right today, by the probe above.

**J1, LOW: a refused mint says "has ended" and sends no `/end`.** `session.ts:614-617` passes `endRuntime: false`, and the
session leaves the registry (probe: `open: 0`), so sign-out will not re-send.

- 404 and consent mean the session really is over or stopped. A 400, 403 or 409 does not.
- At 8a6ade0, `ownerToken` (`live-routes.js:384-400`) only answers 400 on a malformed body, which the client does not send;
  403 only with `consent_required`; and never 409. So today this path is reached by something in front of the runtime, a
  WAF or proxy, not by the runtime.
- If it happens, the owner is told it ended while the agent may stay up to the session's limit. The mic is off.
- Rev 4 says nothing about `/end` here, so **this is a contract question, not a code error.** No test pins it either way:
  sending `/end` here leaves every test green.

**J6, LOW: "any 4xx from /token" holds on the rejoin path only.**

- First join, with a token past expiry (`session.ts:690-695`): a 403 is `failed` / `http`, "Couldn’t reach your agent. Try
  again later.", with `/end`. Probe confirmed.
- Camera (`session.ts:909-918`): a notice, and the session goes on.

Both are safe, and each may be intended, as neither is a rejoin. The brief's wording is general, so I flag it.

## 7. The unbound wait: 31 s, Reconnecting holds except on one path

**The current wait: tries at 1, 3, 7, 15 and 31 s** (`rejoin.ts:30-32`, comment `:25-28`), plus each attempt's own time.
`rejoin.test.ts:24` holds 31 s above the 30 s. The comment at `session.ts:503-504` says "up to ~30 s".

**Reconciling with the 10 s rule.** They answer different questions. The 31 s budget is how long a session keeps trying. The
10 s grace only classifies one removal: refused (carry on) or not. **The 10 s rule did not shorten the wait.** For unbound,
the one effect is that a removal at 10 s or later now starts a new 31 s, where it used to carry within 30 s (J7).

**The runtime's note.** `live-agent/src/rejoin.js:15-18` now says, as measured on livekit-server 1.9.1, that
`departure_timeout` is room-level, not a per-participant hold, and the active-media hold is NOT RUN. `rejoin.ts:21`
still says "how long a dead participant is held" (J8). The real hold on Dev is NOT VERIFIED by me.

**Reconnecting** is set at `session.ts:575` and stays while the loop runs: `connected` is only set at `:648`. Tests:
`session.test.ts:559`. The title of `:892` claims it, but the test only asserts not `ended`.

**J3, LOW: it does not hold through the whole backoff if the removal lands after the rejoin finished.** The rule in `:493`
handles exactly that case, so the phase has already gone to `connected`. Probe, removal 5 s after the rung:
`reconnecting, connected, reconnecting, connected`. In that gap the stage shows connected, with "Mic on" and live
controls, on a join the runtime is about to remove. Its comment says the backstop removes at `participant_joined`, so
this may be common on real LiveKit. How long the gap lasts there is NOT VERIFIED. It clears itself.

## 8. The open ruling: reported, not decided

**What the code does.** At the end of the budget (`session.ts:663-673`):

| Session | Removal seen in this rejoin | Result | `/end` | Probe |
| --- | --- | --- | --- | --- |
| Unbound, continued | Yes | `ended` / `still_open_elsewhere`: "This live session is still open on your other device. End it there, then try again here." (`index.tsx:467-468`) | **No** | 5 sleeps, 5 mints, 0 `/end` |
| Unbound, continued | No (plain outage) | `failed` / `reconnect_failed` | Yes | `session.test.ts:827` |
| Unbound, new | Yes | `failed` / `reconnect_failed` | Yes | 5 sleeps, 5 mints, 1 `/end` |
| Bound, new or continued | Yes | `failed` / `reconnect_failed` | Yes | 5 sleeps, 5 mints, 1 `/end` |

**Why, per the code's comment:** an unbound continued session whose joins were removed is most likely still held by the
other device (F2). Not sending `/end` leaves that session running.

**The difference from the literal rev 4 text:** rev 4 says "Couldn't reconnect" with `/end` sent. The code shows other copy
and sends no `/end`, on this one row. The test that pins the current behaviour is `session.test.ts:606`, and that test is the
only red if the row is removed. So a ruling for rev 4 is a one-condition change at `:666` plus that test. **I do not decide this.**

`removalSeen` is reset by each `rejoin()` entry (`:572`), so a later network drop restarts the question.

## 9. H1: OPEN, MEDIUM

Not changed in the range. The `index.tsx` diff is two copy cases.

| Line | Still |
| --- | --- |
| `index.tsx:147` | `made?.detach({failureSeen: latest.current.endFailed})` |
| `index.tsx:212-216` | Blur calls `controller?.end()` |
| `session.ts:329` (was `:323`) | Only `else if (detached) deps.onEndGaveUp()` |
| `index.tsx:130-136` | The toast, reached only through that call |

Probe in the screen's harness, `/end` answering 503 four times after a blur:

```
ends 4, toast 0, failed-end panel true
after unmount: toast 0
```

**No test covers it.** `AgentLive.test.tsx:851` is the unmount, and `:933` is a blur with a good `/end`.

## 10. H2: OPEN, HIGH by the brief's rule

Not changed in the range.

| What | Line |
| --- | --- |
| Gesture off | `index.tsx:189-192` |
| `beforeRemove` blocked, and does nothing while ending | `index.tsx:182-184` |
| No Done | `index.tsx:527` (was `:525`) |
| No drawer, no tab bar | `index.tsx:199-206` |
| Stage and its End button gone, as the phase is `ended` | `index.tsx:258-266` |

Probe in the screen's harness, End pressed, `/end` never answering, then an hour of fake timers and a back attempt:

```
at once:       Ending… shown, Done false, Try again false, End false, pressables [], prevent true, gesture off, drawer off
after 60 min:  the same; goBack 0; /end calls 1
after a back:  the same; goBack 0
```

**Exit controls that remain in the app: none.** `pressables: []`. What remains is outside the app: the iOS home gesture and
force-quit.

**The timeout.** There is none in the app:

- No timeout, `AbortController` or signal in `api.ts:318-326`, and no timer in `endOnRuntime` (`session.ts:310-330`; the
  controller probe shows only the 45 s stage timer).
- `XMLHttpRequest.js:152` defaults to `timeout: 0`, the `fetch` polyfill sets none, and `RCTNetworking.mm:326` passes that
  straight to `request.timeoutInterval`.
- **What iOS does with an interval of 0 is NOT VERIFIED.** If the usual 60 s applies, the worst case is 4 attempts plus 11 s of
  waits (`session.ts:204`), about 4 min 11 s, and the failed-end panel then gives exits. If not, there is no bound I can name.
  Bytes trickling on an idle-based timer would extend it either way.

**Why HIGH.** The brief's rule: "if the owner can be stuck in an immersive screen with no control". They can, by the code and
the probe. The bound is unknown, and may be minutes.

**What limits it:**

- It needs a server or path that accepts and does not answer. A fast failure reaches the panel with its exits.
- The mic is already off: the controller probe shows `micOn: false` and 1 disconnect while `/end` hangs. No privacy exposure.
- A push is not stuck (the pushed screen is on top), and `/end` on a blur is not waited on.

**A fix would** bound the wait, or show Leave anyway after some seconds. Leaving must keep the session registered, as the failed-end
panel already does, and the toast on a later give-up would then need H1's fix as well, since the two share `failureSeen`.

## 11. H3, H4, H5

| Id | Status | Where |
| --- | --- | --- |
| H3 | **OPEN**, LOW | `index.tsx:201-206`, unchanged. Plain boolean flag; `view/com/pager/Pager.tsx` not in the range |
| H4 | **OPEN**, LOW | `index.tsx:190-192`, unchanged. The effect has no cleanup |
| H5 | **OPEN**, LOW | `index.tsx:196-198`, `:175-176`, unchanged. The stale comments are still there |

## 12. Earlier items at 7919b5692

**F1 to F11 (8c01c1e11, f2caccaa):**

| Id | Status | Where | Note |
| --- | --- | --- | --- |
| F1 | **CLOSED** in code. Device NOT VERIFIED | `index.tsx:145-149`, `:182-192`, `:527` | H1 and H2 are its remaining edges |
| F2 | **CLOSED** | `session.ts:493-501`, `:578`, `:666-673` | Now the 10 s rule. Mutation red |
| F3 | **CLOSED** | `session.ts:700`, `:706`, `:712` | G4 is its residual |
| F4 | **CLOSED** | `session.ts:297`, `:574`, `:900`, `:905` | |
| F5 | **CLOSED** | `session.ts:326-329`, `:791-793`, `:799` | |
| F6 | **PARTIAL** | `session.ts:519-524`, `:666` | G2 and G3 closed. J5 is a new corner of G2's fix |
| F7 | **CLOSED** | `sessionHook.test.tsx:157` | Now tested against the real Provider |
| F8 | **PARTIAL** | `index.tsx:574-575`; `session.ts:717-721`, `:712` | The notice renders now. The timer is never armed on the G4 path (probe: 0 timers), and there is still no agent check on the join |
| F9 | **CLOSED** | `session.ts:631-633` | `session.test.ts:868` |
| F10 | **PARTIAL** | `REPORT-review-fix-2026-11-01.md:130` fixed | New or remaining stale text: J8 |
| F11 | **CLOSED** | `sessionHook.test.tsx:86-87`, `:131-135` | Real `Provider`, reducer wrapped. I read it and saw it pass; I did not mutate the store's order |

**The cd5aab174 LOWs (30f293f4):**

| Id | Was | Status | Now |
| --- | --- | --- | --- |
| G1 | `index.tsx:521` | **CLOSED** | `index.tsx:574-575`; `AgentLive.test.tsx:585` |
| G2 | `session.ts:507` | **CLOSED** | `session.ts:521`; `session.test.ts:806`, mutation red |
| G3 | `session.ts:625` | **CLOSED** | `session.ts:666`; `session.test.ts:827`, mutation red |
| G4 | `session.ts:659` | **OPEN** | `session.ts:700`, `:712`. Probe: a drop during `room.connect` ends `connected`, `micOn: false`, no stage timer |
| G5 | `session.ts:515` | **OPEN**, now the stated rule | `session.ts:530`. Rev 4: an unrefused drop restarts the ladder. See J7 |
| G6 | `session.ts:493` | **CLOSED** | `session.test.ts:997` holds the carry, mutation red |
| G7 | | Raised | H2 |
| G8 | | **OPEN** | `index.tsx:170-172`, `:182`, unchanged |

L2 (no client `live.enabled` check): unchanged, PARTIAL.

**The LOW follow-up (03dcb4fc0):** agent-waiting notice `index.tsx:574-575`; the still-open rule on a seen removal
`session.ts:280`, `:546`, `:572`, `:666`; the provider harness `sessionHook.test.tsx`. All three are present and do what the commit says.

## 13. The swipe fixes: present, not undone

Both commits are ancestors of 7919b5692. In the range, `index.tsx` gains 4 lines, all copy (`:444-445`, `:574-575`).

| Fix | Line | Test |
| --- | --- | --- |
| Back swipe off while live or ending | `index.tsx:189-192` | `AgentLive.test.tsx:895` |
| Push ends the session | `index.tsx:210-219`, `:215` | `AgentLive.test.tsx:933` |
| Drawer off, tab bar off | `index.tsx:199-206` | `AgentLive.test.tsx:921` |

Two answers that differ from the brief's wording, both as the f0787bdad review found:

- **The push calls `/end` from the blur, after the navigation has committed, not before.** It always calls it.
- **The drawer and tab bar come back when the screen loses focus or unmounts, not when the session ends.** On the ended panel
  they stay off, and Done is there, except during H2.

`src/Navigation.tsx` is not in the range. `fullScreenGestureEnabled: true` is still at `:797`.

## 14. Flag gate: CLEAN

`eas.json` is not in the range, and parsed, only `development-live` is `true` (`:103`). The other 8 profiles with the key are `false`.
`plugins/`, `app.config.js`, `package.json`, `pnpm-lock.yaml`, `ios/`, `android/`, `modules/`, `metro.config.js` and
`react-native.config.js`: no diff. `index.tsx:68` returns the Notice when the flag is off or on Android. All production lines in the
range are in `api.ts`, `rejoin.ts` and `session.ts`, used through that screen, or inside its `Finished` and `Stage`. **No new code outside the flag.**

## 15. Tests

Node 24.14.0 (`package.json` asks for >=24.15.0). `pnpm` is not on this machine's PATH, so I ran the Jest, tsc and tsgo binaries directly.
Checkout is CRLF.

**Live suites: 17 suites, 279 tests, all passed.** 266 at f0787bdad. Pattern as in earlier reviews:
`features/agentLive|screens/AgentLive|iosArchiveGuard|routeTable|brandConfig|flags`.

**Full suite, `NODE_ENV=test jest --forceExit --maxWorkers=4`: 197 of 200 suites passed; 2603 tests passed, 2 failed, 28 todo, of 2633.** Exit 1.
Same 3 suites as the last two reviews. None is a Live file.

| Failed suite | Cause | Evidence |
| --- | --- | --- |
| `src/lib/lexicon/__tests__/lexicon.test.ts` | **Still fails.** group/post.json hash, Communities, not Live | Expected `678fa536…`, received `79c0a46b…` |
| `plugins/uiSceneLifecycle/__tests__/withUISceneLifecycle.test.js` | CRLF checkout (suite fails to run) | Passes on LF |
| `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts` | CRLF checkout | Passes on LF |

The 2 CRLF suites on LF: 2 suites, 17 tests, passed, with a temporary conversion that was restored. The full-suite figures above are the CRLF run.

**The rev 4 cases, all present and all seen passing.** My mapping from the commit message, as the log entry is not available:

| # | Case | Test |
| --- | --- | --- |
| 1 | A refused connect takes the next rung | `session.test.ts:944` |
| 2 | Always refused climbs 1/2/4/8/16 s, then `reconnect_failed` and `/end` | `session.test.ts:967` |
| 3 | Removal at 9 s carries on, at 11 s final | `session.test.ts:997` |
| 4 | Refused mint 400, 403, 409 final (3 runs) | `session.test.ts:1021` |
| 5 | Outage mint (503, network) retried | `session.test.ts:1040` |
| 6 | Removal while the rejoin turns the mic on | `session.test.ts:1156` |
| 7 | Prove `{token, sig}` only | `api.test.ts:201` |

Also rewritten for rev 4: `session.test.ts:1178` (muted owner) and the body check in `:222`. If the log's list differs, section 1's caveat applies.

**Mutations (each restored), run on the Live `session`, `api`, `rejoin` and `AgentLive` tests:**

| Mutation | Result |
| --- | --- |
| Refused: ladder reset | Red, 1 |
| Grace 30 s / grace 5 s | Red, 1 / 1 |
| `connFromRejoin` check removed / never set | Red, 6 / 1 |
| `refusedRemoval` unbound only | Red, 4 |
| Refused mint not final | Red, 3 |
| `exchange: true` sent | Red, 2 |
| No `server_outdated` in `api.ts` / no stop in rejoin | Red, 3 / 1 |
| Joins with the proven token | Red, 7 |
| `reconnect_failed` without `/end` | Red, 3 |
| Still-open ignores `removalSeen` / never still-open | Red, 1 / 1 |
| Bound removal outside the window not final | Red, 9 |
| Unbound outside the window carries | Red, 1 |
| G2's clause removed | Red, 1 |
| **429 not retried** | **Green: J2** |
| **408 not retried** | **Green: J2** |
| **Refused mint sends `/end`** | **Green: J1** |

These tests use a fake room and a mocked navigation object. They hold the controller's rules, not LiveKit's timing or the real navigator.

## 16. Typecheck

- `tsc --noEmit -p tsconfig.communities.json`: exit 0, no output.
- `tsgo -p tsconfig.check.json`: exit 0, no output.

ESLint: NOT RUN by me (not asked for). The commit reports 0 errors.

## 17. Prebuild gate

**Prebuild gate: NOT RUN by me on Windows. The Mac runs `expo prebuild --platform ios --no-install --clean` flag off and on.**

No native change in the range, by the file list below: nothing under `ios/`, `android/`, `modules/` or `plugins/`, and no `package.json` or config.

## 18. Scope: CLEAN

Every file changed in f0787bdad..7919b5692 (10 files, +608 / -135):

| File | Area |
| --- | --- |
| `src/features/agentLive/api.ts` | Client |
| `src/features/agentLive/rejoin.ts` | Rejoin |
| `src/features/agentLive/session.ts` | Session controller |
| `src/screens/AgentLive/index.tsx` | Live screen, 2 copy cases |
| `src/features/agentLive/REPORT-review-fix-2026-11-01.md` | Docs, in the Live feature directory |
| `src/features/agentLive/__tests__/api.test.ts` | Tests |
| `src/features/agentLive/__tests__/session.test.ts` | Tests |
| `src/features/agentLive/__tests__/sessionHook.test.ts` | Tests, deleted |
| `src/features/agentLive/__tests__/sessionHook.test.tsx` | Tests, added |
| `src/screens/AgentLive/__tests__/AgentLive.test.tsx` | Tests |

**No file is outside the Live client, controller, rejoin code and screen.** Navigation is not touched.

## 19. Device-only items: NOT VERIFIED

No device run. NOT VERIFIED: the physical swipe, the lock screen, a phone call, permissions, background, stage rendering, the iOS archive.
Also: the Dev runtime's commit, H2's real timeout, the length of the J3 gap, the real unbound hold, a push over a session on a device.

**What would settle the gaps,** on a `development-live` build on a device, connected to a real stage:

1. Hold `/end` unanswered (a server that accepts and stays silent), tap End, and time it. This gives H2's real bound.
2. Tap a notification while live, with the network off. This shows H1.
3. On a device with no key, drop the network with the old participant held, and watch for J3's flicker. Confirm the wait.
4. Force a removal at 9 s and at 11 s after a rejoin. Expect next rung, then final.

## Findings

| Id | Severity | Where | What |
| --- | --- | --- | --- |
| H2 | **HIGH** | `index.tsx:189`, `:527`; `api.ts:318-326` | No control while `/end` hangs. Section 10 |
| H1 | MEDIUM | `index.tsx:147`, `:212-216`; `session.ts:329` | A failed `/end` after a push is shown to nobody. Section 9 |
| J1 | LOW | `session.ts:614-617` | A refused mint other than 404 says "has ended" with no `/end`, and leaves the registry. A contract question. Section 6 |
| J2 | LOW | `session.ts:611-612` | No test for 429 or 408. Section 6 |
| J3 | LOW | `session.ts:648`, `:499` | Reconnecting drops to `connected` when a refusal lands after the rejoin finished. Section 7 |
| J4 | LOW | `session.ts:187`, `:496`, `:646` | The window starts after finishing, in whole seconds: about 9 to 11 s. Section 3 |
| J5 | LOW | `session.ts:521`, `:699` | `firstConnectedAt` is never set if the first join throws and a rejoin succeeds, so G2's clause applies for ever. Probe: a continued session, removed 1 h later, reads "still open", not "removed" |
| J6 | LOW | `session.ts:690-695`, `:909-918` | The refused-mint rule is on the rejoin path only. Section 6 |
| J7 | LOW | `session.ts:506` | Unbound, accepted then removed at 10 s or later, never runs out. Section 5 |
| J8 | LOW | see below | Stale text after rev 4 |
| J9 | LOW | `index.tsx:445` | No test renders the `server_outdated` copy |
| J10 | LOW | `session.ts:927-933`, `:509` | A bound removal during a camera swap is final ("removed"), not a refused rejoin. Probe confirmed. A proven same-key token replaces, so it should not arise, but the code calls this "the camera rejoin" and rev 4 does not exempt it |
| H3, H4, H5 | LOW | Section 11 | Open |
| G4, G5, G8 | LOW | Section 12 | Open |

**J8, the stale text:**

- `src/features/agentLive/README.md:33`: `{token, sig, exchange: true}`.
- `api.ts:4`: contract at ac11bd0. `api.ts:229-230` says 9fc23bd.
- `session.ts:400`: "proven with the exchange". `session.ts:626`: "an unbound removal", now any removal.
- `rejoin.ts:21`: "how long a dead participant is held", against the runtime's measured note.
- `REPORT-review-fix-2026-11-01.md:144` and `:171`: the old flag, and the 30 s carry, with no rev 4 note.
- `rejoin.test.ts:3`, `:23`; `session.test.ts:885`; `__fixtures__/live.json:5`; `scripts/agentLive/generateLiveFixtures.mjs:24`, `:27`, `:203`: ac11bd0, and the
  generator still sends `exchange: true`. The fixtures were not regenerated. The reply shape at 8a6ade0 is the same by reading.
  `proveOk`, the plain reply, can no longer come from a current runtime, which is what makes it a fair stand-in for an old one.

**Not a finding, but it does not line up:** `03dcb4fc0` says 5e60a1419 is "in Dev 42", while the brief says build 42 came from cd5aab174. 5e60a1419's parent is
cd5aab174, so both cannot be exact. Build 43 contains it either way.

## How this was run

For anyone auditing the run:

- This worktree started at 571924785, not the target, and had no `node_modules`. The local feature branch was stale; `origin/fix/agent-live-review-2026-11-01` is 7919b5692. I
  created this branch from 7919b5692. The feature branch was not changed.
- `node_modules` was a junction to the f2caccaa worktree's, whose `pnpm-lock.yaml` and `package.json` hashes match 7919b5692's. Nothing there was changed. The junction was removed afterwards.
- 41 compiled catalogs (`messages.ts`, git-ignored) were copied from that worktree for the runs, then deleted. No intl command was run.
- The runtime was read through git objects in the sibling worktree `002e0672`, whose origin is authority-one-runtime: `git show` and `git grep` only, nothing changed. No runtime test was run by me.
- Two throwaway probe test files, the mutations and the LF conversion were removed or reverted. `src` matched 7919b5692 afterwards. Logs stayed inside this worktree and were deleted. Only this report is committed.
