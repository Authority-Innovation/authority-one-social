# Review: One app Live, build 47, M1 fix, range bef7d4eb7..b0d2f0946

Task 30b18b35, round r392. Independent and read-only. No feature branch was changed. Nothing was merged, built, submitted or deployed, and no live system was touched.

## Verdict

**CLEAN for build 47: 0 BLOCKER, 0 HIGH, 1 MEDIUM, 5 LOW.** One judgement call could change this.

M1 is fixed on both named paths. The wait returns only after /end settles or after the 8 s bound expires, and the tests go red on revert.

**The call for Dispatch (M3 below).** If a start call is still out, nothing is registered, so the wait returns at once. In the Cancel case, a /end goes out after that. I rated this MEDIUM because no /end is in flight when the wait returns and the wait never reaches either named path. Check 5 also says any caller returning on /end "NOT settled and NOT bounded" is HIGH. If Dispatch reads that sentence to cover a /end that has not been sent yet, M3 becomes HIGH and the verdict becomes NOT CLEAN.

| # | Check | Status |
| --- | --- | --- |
| 1 | M1 path A, `end()` | CLOSED |
| 2 | M1 path B, `retryEnd()` | CLOSED |
| 3 | The bound | PARTIAL: no hang, and the delete proceeds, but no note is logged (L7) |
| 4 | F21 and F18 regression | CLOSED: both intact. Test gap on the F18 "Stopping" hold (L8) |
| 5 | Other callers | PARTIAL: the only awaiting caller is bounded. M3 is the open window |

**Line numbers.** The handoff's `session.ts:1285` and `:1335` are bef7d4eb7 lines. They are now `:1310` and `:1363`. At b0d2f0946, `:1285` is in `setCamera` and `:1335` is the guard in `endOpen`.

**The range** is one commit, b0d2f0946, which descends from bef7d4eb7. It changes `src/features/agentLive/session.ts` and `src/features/agentLive/__tests__/session.test.ts`, and nothing else.

## How the fix works

- `endOnRuntime` records the /end that is out in `endInFlight` (`session.ts:382`, `:423-434`). A second call for the same session joins the first.
- `endSettled()` waits until none is out: `while (endInFlight) await endInFlight.done` (`session.ts:437-439`).
- `sendEnd` is the old body, and it is still the only caller of `api.endLiveSession` (`session.ts:449`).
- The entry is cleared before `done` settles (`session.ts:429-431`), so the `while` loop cannot spin. `api.ts:392` turns a request failure into a result, so a rejection is not expected. If one did happen, it would leave the loop by throwing, and `allSettled` at `registry.ts:36` absorbs it.

Both named paths are reached from the callback registered at `session.ts:1116-1118`: `endPending ? controller.retryEnd() : controller.end()`.

## 1. M1 path A, `end()` once over: CLOSED

Scenario: Cancel while starting, with the /end sent by `begin` at `session.ts:1129`, outside `ending`.

- **Waits:** `session.ts:1310` (`await ending`), then `session.ts:1312` (`await endSettled()`), which loops at `:438`.
- **Returns:** `session.ts:1313`, only when `endInFlight` is null, so no /end is out.
- **Bound:** 8,000 ms. See check 3.
- **RED on revert:** `session.test.ts:1636`, "M1 (826fdac63): delete waits for the /end that Cancel while starting sent". It went red when `:1312` was removed and when `session.ts` was fully reverted to bef7d4eb7.

## 2. M1 path B, `retryEnd()`: CLOSED

Scenario: a retry /end is already out and a wait starts.

- **Waits and returns:** `session.ts:1363`, `if (!s || state.ending) return endSettled()`. It used to return at once.
- **Other branch:** `session.ts:1364` awaits a new /end, so a retry that is owed is also waited for.
- **Bound:** 8,000 ms. See check 3.
- **RED on revert:** `session.test.ts:1663`, "M1 (826fdac63): delete waits for a retried /end the screen already sent". It went red when `:1363` was restored to a bare `return` and on the full revert. It also asserts the wait sends no extra /end.

Emptying the `endSettled` loop turned both M1 tests red.

## 3. The bound: PARTIAL

- **Value:** `LIVE_END_BEFORE_DELETE_MS = 8_000`, `DeleteAccountDialog.tsx:49`.
- **Passed:** `DeleteAccountDialog.tsx:130`.
- **Enforced:** timer at `registry.ts:39`, race at `registry.ts:41`.
- **After the bound:** the delete **proceeds** to `DeleteAccountDialog.tsx:131`. /end retries keep running. It does not hang and does not refuse.
- **Test proving no hang:** `registry.test.ts:38`, "is bounded: an end that hangs is given up on at the timeout". With the race removed it went red by test timeout. `registry.test.ts:53` covers a failing end.
- **Real controller, not committed:** probes P3a and P3b held /end open on each path with a 50 ms bound. The wait returned, one /end had been sent, and the state was still `ending: true`.

`session.ts` has no timer of its own on these waits. The bound lives in the only caller that awaits them. Separately, /end itself is finite: 4 attempts (`END_RETRY_DELAYS_MS`, `session.ts:262`) at 10 s each (`api.ts:322`).

### L7. LOW: the bound expires silently

The handoff expects "proceeds with a logged note, or refuses with a message". It proceeds, but neither `registry.ts:41` nor `DeleteAccountDialog.tsx:130-131` logs anything, so nothing records that a delete went ahead with /end unsettled.

### L10. LOW: the value 8,000 is not pinned

This is the earlier L2, still open. Changing the constant to 8,000,000 left all tests green. `deleteAccountEndsLive.test.ts:19` checks source order only.

## 4. Regression check on the build 46 closures: CLOSED

The range does not touch `DeleteAccountDialog.tsx`, `registry.ts` or `screens/AgentLive/index.tsx`.

**F21, intact.**
- Awaited and bounded before the server delete: `DeleteAccountDialog.tsx:49`, `:130`, `:131`.
- Wait: `registry.ts:35-42`.
- `removeAccount` at `DeleteAccountDialog.tsx:139` runs after both. Its own fire-and-forget at `state/session/index.tsx:331-333` is unchanged.
- RED on revert: `deleteAccountEndsLive.test.ts:19` (await removed), `registry.test.ts:38` (bound removed).

**F18, intact.**
- **A reused Cancel sends no /end:** `session.ts:1124`. RED on revert: `session.test.ts:1585`, `session.test.ts:760`, `AgentLive.test.tsx:1202`.
- **A created Cancel holds "stopping" until /end settles:** set at `session.ts:1321` and `:1326`, /end awaited at `:1128-1129`, cleared only afterwards in `begin`'s `finally` at `:1155-1160`. The wording is "Stopping the live session." rather than "Stopping…" (`screens/AgentLive/index.tsx:590`), with no Done button (`:684`).
- **No "Live session ended." before /end settles:** `index.tsx:590-593` checks `stopping`, `ending` and `endFailed` first. The screen stays until all clear (`index.tsx:175-179`).
- **Probes, not committed:** P3a showed `stopping: true, ending: true` while /end was held, including after the bound expired, then `stopping: false, endReason: 'local'`. P5 showed that a /end that gives up leaves `endFailed: true`, and the session stays registered.

The M1 change did not move any of these lines' logic. `endedCreated` and the `stopping` handling are unchanged in the diff.

### L8. LOW: no test holds the F18 "Stopping" text while /end is out

This is the earlier L3, still open. A mutation that cleared `stopping` just before `session.ts:1129` left all tests green, yet that would show "Ending the live session." during the hold. So the code is correct, but nothing goes red if this regresses. The new M1 test at `session.test.ts:1636` holds /end open and could assert `stopping: true` at that point with one line.

## 5. Other callers

| Caller | Waits? | Result |
| --- | --- | --- |
| `DeleteAccountDialog.tsx:130`, `endOpenLiveSessionsAndWait` | Yes | Bounded. The only caller that awaits |
| `state/session/index.tsx:147`, `:177`, `:200`, `:239`, `:280`, `:332`, `endOpenLiveSessions` | No, fire-and-forget (`registry.ts:26`) | Not a wait |
| `screens/AgentLive/index.tsx:173`, `void controller.end()` | No | The screen follows state (`:175-179`), not the promise |
| `screens/AgentLive/index.tsx:304`, `void controller?.retryEnd()` | No | Same |
| `Settings.tsx:692`, `removeAccount` | No | Its rows exclude the current account (`Settings.tsx:151`), so it ends nothing |

**My reading, recorded as an assumption:** the sign-out and switch callers return with /end unsettled and unbounded by design. They start the /end and never wait (`registry.ts:7-9`, the review 679a9d48 H2 design, confirmed CLEAN in 826fdac63). I did not count them as findings.

`session.ts` has one other direct use of the /end path: `finish` at `:555`, which `ending` covers.

### M3. MEDIUM (HIGH if read literally): with a start call still out, the wait has nothing to wait for

The session registers only when the start answers (`session.ts:1116`). Before that, `open` is empty and `registry.ts:36` resolves at once. 826fdac63 noted this as a "third, narrower gap". The fix does not change it and did not make it worse. Both cases were reproduced with uncommitted probes against the real controller and a stubbed runtime.

| Probe | Sequence | Result |
| --- | --- | --- |
| P1 | Start out, Cancel, wait | Wait returned at once with 0 /end sent and nothing registered. When the start answered, 1 /end went out, after the wait |
| P2 | Start out, no Cancel, wait | Wait returned at once with 0 /end sent. When the start answered, the session reached `consent` and stayed registered with no /end |

**Why MEDIUM and not HIGH:**
- No /end is in flight when the wait returns, so Dispatch's sentence on /end "still in flight" does not apply by its letter, and neither named path is reached.
- The window is short: the start call is limited to 30 s (`LIVE_START_TIMEOUT_MS`, `api.ts:327`).
- The owner must finish the delete inside that window, with the emailed code and password, while also having started Live. That order is hard to reach by hand. I did not try it on a device.

**What could go wrong if it is hit:** a session created for an account that is being deleted. In P1, the /end then uses the bearer pinned at start (`api.ts:293-302`), which may no longer work. In P2, the session stays open until `removeAccount` fires its end at `state/session/index.tsx:332`, which may also be too late. I did not check whether the runtime cleans up after an account is deleted.

**Fix if wanted:** register when `beginSession` starts its start call, and have the wait also wait for that call to answer, bounded by the same 8 s.

### L9. LOW: two branches of `endOnRuntime` are not exercised

- **The join, `session.ts:425`:** removing it left all tests green. The main callers do not reach it, because `:1363` and `:1312` go to `endSettled` first. The commit's "joins the first" behaviour therefore has no test.
- **The chain, `session.ts:427`:** `if (prev) await prev.done` looks unreachable. A controller has one session: `session` is assigned once at `:1113`, and `:1079` blocks a second `begin`. If it ever ran, it would delay that /end, and a rejected `prev` would stop the /end being sent. It could be removed.

### L11. LOW: a comment overstates sign-out

`session.ts:380` says "sign-out and delete wait for it to settle". Only delete waits. Sign-out is fire-and-forget (`registry.ts:7-9`, `:24-28`).

## Polyfill guard

CLOSED by Dispatch's ruling, so not counted. Still present at `src/lib/utf8.ts:165`. The range does not change `utf8.ts` or `polyfills.ts`, and `utf8.test.ts` passes.

## Earlier LOW findings

L1 (no pending state, Delete button stays live) is unchanged. Probe P4 improves on it: a second wait joins the first and sends no second /end. L2 and L3 continue as L10 and L8 above. L4, L5 and L6 are outside this range and not recounted.

## Mutations

Each ran against `session.test.ts`, `registry.test.ts`, `AgentLive.test.tsx` and `deleteAccountEndsLive.test.ts` (220 tests, all green unmodified). All were restored with `git checkout`, and none is in this commit.

| Mutation | Result | Red test |
| --- | --- | --- |
| Remove `session.ts:1312` | RED | `session.test.ts:1636` |
| `session.ts:1363` back to bare `return` | RED | `session.test.ts:1663` |
| Empty the `endSettled` loop | RED | Both |
| Full revert of `session.ts` to bef7d4eb7 | RED | Both |
| Remove the race at `registry.ts:41` | RED | `registry.test.ts:38` |
| `DeleteAccountDialog.tsx:130` not awaited | RED | `deleteAccountEndsLive.test.ts:19` |
| `session.ts:1124` no longer unregisters a reused session, so it gets a /end | RED | `session.test.ts:760`, `:1585`, `AgentLive.test.tsx:1202` |
| Remove the join at `session.ts:425` | **Survived** | L9 |
| Bound changed to 8,000,000 | **Survived** | L10 |
| Clear `stopping` before /end at `session.ts:1129` | **Survived** | L8 |

## Tests

Jest and `tsc` were called directly because `pnpm` is not on this machine's PATH. The worktree had no `node_modules`, so I used a temporary directory junction to the `node_modules` of worktree 679a9d48, removed before committing. Its `pnpm-lock.yaml` hash matches this branch (`a9459e0f`).

- **Live, session, delete and polyfill suites:** 18 suites, 389 of 389 passed.
- **Full suite:** 208 suites: 204 passed, 4 failed. 2,719 tests: 2,689 passed, 2 failed, 28 todo.
- **The 4 failures** are the same four named as unrelated in 826fdac63, and none is in the range's two files:
  - `__tests__/lib/string.test.ts`
  - `src/lib/lexicon/__tests__/lexicon.test.ts`
  - `plugins/uiSceneLifecycle/__tests__/withUISceneLifecycle.test.js`
  - `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts`
- **Typecheck:** `tsc --noEmit -p tsconfig.communities.json`, exit 0. `tsgo` was NOT RUN.
- **ESLint** on `session.ts` and `session.test.ts`: no findings printed.

Probes P1 to P5 and the mutations ran against a stubbed runtime and were not committed.

## NOT VERIFIED

Anything on a device, the real runtime's behaviour on /end, and what happens to a session on the runtime after its account is deleted. The prebuild was not run, and the range has no native change.

## Findings by severity

| ID | Severity | Location | Summary |
| --- | --- | --- | --- |
| M3 | MEDIUM (HIGH if read literally) | `session.ts:1116`, `registry.ts:36` | With a start call still out, the wait returns at once. Not new |
| L7 | LOW | `registry.ts:41`, `DeleteAccountDialog.tsx:130` | The bound expires with no logged note |
| L8 | LOW | `session.test.ts:1636` | No test holds `stopping` while /end is out |
| L9 | LOW | `session.ts:425`, `:427` | The join is untested, and the chain looks unreachable |
| L10 | LOW | `DeleteAccountDialog.tsx:49` | The value 8,000 is not pinned by a test |
| L11 | LOW | `session.ts:380` | The comment says sign-out waits. It does not |

**Verdict: CLEAN. BLOCKER 0, HIGH 0, MEDIUM 1, LOW 5.** Subject to the Dispatch call on M3: if M3 is read as HIGH, the verdict is NOT CLEAN with HIGH 1.
