# Review: One app Live mode, build 43 candidate, 7919b5692..563477989

Task 2eb060ca. Independent, read-only re-review of `fix/agent-live-review-2026-11-01` @ 563477989, against review
c9be6cc6 (2c94bbdb6) and the R2 contract rev 4. No device run, no deploy, no EAS, no TestFlight, no live system touched.
The feature branch was not changed.

## Verdict: NOT CLEAN for build 43 (1 HIGH)

H1, H2, H3, H4, H5 and G4 are closed, and the mutations confirm the tests hold them. The block comes from the new owner
ruling code.

- **HIGH: R1. "Take over here" is offered where R3 refuses it (`session.ts:827`, `index.tsx:442-453`).** The condition is
  `canTakeOver: !!key`: "this device has a key". The runtime's rule is "the holder's key": `mayReplace` replaces a bound
  holder only with the SAME key, proven. Device keys are per device (`deviceKey.ts`, `THIS_DEVICE_ONLY`). So on a real
  other device, the exact case the panel names, R3 refuses while the holder is connected. If the join stays refused, the
  app climbs the ladder for 31 s, then **sends `/end`, which ends the session the panel said was open elsewhere.**
- **MEDIUM: R2. The unbound case does not match the ruling.** It shows "Still open on your other device" with Done, not
  "Reconnect failed". It never attempts a join, so the "joins are refused" condition cannot arise on this path.
- **MEDIUM: R3f. The give-up toast says "Open Live again to end it", but the panel it leads to has no End.** An unbound
  device has no way to end the session from the app.

**One thing for the orchestrator to decide about R1.** The brief summarises R3 as allowing "the bound owner's token", and
`!!key` matches that wording. The runtime is narrower, and the commit's own message says "the same key, proven". I rated R1
against the runtime and against the brief's rule 6d. If the owner means any bound token, the runtime would have to change
for that to work, since it refuses a different key today.

| # | Check | Result |
| --- | --- | --- |
| 1 | H2 hung `/end` | CLEAN (`api.ts:318`, `:329-333`, `session.ts:212`, `:331-333`, `index.tsx:535-556`, `:593`). Real iOS timing NOT VERIFIED. FINDING, LOW (K3, `index.tsx:156`) |
| 2 | H1 give-up behind a push | CLEAN (`session.ts:352`, `index.tsx:150`, `:218-233`) |
| 3 | H3 drawer flag on a deep link | CLEAN in tests (`drawer-swipe-disabled.tsx:20-31`, `index.tsx:211-212`). Device NOT VERIFIED |
| 4 | H4, H5 | CLOSED (`index.tsx:198-201`; `:203-206`) |
| 5 | G4 | CLOSED (`session.ts:311`, `:656-657`, `:670`, `:715`, `:877`). FINDING, LOW (K2, `session.ts:657`) |
| 6a | Ruling, R3 allows | FINDING, HIGH (R1): the action is present, the condition is wrong |
| 6b | Ruling, R3 does not allow | FINDING, MEDIUM (R2, `session.ts:827`, `index.tsx:429-463`) |
| 6c | "Still open" only from the server | CLEAN on the gate (`api.ts:449`, `session.ts:824-827`). FINDING, LOW (K4): "other device" is not something the server says |
| 6d | Take over route vs R3 | FINDING, HIGH (R1) |
| 7 | Bound removal outside the window | CLEAN (`session.ts:538-542`, `index.tsx:509`) |
| 8 | Ladder 1/2/4/8/16 s, no reset | CLEAN (`rejoin.ts:36-38`, `:47`, `session.ts:592`, `:525-528`, `:688`, `index.tsx:492`) |
| 9 | Refused mint | CLEAN on 4xx, 408, 429, 5xx, garbled (`session.ts:620-636`). FINDING, LOW (K1, `session.ts:614-616`): 401 is final, not retried |
| 9b | Unbound wait | 31 s, unchanged. Reached only by an unbound NEW session now (see R2). J3 still open |
| 10 | Prove, returned token, `server_outdated` | CLEAN (`api.ts:246`, `:254-256`, `session.ts:430-437`, `:443`, `:460`). Dev runtime NOT VERIFIED |
| 11 | Flag gate | CLEAN (`eas.json:103`). One inert change runs outside the flag: the drawer `Provider` |
| 12 | Tests | Live 295/295. Full suite: 3 suites fail, none Live |
| 13 | Typecheck | tsc clean, tsgo clean |
| 14 | Prebuild gate | NOT RUN (Windows). No native change in the range |
| 15 | Scope | 16 files. 4 outside the Live areas, named in section 15 |
| 16 | Device items | NOT VERIFIED |

**Prebuild gate: NOT RUN on Windows. The Mac runs `expo prebuild --platform ios --no-install --clean` flag off and on. No native change in the range.**

**Flag gate: CLEAN. Only `development-live` sets the flag true (`eas.json:103`; the other 8 profiles are false). The only code that runs outside the flag is the counted lock in `drawer-swipe-disabled.tsx`, and it is inert with no lock taken.**

**Owner ruling: NOT MET. (a) "Still open" + "Take over here" exists, but its condition is any device key, not what R3 allows: HIGH. (b) Unbound shows "Still open" + Done, never "Reconnect failed": MEDIUM. (c) "Still open" is server-gated (`reused`): CLEAN. (d) The action is offered where R3 refuses: HIGH.**

## 1. H2: closed

**The bound.**

| What | Value | Line |
| --- | --- | --- |
| Each Live request gives up, as `network` | 10 s, `LIVE_REQUEST_TIMEOUT_MS` | `api.ts:318`, raced and aborted at `:325-339` |
| Retries | 4 tries, waits 1, 3, 7 s | `session.ts:210`, `:335-347` |
| "Leave anyway" appears | 8 s, `END_SLOW_MS` | `session.ts:212`, `:331-333` |
| Worst case to the failed-end panel | about 51 s | Probe below |

The brief's old anchors have moved: `index.tsx:189` is now `:192-195` (the gesture block, lifted by `leaveAnyway`), and
`:527` is now `:593` (no Done while ending).

**The control.** Button `agentLiveLeaveAnywayButton`, label and text "Leave anyway" (`index.tsx:545-554`), under
"This is taking longer than usual. You can leave: we'll keep trying, and tell you if your agent may still be live."
(`:540-543`). Pressing it runs `detach()` and `setLeaveAnyway(true)` (`:280-284`), which lifts `usePreventRemove` (`:185`) and
leaves (`:174`).

**Order on leaving, checked.** The leave effect (`:173`) runs before the `usePreventRemove` effect (`:185`). That is safe:
the installed `usePreventRemove` reads the flag through `useLatestCallback`, which is updated before passive effects run, so
`goBack` is not blocked. I read this in `@react-navigation/core`. The tests use a mocked navigator.

**The mic goes off** at `session.ts:382` (`micOn: false`) and `:365` (`disconnect`, through `:391`), before `/end` answers.

**Probe, screen harness, `/end` never answering (P-C):**

```
t=0      controls []                                    Ending shown; ops connect, mic, disconnect; mic indicator off
t=7.999  controls []
t=8      controls [Leave anyway]
t=11     controls [Leave anyway]  ends 2
t=24     controls [Leave anyway]  ends 3
t=41     controls [Leave anyway]  ends 4
t=51     controls [Done (Leave anyway), Try again]      ends 4, endFailed true
```

So for the first 8 s the owner has no control, which is bounded and by design. There is no later state without a control.
Every other phase has one: Intro has Cancel, Reuse has Not now or Done, Consent has cancel, Stage has End.

**Tests that go red:**

| Mutation | Red |
| --- | --- |
| Request bound removed | `api.test.ts:252`; `AgentLive.test.tsx:763` |
| `endSlow` never set | `session.test.ts:777`; `AgentLive.test.tsx:763` |
| Leave anyway not rendered | `AgentLive.test.tsx:763` |
| Guard not lifted | `AgentLive.test.tsx:763` |
| `micOn: false` removed from `finish` | 14 red |

**Not verified:** the abort and the timer on a real iOS `fetch`. The race does not depend on the abort working.

## 2. H1: closed

| Brief's line | Now |
| --- | --- |
| `index.tsx:147` | `:150`, `detach({failureSeen: latest.current.endFailed})` |
| `index.tsx:212-216` | `:218-233`, blur calls `setOnScreen(false)` then `end()`; focus calls `setOnScreen(true)` |
| `session.ts:329` | `:352`, `else if (detached \|\| !onScreen)`, then `onEndGaveUp` |
| Toast | `index.tsx:133-139` |

No double report: `giveUpReported`, `session.ts:302`, `:353`, `:995`.

Tests: `AgentLive.test.tsx:803` (toast once after a blur), `:830` (back in front, the panel, no toast),
`session.test.ts:802`. Mutations: `onScreen` ignored gives 2 red; `setOnScreen(false)` not called gives 1 red.

The toast's text is correct as far as it goes, but see R3f for where it sends the owner.

## 3. H3: closed

**H3 (d8f8f16e, `index.tsx:201-206`):** Pager's blur cleanup (`view/com/pager/Pager.tsx:84`, `setDrawerSwipeDisabled(false)`)
lands after Live's focus effect on a deep link, so a plain boolean flag was overwritten.

**Fix:** a counted lock beside the flag. The context value is `state || locks > 0` (`drawer-swipe-disabled.tsx:20-31`). Live
takes it on focus and releases it on blur (`index.tsx:211-212`). Pager's cleanup can no longer undo it, and the release leaves
the plain flag to whatever Pager last set. Exported at `state/shell/index.tsx:15`.

Tests: `drawer-swipe-disabled.test.tsx:31` (a lock holds through the flag reset), `:43` (counted, single release),
`:60`; `AgentLive.test.tsx:1042` (the screen takes and releases). Mutations: provider ignores the lock gives 2 red; screen
takes no lock gives 1 red.

The provider test simulates the Pager's call. No test runs the real Pager and drawer. The drawer on a device is NOT VERIFIED.

## 4. H4, H5: closed

| Id | What it was | Fix | Test |
| --- | --- | --- | --- |
| H4 | The gesture effect had no cleanup, so `gestureEnabled: false` could outlive the session view | Cleanup at `index.tsx:198-201` | `AgentLive.test.tsx:1054`, mutation red |
| H5 | Stale comment: "the only way back is the native back swipe" | Reworded at `index.tsx:203-206` | Comment only, in a56bae537 |

The brief said to mark them OPEN if not fixed. Neither is open.

## 5. G4: closed

**G4 (30f293f4, `session.ts:659` then; `:700`, `:712` at 7919b5692):** a drop during the first `room.connect` ended
`connected` with `micOn: false` and no stage timer.

| Fix | Line |
| --- | --- |
| The owner's mic intent, separate from `micOn` | `session.ts:311` |
| Set before the first join | `:715` |
| Kept when the owner changes it | `:877` |
| The rejoin publishes it and shows it | `:656-657` |
| The camera swap publishes it | `:953` |
| Stage wait armed on the rejoin path | `:670`, `:736-742` |

Tests: `session.test.ts:872`, and the `N1: a muted owner too` case. Mutations: rejoin uses `state.micOn` gives 2 red; no stage
wait gives 1 red; `setMic` not recording gives 1 red.

**K2, LOW: `session.ts:657` has no `over()` check before it.** Probe P-G, End pressed during the rejoin's mic step:
`ended, micOn false`, then when the mic call resolves `ended, micOn true`. No screen shows it (the indicator is on the Stage
only, `index.tsx:702`), so the state is wrong rather than the display. New in this range.

## 6. The owner ruling

### What R3 allows

`mayReplace`, `src/live/tenant/live-tenant-do.js:351-361`, read at 9fc23bd and at 5e0e099 (same text):

```js
if (prev.pk || tok.pk) return Boolean(prev.pk && tok.pk === prev.pk && tok.proven_at)
return tok.role === 'agent'
```

| Holder | New token | R3 |
| --- | --- | --- |
| Owner, key K1 | Owner, K1, proven | **Allowed** |
| Owner, key K1 | Owner, K2 (another device) | **Refused**, `duplicate_identity` |
| Owner, key K1 | Owner, unbound | Refused |
| Owner, unbound | Owner, bound | Refused (`prev.pk` is empty) |
| Owner, unbound | Owner, unbound | Refused, waits for `participant_left` |
| Agent, unbound | Agent | Allowed. The app never holds an agent token |
| Nobody holds | Any | No replacement needed: a free identity joins (`:329-336`) |

R3 also requires the token to be minted after the holder joined (`:353`). Refusal revokes the token and removes the
participant by identity (`join-check.js:169`).

`deviceKey.ts` stores the seed `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, "out of iCloud Keychain and backups". Two devices
therefore never share a key.

### 6a and 6d. FINDING, HIGH (R1)

**The copy and action exist:** "Still open on your other device" (`index.tsx:426`, testID `agentLiveStillOpen`), "Take over
here" (`:450`, testID `agentLiveContinueHereButton`, label "Take the live session over here").

**The condition that decides "R3 allows it":** `canTakeOver: !!key`, `session.ts:827`. Nothing compares this key with the
holder's. The client cannot: the start reply carries `reused` and nothing about the holder (`live-routes.js:366`).

**The route.** There is no separate takeover route. `continueHere()` (`session.ts:833`) goes to `afterStart()`, then the consent
sheet if needed, then `freshJoin`, `POST /live/join/prove`, and a LiveKit join. That is the correct route for the one allowed
case, same key.

| Case | Offered | R3 | Result |
| --- | --- | --- | --- |
| Same device, its own earlier session (app killed) | Yes | Allowed | Works, by reading |
| **Other device with a key, holder connected** | **Yes** | **Refused** | **See below** |
| Other device with a key, no holder | Yes | Not needed | Joins, by reading |
| Device with no key | No | Refused | Correct on the action; see R2 |

**The failure, probe P-A, screen harness, panel offered with a key, every join removed:**

```
panel  [Take over here, Not now]
then   consent sheet (this fixture has no consent yet)
t+1,2,4,8 s  Reconnecting
t+16 s       "Couldn't reconnect, so the live session has ended."
             prove 6, mint 5, /end 1
```

The `/end` is the harm: `fail('reconnect_failed')` (`session.ts:688`) stops the agent and deletes the room on the session the
owner was told is running on the other device. Their panel warned only "taking over may not work" (`index.tsx:431-433`). A
test pins this exact behaviour, with the comment "The other device holds it": `session.test.ts:1354`.

**Further risk, NOT VERIFIED on real LiveKit.** The runtime's own report says LiveKit disconnects the older participant on a
duplicate identity and the runtime then removes the newcomer (`src/live/tenant/REPORT-e90c6b95.md:56`). If that holds, the first
tap knocks the other device off ("This live session moved to another device", no `/end`), `participant_left` frees the identity
(`leftToken`, `:367`), and a later rung joins. That would be a takeover R3 refused at the join, reached by retrying. Either way
the holder loses the session. Which of the two happens depends on event order, which I could not test.

**Why HIGH:** rule 6d. It is offered and attempted where R3 refuses, and the likely outcome ends a running session on another
device. **What limits it:** this is the owner's own session and own bearer, so no one else gains access. The flag is on only in
`development-live`.

**The tests do not catch this.** `session.test.ts:1387` and `AgentLive.test.tsx:871` assert the flag and the label. No test
models a different key: the fixtures have one device key.

**Fixing it needs a decision, not just code.** For example, a server signal saying whether this key may replace the holder, or
not offering the action, or no `/end` after a refused takeover. I do not choose.

### 6b. FINDING, MEDIUM (R2)

**The ruling:** the same unbound continued session, where R3 does not allow it, reads "Reconnect failed".

**The code:** `reused` with no key goes to `phase: 'reuse', canTakeOver: false`. Probe P-B:

```
controls [Done]   connects 0   mints 0   no Finished panel
after Done: /end 0, goBack 1
```

| The ruling | The code |
| --- | --- |
| Copy "Reconnect failed" | "Still open on your other device", then "A live session with this agent is open. End it on the other device, then try again here." (`index.tsx:426`, `:437-438`). The string "Reconnect failed" is nowhere in `src` |
| Applies to a session whose joins are refused | No join is attempted (`index.tsx:442`, no button) |

The code pins its own reading: `AgentLive.test.tsx:882`, and the commit message: "Without a key there is no takeover and Done leaves
the session as it is".

**The nearest copy is on a path the screen cannot reach for this case.** "Couldn't reconnect, so the live session has ended."
(`index.tsx:492`) is what an unbound continued session gets from the controller. The controller does not gate `continueHere`
(probe P-H), and `session.test.ts:608`, `:624` and `:896` call it directly. With no button, no owner gets there.

**Side effects:**

- R2 rev 4's "unbound tokens wait up to about 30 s for the dead participant" no longer applies to a continued session. An
  unbound device cannot rejoin even when nobody holds the session, which the runtime would admit.
- The copy can be false, as with no other device (K4), and then its instruction cannot be followed.

**Why MEDIUM, not HIGH:** nothing is exposed or stopped, and the owner has an exit. It needs a device whose keystore fails. It is
a direct difference from an owner ruling, so the owner may rate it higher.

**Separately, for the bound case:** a bound continued session whose joins are refused ends "Couldn't reconnect, so the live
session has ended." with `/end`, not "Still open" and not the literal "Reconnect failed". The ruling covers unbound, so I only
note it. It matches rev 4.

### 6c. "Still open" only when the server says so: CLEAN on the gate

| Step | Line |
| --- | --- |
| Server signal: an active session exists for (owner, agent) | `live-routes.js:336-337`, `:366`, `reused` |
| Read strictly | `api.ts:449`, `reused === true` |
| The only way into `reuse` | `session.ts:824-827` |
| The only render of the string | `index.tsx:255-263` to `:426` |
| The old guess is gone | `still_open_elsewhere`, `STILL_OPEN_WINDOW_S` and `firstConnectedAt`: no match in `src`. `session.ts:685-688` always `reconnect_failed` |

Tests: `session.test.ts:1387`, `AgentLive.test.tsx:871`, `session.test.ts:608` (a continued session runs out as a reconnect).
Mutation "Still open ignores `reused`" gives 6 red.

**No client guess of "still open" remains.** That also means it shows **before** any join is refused, on `reused` alone, which is
how the commit reads the ruling. The ruling's wording, "whose joins are refused", is not what triggers it. I report the
difference and do not decide it.

**K4, LOW: "your other device" is the client's wording, not the server's.** `reused` says a session is active, not that another
device holds it. After a force-quit, or after Leave anyway on this same phone, the panel says "your other device" with none
in existence. The owner's ruling sets this copy, so I rate it LOW.

### R3f. FINDING, MEDIUM: the toast's advice leads nowhere

The give-up toast says "Couldn't end your live session, so your agent may still be live. **Open Live again to end it.**"
(`index.tsx:136`). H2's Leave anyway makes this path more common. Opening Live again gives `reused`, so the Reuse panel:

- Not now or Done send no `/end` (`session.ts:979-984`, test `AgentLive.test.tsx:882`).
- **Bound:** the only way to end it is Take over here, then End, which rejoins and turns the mic on first.
- **Unbound:** no way at all from the app. The session runs to its limit: 3 h by default (`DEFAULT_MAX_LEN_S`,
  `live-tenant-do.js:77`; the start call passes no length, by reading).

Declining a reuse leaving the session alone predates this range. Removing the only button for unbound, and the Leave anyway path
into it, are new. Separate from the ruling, since the ruling does not mention ending.

## 7. Bound removal outside the window: unchanged, CLEAN

Final, no `/end`: `session.ts:538-542`. Copy: `index.tsx:509`, "You were removed from the live session." The continued-session
variant of this is gone, as ruled: it now reads the same.

Probe P-I, a bound continued join: removed at 9 s gives `connected`, sleeps `[1000]`. Removed at 11 s gives `ended`, `removed`,
sleeps `[]`. Mutation "not final" gives 6 red, including `F6` and the 9 s and 11 s test.

## 8. The ladder: unchanged, one addition

| What | Line |
| --- | --- |
| `REJOIN_BACKOFF_MS` 1000, 2000, 4000, 8000, 16000 | `rejoin.ts:36-38` |
| `REJOIN_REFUSED_GRACE_S` 10 | `rejoin.ts:47` |
| Next rung, no reset | `session.ts:592`, `budgetIndex` |
| Removal after the rejoin finished | `:523-529`, `rejoin(true, true)` |
| Removal while it finishes, bound and unbound | `:553-562`, checked at `:646-663`, `:680` |
| After 16 s, `/end` | `:688`, `:396`, `:390` |
| Copy | `index.tsx:492`, "Couldn't reconnect, so the live session has ended." |

**The addition (in the range):** the first join of a continued session counts as a rejoin: `:526` (removal during `connecting`) and
`:731` (`connFromRejoin = s.reused`). Test `session.test.ts:846`, `:1354`. It is reached only with a key, so by R1's path.

Mutations: reset gives 1 red; grace 30 s gives 1 red; first-join clause removed gives 1 red.

## 9. The refused mint and the J items

**Status check:** `session.ts:620-627`. Probe P-F, one bad mint then a good token:

| Mint | Result | Mints | `/end` |
| --- | --- | --- | --- |
| 400, 403, 409 | `ended` / `ended_elsewhere` | 1 | 1 |
| 408, 429, 500, 503 | retried, `connected` | 2 | 0 |
| Garbled 200 | retried, `connected` | 2 | n/a |
| **401** | **`failed` / `signed_out`** | **1** | 1 |

Tests: `session.test.ts:1091` (400, 403, 409, with `/end`), `:1115` (408, 429). Mutations: each red.

**K1, LOW: 401 is not retried.** The brief lists 401 among the retried. `api.ts:361-367` makes it `signed_out`, and
`session.ts:614-616` ends the session. Rev 4 as quoted says only that 401 is not in the final group. This is not new (the prior
review's table shows the same result), and no test holds a 401 mint during a rejoin either way. `bearerFor` refreshes first, so
it needs a bearer that is really refused. I report the difference and do not decide it.

| Id | What | Status | Where |
| --- | --- | --- | --- |
| J1 | Refused mint with no `/end` | **CLOSED** | `session.ts:631-634`; `:1091`, mutation 3 red |
| J2 | No 429 or 408 test | **CLOSED** | `session.test.ts:1115`, mutations red |
| J3 | Reconnecting flips to `connected` on a refusal after finishing | **OPEN**, LOW | `session.ts:668`, `:523-529`. Probe P-I at 9 s shows the rung ran from `connected` |
| J4 | Window starts after finishing, in whole seconds | **OPEN**, LOW | `session.ts:666`, `:199`, `:525` |
| J5 | `firstConnectedAt` never set | **CLOSED**, removed | n/a |
| J6 | The rule holds on the rejoin path only | **OPEN**, LOW | `session.ts:705-711`, `:932-942` |
| J7 | Unbound, removed at 10 s or later, never runs out | **OPEN**, LOW | `session.ts:531-536` |
| J8 | Stale text | **CLOSED**, 2 leftovers below | README, `api.ts:4`, `rejoin.ts:21-27`, fixtures |
| J9 | No test of the `server_outdated` copy | **CLOSED** | `AgentLive.test.tsx:892` |
| J10 | Bound removal during a camera swap is final | **OPEN**, LOW | `session.ts:950-956` |
| The wait | 31 s | Unchanged | Section 9b |

**J8's leftovers (LOW):**

- `session.ts:290-293`: `removalSeen` is written at `:560` and `:586` and never read, and its comment still says "still open
  elsewhere". Dead code from the old guess.
- `session.ts:262`: a doc comment for the removed `firstConnectedAt`, now attached to nothing.

**K5, LOW: the 10 s bound also covers `/consent`.** `api.ts:318` applies to every Live call. The consent route awaits the agent's
job launch (`live-consent-routes.js:139`, `live-routes.js:505`). A launch slower than 10 s now reads as `network`, so
`session.ts:851-853` fails the session and sends `/end`, stopping the agent that just launched. How long a launch takes on Dev is NOT VERIFIED. No test covers it.

**Earlier items:** G5 OPEN (same rule as J7). G8 OPEN (`index.tsx:173-175`, unchanged). F6 CLOSED by the ruling. F8 still PARTIAL:
the timer is now armed on the rejoin path; there is still no agent check on the join. F10 closed with J8, apart from the
leftovers. F11, G1, G2, G3, G6 stay closed; G2's and G3's tests were rewritten for the ruling.

## 9b. The unbound wait

**Current value:** tries at 1, 3, 7, 15 and 31 s, 31 s in all (`rejoin.ts:36-38`), test `rejoin.test.ts:24`.

**The 10 s rule does not shorten it.** The 31 s is how long a session keeps trying. The 10 s only classifies one removal, as
refused or not.

**Reconnecting:** set at `session.ts:589` and held through the loop, except J3.

**New in this range: an unbound continued session never reaches the wait** (R2). Only an unbound new session does.

The runtime's own measurement says `departure_timeout` is room-level, not a per-participant hold (`rejoin.ts:21-27`, now corrected).
The real hold on Dev is NOT VERIFIED.

## 10. Prove and the runtime: unchanged, CLEAN

| What | Line |
| --- | --- |
| Body `{token, sig}`, no `exchange` | `api.ts:246` |
| Returned token | `api.ts:263`, `session.ts:436` |
| First join connects with it | `session.ts:441-443` |
| Rejoin and camera swap | `session.ts:451`, `:460` |
| The check for `server_outdated`: `ok: true` with neither `token` nor `expiresAt` | `api.ts:254-256` |
| Copy | `index.tsx:489-490` |

Tests: `api.test.ts:203`, `:241`, `AgentLive.test.tsx:892`. Mutations: `exchange` back gives 2 red; joining on the proven token gives 7
red; no `server_outdated` gives 4 red.

**Runtime.** 9fc23bd is an ancestor of 5e0e099, and `origin/agent-live/integration` is 5e0e099 in the sibling worktree's refs (I did
not fetch the runtime). `joinProve` at 5e0e099 returns `{ok: true, token, expiresAt}` (`live-routes.js:416`).

**Dev at 9fc23bd or later: NOT VERIFIED.** I touched no live system. On an older runtime every bound join fails as `server_outdated`.

**Fixtures:** `live.json` records 9fc23bd. Its plain reply moved to `legacy-ac11bd0.json`. I did not regenerate them.

## 11. Flag gate: CLEAN

`eas.json` parsed: `development-live` true, the other 8 profiles false. `eas.json` is not in the range. `index.tsx:68` returns the Notice when
the flag is off or on Android, so `LiveSession`, and with it every lock, never mounts.

**New code outside the flag: one.** `state/shell/drawer-swipe-disabled.tsx`'s `Provider` runs in every build. With no lock taken,
`state || locks > 0` equals `state`, so it behaves as before. `Provider` has one extra `useState` and one extra context.

## 12. Tests

Node 24.14.0 (`package.json` asks for >=24.15.0). `pnpm` is not on PATH, so I ran the binaries directly. Checkout is CRLF.

**Live suites: 18 suites, 295 tests, all passed.** Pattern:
`features/agentLive|screens/AgentLive|state/shell|iosArchiveGuard|routeTable|brandConfig|flags`.

**Full suite, `NODE_ENV=test jest --forceExit --maxWorkers=4`: 198 of 201 suites passed; 2619 tests passed, 2 failed, 28 todo, of 2649.** Exit 1.

| Failed suite | Cause | Evidence |
| --- | --- | --- |
| `src/lib/lexicon/__tests__/lexicon.test.ts` | Communities, not Live | `group/post.json is byte-identical to the spike copy` |
| `plugins/uiSceneLifecycle/__tests__/withUISceneLifecycle.test.js` | CRLF checkout | Passes on LF |
| `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts` | CRLF checkout | Passes on LF |

The 2 CRLF suites on LF: 2 suites, 17 tests, passed, with a temporary conversion that was restored. The commit reports a different
third failure on its machine ("string, lexicon, brandConfig golden"); I saw `brandConfig` pass here.

**New tests:**

| Item | Test |
| --- | --- |
| H1 | `AgentLive.test.tsx:803`, `:830`; `session.test.ts:802` |
| H2 | `AgentLive.test.tsx:763`; `session.test.ts:777`; `api.test.ts:252` |
| H3 | `drawer-swipe-disabled.test.tsx:31`, `:43`, `:60` |
| H4 | `AgentLive.test.tsx:1054` |
| G4 | `session.test.ts:872` |
| The ruling | `AgentLive.test.tsx:871`, `:882`; `session.test.ts:846`, `:1354`, `:1387`, `:608` |
| J2, J9 | `session.test.ts:1115`; `AgentLive.test.tsx:892` |

**Mutations:** 27 run, each restored, **all red**; the table entries above name them. These hold the controller's rules against a fake
room and a mocked navigator. They do not hold LiveKit's timing, the real navigator, or R1, since no fixture has a second key.

## 13. Typecheck

- `tsc --noEmit -p tsconfig.communities.json`: exit 0, no output.
- `tsgo -p tsconfig.check.json`: exit 0, no output.

ESLint: NOT RUN (not asked for).

## 14. Prebuild gate

**Prebuild gate: NOT RUN on Windows. The Mac runs `expo prebuild --platform ios --no-install --clean` flag off and on.**

No native change in the range: nothing under `ios/`, `android/`, `modules/` or `plugins/`, and no `package.json`, `pnpm-lock.yaml`,
`app.config.js`, `eas.json`, `metro.config.js` or `react-native.config.js`.

## 15. Scope

Every file in 7919b5692..563477989 (16 files, +682 / -155):

| File | Area |
| --- | --- |
| `src/features/agentLive/api.ts` | Client |
| `src/features/agentLive/rejoin.ts` | Rejoin, comment only |
| `src/features/agentLive/session.ts` | Controller |
| `src/screens/AgentLive/index.tsx` | Live screen |
| `src/screens/AgentLive/__tests__/AgentLive.test.tsx` | Tests |
| `src/features/agentLive/__tests__/api.test.ts` | Tests |
| `src/features/agentLive/__tests__/rejoin.test.ts` | Tests |
| `src/features/agentLive/__tests__/session.test.ts` | Tests |
| `src/features/agentLive/__fixtures__/live.json` | Fixtures |
| `src/features/agentLive/__fixtures__/legacy-ac11bd0.json` | Fixtures, new |
| `src/features/agentLive/README.md` | Docs |
| `src/features/agentLive/REPORT-review-fix-2026-11-01.md` | Docs |
| **`src/state/shell/drawer-swipe-disabled.tsx`** | **Outside.** App shell, H3's lock. Runs in every build; inert unless locked |
| **`src/state/shell/index.tsx`** | **Outside.** One export |
| **`src/state/shell/__tests__/drawer-swipe-disabled.test.tsx`** | **Outside.** Test, new |
| **`scripts/agentLive/generateLiveFixtures.mjs`** | **Outside.** Dev script, not shipped |

The shell change is what H3's fix needs. `src/Navigation.tsx` is not in the range.

## 16. Device-only items: NOT VERIFIED

No device run. NOT VERIFIED: the physical swipe, the lock screen, a phone call, the give-up gesture on device, permissions, background, stage
rendering, the iOS archive. Also: the Dev runtime's commit, the timeout on real iOS `fetch`, the real navigator's leave order, the drawer
on a deep link, R1 on real LiveKit, the agent job's launch time.

**What would settle R1,** on two devices on one account, `development-live`, both with keys:

1. Device A live. Device B opens Live: confirm the panel and Take over here.
2. Tap it and record what A shows, whether B gets in, on which rung, and whether the session survives. This shows which outcome in section 6 is real.

## Findings

| Id | Severity | Where | What |
| --- | --- | --- | --- |
| R1 | **HIGH** | `session.ts:827`, `:688`; `index.tsx:442-453` | "Take over here" on any device key; R3 needs the holder's key. A refused takeover ends in `/end` on the other device's session. Section 6 |
| R2 | MEDIUM | `session.ts:827`; `index.tsx:429-463`; `AgentLive.test.tsx:882` | Unbound continued: "Still open" and Done, no join; the ruling says "Reconnect failed". Section 6b |
| R3f | MEDIUM | `index.tsx:136`, `:454-463`; `session.ts:979-984` | "Open Live again to end it" leads to a panel with no End. Unbound cannot end it at all. Section 6 |
| K1 | LOW | `session.ts:614-616` | A 401 mint is final; the brief lists it as retried. No test. Section 9 |
| K2 | LOW | `session.ts:657` | `micOn` set true on a finished session. Not displayed. Section 5 |
| K3 | LOW | `index.tsx:156-159` | `left.current` never resets. See below |
| K4 | LOW | `index.tsx:426` | "your other device" with no other device. Section 6c |
| K5 | LOW | `api.ts:318` | A job launch over 10 s fails the session and sends `/end`. Section 9 |
| J3, J4, J6, J7, J10, G5, G8 | LOW | Section 9 | Open, unchanged |
| J8 leftovers | LOW | `session.ts:262`, `:290-293` | Dead `removalSeen`, an orphan comment |

**K3, why LOW.** With `canGoBack()` false, `leave()` navigates to the hub, which keeps Live underneath. If the owner comes back, Done
does nothing: `left.current` is still true. Probe P-D: `navigate 1, Done, navigate 1, goBack 0, controls [Done]`. That would be a screen with no
working exit, which the brief rates HIGH. **I found no way to reach it on iOS:** a deep link on native seeds `Home` under the route
(`Navigation.tsx:1023-1028`), so `canGoBack()` is true and the route is popped. Web's flat state is reachable, but the browser has a
back button. So LOW, from the mock harness only. If a device path to a root Live route turns up, this becomes HIGH.

## How this was run

- This worktree started at 571924785, not the target, with no `node_modules`. The local feature branch was stale;
  `origin/fix/agent-live-review-2026-11-01` is 563477989. I created this branch from 563477989. The feature branch was not changed.
- `node_modules` was a junction to the f2caccaa worktree's, whose `package.json` and `pnpm-lock.yaml` hashes match 563477989's. Nothing
  there was changed. The junction was removed afterwards. 41 compiled catalogs (`messages.ts`, git-ignored) were copied for the runs, then deleted.
  No intl command was run.
- The runtime was read through git objects in sibling worktree `002e0672`: `git show` and `git grep` only. No runtime test was run. R3's table
  and R1's outcome come from reading its code, not running it.
- Throwaway probes (P-A to P-I), 27 mutations and the LF conversion were removed or reverted; `git status` was clean afterwards.
- My `tsc` log overwrote `.tsc.log`, which turns out to be tracked in the repo (since 6e9a66796). I restored it from git. Only this report is committed.
