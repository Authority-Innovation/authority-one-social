# Review: One app Live, build 47 M3, range b0d2f0946..6729b3436

Task 97b1b11e, round r403. Independent and read-only. No feature code was changed. Nothing was merged, built, uploaded or deployed, and no live system, real model or token was used.

## Verdict

**CLEAN: BLOCKER 0, HIGH 0, MED 0, LOW 9.** Two Dispatch calls could change this. Both are listed under "Calls for Dispatch".

M3 is closed on both cases the r392 review reproduced. New tests and probes show the correct behaviour on 6729b3436, and my no-Cancel probe on b0d2f0946 reproduces the old behaviour.

| # | Check | Result |
| --- | --- | --- |
| 1 | Registers before the start call | PASS |
| 2 | Delete or sign-out during the start cancels and awaits within 8 s | PARTIAL: delete passes; sign-out cancels but does not await |
| 3 | Cancel keeps the session registered until the start finishes | PASS |
| 4 | L8 | CLOSED |
| 5 | L9 | PARTIAL |
| 6 | L11 | CLOSED |
| 7 | M3 | CLOSED on the r392 cases. Residual windows are rated LOW |

**The range** is one commit, 6729b3436, which descends from b0d2f0946. It changes `src/features/agentLive/session.ts` and `src/features/agentLive/__tests__/session.test.ts`, and nothing else. Line numbers below are at 6729b3436.

`origin/fix/agent-live-review-2026-11-01` has moved on to acde9df08, which is outside this range. I read its diff only to see where L7 and L10 went, and I did not review it.

## Calls for Dispatch

1. **Sign-out does not await.** Check 2 says a delete or sign-out must cancel and await. Sign-out cancels, but nothing waits for it (`registry.ts:26`, `void end()`). The design says so (`registry.ts:7-9`), r392 recorded the same reading, and 6729b3436's commit message and L11 comment both say only delete waits. I did not count it. If Dispatch reads Check 2 literally for sign-out, this becomes a finding and needs a design change.
2. **Whether M3 reaches L12 and L13.** With a start in progress, these two windows still let the delete wait return at once, with no /end sent. They are different paths from the r392 cases, so I rated them LOW. If Dispatch applies the r392 "NOT settled and NOT bounded is HIGH" sentence to them, the verdict becomes NOT CLEAN. See check 7.

## CHECK 1. Registers before the start call: PASS

- **Registered:** `session.ts:1104-1107`, `registerLiveSession`.
- **Start call:** `session.ts:1108`, `api.startLiveSession`. Registration comes first, with no await between them.
- **Handover on the answer:** `session.ts:1131` removes the early entry and `:1132` registers the normal one, synchronously.
- **RED if moved:** both tests below. I moved the block after the call, and separately deleted it. Both mutations gave the same two failures.
  - `session.test.ts:1693`, "M3 (r392): delete while the start call is out, after Cancel, waits for the answer and its /end"
  - `session.test.ts:1717`, "M3 (r392): delete while the start call is out, no Cancel, ends what the start makes before it returns"

Registration is not at the top of `beginSession`. The mic prompt, the bearer capture and the device key read all come before it. See L13.

## CHECK 2. Delete or sign-out cancels, and awaits within 8 s: PARTIAL

"Cancel" here is a state change. The HTTP start request is not aborted. It runs to its answer, up to `LIVE_START_TIMEOUT_MS` = 30 s (`api.ts:327`), and whatever it made is then ended at `session.ts:1145`.

**Delete: PASS**

- **Cancel:** `session.ts:1105`, `controller.end()`, which sets `stopping` at `:1340` and `:1345`.
- **Await:** `session.ts:1106`, `startSettled()`, then `:440`, `await beginRun`. `beginRun` is assigned at `:1166`, and it covers the /end at `:1145`.
- **Bound value:** `LIVE_END_BEFORE_DELETE_MS = 8_000`, `DeleteAccountDialog.tsx:49`, passed at `:130`.
- **Bound enforced:** timer at `registry.ts:39`, race at `registry.ts:41`. `session.ts` has no timer on this wait.
- **Test proving cancel and await:** `session.test.ts:1717`. It goes red without `:1105`, without `:1106`, and without `:440`. `session.test.ts:1693` also goes red without `:440`.
- **Test proving the bound:** `registry.test.ts:38`, "is bounded: an end that hangs is given up on at the timeout". It uses a generic hanging end, not the controller.
- **RED with the bound removed:** `registry.test.ts:38`, with the race at `registry.ts:41` removed.
- **Real controller at the bound (probe P1, not committed):** with the start held and a 50 ms bound, the wait returned in 61 ms with no /end sent. The state was `stopping: true`, still registered. When the start then answered, one /end went out and the registry emptied. See L14.

The value 8,000 itself is not pinned at this SHA. Changing it to 8,000,000 left all tests green (L10).

**Sign-out: cancels, does not await**

- **Cancel:** the same callback, called through `registry.ts:26`. Callers are `state/session/index.tsx:147`, `:177`, `:200`, `:239`, `:280` and `:332`.
- **Await:** none. The await at `session.ts:1106` runs, but nothing waits on it, so no bound applies.
- **Probe P2, not committed:** with the start held, sign-out moved the state to `stopping`. With the tokens then cleared and the screen unmounted, the answer led to one /end carrying the pinned bearer, and the registry emptied. On b0d2f0946 the same probe sent no /end and left the session owed.
- **No committed test** covers sign-out during a held start (L16).

## CHECK 3. Cancel keeps the session registered until the start finishes: PASS

- **Keeps it registered:** `session.ts:1348`, `keepRegistered: stopping`, read at `:561`.
- **Deregisters once the start has finished:**
  - Failed start: `:1114`.
  - Reused session: `:1131` then `:1140`.
  - Created session: `:1131` replaces the entry, and `:472` removes it when /end succeeds.
- **Stays registered on purpose:** a /end that gives up (`:470`) or a session the screen left (`:1142`) stays owed.
- **RED if Cancel deregisters early:** `session.test.ts:1693`, with `:1348` set to `keepRegistered: false`.
- **Other mutations:** without `:1114`, `session.test.ts:1740` goes red. Without `:1131`, 8 tests go red.

One side effect of `:1348` is L15.

## CHECK 4. L8: CLOSED

- **Item:** no test held the F18 "stopping" state while /end was out.
- **Fix:** `session.test.ts:1655`, `expect(env.last()).toMatchObject({stopping: true, ending: true})`.
- **RED on revert:** clearing `stopping` just before `session.ts:1145` turns `session.test.ts:1636` red. The same mutation survived in r392.

## CHECK 5. L9: PARTIAL

- **Item:** two branches of `endOnRuntime` were not exercised: the join and the chain to an earlier session's /end.
- **Chain: CLOSED.** It is removed. `session.ts:429-436` has no chain, and `endInFlight` no longer carries a `sid` (`:382`). A removed branch has no test to go red.
- **Join: OPEN.** `session.ts:430` remains, and **removing it left all 235 tests in the Live session, screen and delete suites green.** No test goes red on revert.
- **Reading:** the join is close to unreachable.
  - `finish` clears `session` first (`:525`), so it cannot send a second /end for the same session.
  - `retryEnd` returns at `:1383` while `state.ending` is true.
  - Only the moment between `:471` and the `finally` at `:431` is left. Joining there is harmless.

## CHECK 6. L11: CLOSED

- **Item:** a comment said sign-out waits for the /end.
- **Fix:** `session.ts:379-381`, "delete waits for it to settle ... Sign-out starts it, not waits". This agrees with `registry.ts:7-9`. A search of both files found no other comment making the old claim.
- **Test:** none possible, as it is a comment.

## CHECK 7. M3 reading

**M3 as r392 wrote it** (`docs/REVIEW-ONE-APP-LIVE-b0d2f0946.md`, on `review/b0d2f0946-one-live-b47-r392`): "with a start call still out, the wait has nothing to wait for", at `session.ts:1116` and `registry.ts:36` at b0d2f0946. Rated "MEDIUM (HIGH if read literally)".

**Closed on 6729b3436 for both reproduced cases.** Real controller, stubbed runtime. The b0d2f0946 result in the first row is from r392's probe P1. I re-ran the other two rows on b0d2f0946 myself:

| Case | b0d2f0946 | 6729b3436 |
| --- | --- | --- |
| Start out, Cancel, wait | Returned at once. The /end went out after the wait | Waits for the answer and the /end (`session.test.ts:1693`) |
| Start out, no Cancel, wait | Returned at once. Session reached `consent`, 0 /end (my P1, P8) | Cancelled. Waits, 1 /end, `ended`, registry empty (`session.test.ts:1717`; P8) |
| Start fails during a delete wait | `failed`, no Cancel, wait had returned (P7) | Waits, 0 /end, `cancelled`, registry empty (P7) |

**My severity:**

- M3 as written: closed, so no longer counted. On its original text at b0d2f0946, I read it as MEDIUM, as r392 did, because no /end was in flight and the sequence is hard to reach by hand.
- What remains: L12, L13 and L14, each LOW.

**Would M3 make the verdict NOT CLEAN if read as HIGH?**

- **At b0d2f0946: yes.** The gate is BLOCKER or HIGH.
- **At 6729b3436, for the r392 cases: no.** They are fixed, whatever severity they carry.
- **At 6729b3436, if Dispatch extends M3 to L12 and L13: yes.** In both, the wait returns at once with nothing sent, so "NOT settled" fits. I do not read them that way, because each needs a much rarer sequence, as set out below.
- **L14 would not count either way.** It is bounded by design.

## Findings

| ID | Severity | Location | Summary |
| --- | --- | --- | --- |
| L7 | LOW | `registry.ts:41`, `DeleteAccountDialog.tsx:130` | The bound expires with no logged note. Carried from r392. acde9df08 appears to address it (not reviewed) |
| L9 | LOW | `session.ts:430` | The join has no test |
| L10 | LOW | `DeleteAccountDialog.tsx:49` | The value 8,000 is not pinned. Carried from r392. acde9df08 appears to address it (not reviewed) |
| L12 | LOW | `session.ts:561`, `:1376` | `leave()` with the start out removes the early registration |
| L13 | LOW | `session.ts:1100-1104` | Nothing is registered before the start call is reached |
| L14 | LOW | `api.ts:327`, `DeleteAccountDialog.tsx:49` | The start can run 30 s, and the wait stops at 8 s |
| L15 | LOW | `session.ts:1348`, `:1155` | **New in this range.** A reused-session Cancel can leave a dead registry entry |
| L16 | LOW | `session.test.ts`, `session.ts:441`, `:1331` | Test gaps |
| T1 | LOW | Four test suites | Fail twice. Not caused by this range |

### L12. `leave()` with the start out

`leave()` sets `keepRegistered: ours` (`:1376`), and `ours` is false while there is no session yet. So `:561` removes the early registration.

Probe P3: the wait returned at once. When the start answered, 0 /end went out and the session stayed owed to sign-out (`:1142`). b0d2f0946 behaves the same, so this is not new, but the fix does not cover it.

**Why LOW:** `leave()` runs only on unmount (`screens/AgentLive/index.tsx:157`). `usePreventRemove` refuses non-owner removals while the phase is `starting` (`index.tsx:196`), so a real unmount needs something like a tree remount or a language change (`index.tsx:159`). The owner would also have to finish a delete, with emailed code and password, inside the start's 30 s. Reading the code, I found no ordinary route. I did not try it on a device.

### L13. Before the registration

A delete or sign-out during the device key read (`:1100`) finds nothing registered.

Probe P5: the wait returned at once, then the start went out and reached `consent`, registered, with no Cancel. The start would carry the bearer captured at `:1095`. b0d2f0946 behaves the same.

**Why LOW:** the key read is very short. The mic prompt is also before registration, but an OS dialog covers the app. I did not time any of this on a device.

### L14. The bound against the start's own timeout

A start can legitimately take up to 30 s, because it can launch the agent's job before answering. The wait stops at 8 s, and the delete proceeds with no /end sent.

The /end then goes out with the pinned bearer, which may no longer work. Probe P6 simulated a refusal: the /end got a 401, `endFailed` was set, the session stayed registered and there was no retry. What the runtime does with a session whose account has gone was not checked.

This matches the bound the spec asks for. It is LOW for the same reachability reason as L12. L7 makes it silent at this SHA.

### L15. A reused-session Cancel can leave a dead entry

`:1348` keeps the session registered on any Cancel in `starting`. That includes a reused session Cancelled while `wasHeldHere` is out (`:1154`). The return at `:1155` then skips the unregister that `:1140` would have done.

Probe P4: registry count 1 on 6729b3436, 0 on b0d2f0946. A later delete sent 0 /end and returned, so the other device's session is safe.

**The only cost** is a dead callback and a retained controller, until the app restarts.

**Fix if wanted:** `if (phase() !== 'starting') { unregister?.(); return }` at `:1155`.

### L16. Test gaps

- **`session.ts:441`:** removing `await endSettled()` from `startSettled` left all tests green.
- **`session.ts:1331`:** restoring `endSettled()` left all tests green. Note that r392's red test for the M1 path A mutation no longer guards this line, because the callback's `:1106` also covers it.
- **Sign-out with the start held:** no committed test. Only P2 covers it.
- **The real controller at the bound with the start held:** no committed test. Only P1 covers it.

### T1. Four suites that fail twice

The spec says to count any failure that fails twice, so these are counted. None is in the range's two files, and the same four were listed as unrelated in r392.

| Suite | Failure |
| --- | --- |
| `__tests__/lib/string.test.ts` | Cannot find `src/locale/locales/en/messages`. The compiled locale is absent, and compilation is a CI job |
| `plugins/uiSceneLifecycle/__tests__/withUISceneLifecycle.test.js` | "AppDelegate.swift does not match the Expo SDK 54 template" |
| `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts` | Expected substring ending in a newline not found |
| `src/lib/lexicon/__tests__/lexicon.test.ts` | `group/post.json` hash differs from the spike copy |

The working copy is CRLF (`core.autocrlf=true`, and `git ls-files --eol` shows `i/lf w/crlf`), which would explain the last two and possibly the AppDelegate one. I did not prove that with an LF checkout, so the cause is a likely explanation, not a verified one.

`test_library_scale_paging` is not in this suite, so the known flake did not arise.

## Mutations

Each ran against `session.test.ts`, `registry.test.ts`, `sessionHook.test.tsx`, `AgentLive.test.tsx` and `deleteAccountEndsLive.test.ts` (235 tests, all green unmodified). Each was restored afterwards, and none is in this commit.

| Mutation | Result | Red test |
| --- | --- | --- |
| Register after the start call | RED | `session.test.ts:1693`, `:1717` |
| Remove the early registration | RED | `session.test.ts:1693`, `:1717` |
| Remove the Cancel at `:1105` | RED | `session.test.ts:1717` |
| Remove the await at `:1106` | RED | `session.test.ts:1717` |
| Remove `await beginRun` at `:440` | RED | `session.test.ts:1693`, `:1717` |
| Remove `endSettled` at `:441` | **Survived** | L16 |
| `:1331` back to `endSettled` | **Survived** | L16 |
| Remove the race at `registry.ts:41` | RED | `registry.test.ts:38` |
| Bound changed to 8,000,000 | **Survived** | L10 |
| `DeleteAccountDialog.tsx:130` not awaited | RED | `deleteAccountEndsLive.test.ts:19` |
| `:1348` to `keepRegistered: false` | RED | `session.test.ts:1693` |
| Remove the unregister at `:1114` | RED | `session.test.ts:1740` |
| Remove the unregister at `:1131` | RED | 8 tests, including `:1693`, `:1717` |
| Clear `stopping` before `:1145` | RED | `session.test.ts:1636` |
| Remove the join at `:430` | **Survived** | L9 |

## Tests

Jest, `tsc` and ESLint were called directly, because `pnpm` is not on this machine's PATH. The worktree had no `node_modules`, so I used a temporary directory junction to the `node_modules` of worktree 679a9d48, as r392 did. Its `pnpm-lock.yaml` hash matches this branch (`a9459e0f`). The junction was removed before committing, and the target was not changed.

- **Live, session and delete suites:** 15 suites, 351 of 351 passed.
- **Full suite:** 208 suites: 204 passed, 4 failed. 2,722 tests: 2,692 passed, 2 failed, 28 todo. The 4 failing suites are T1, and all 4 failed again on rerun.
- **Typecheck:** `tsc --noEmit -p tsconfig.communities.json`, exit 0. `tsgo` (`pnpm typecheck`) was NOT RUN.
- **ESLint** on `session.ts` and `session.test.ts`: exit 0.

Probes P1 to P8 ran against a stubbed runtime on both 6729b3436 and b0d2f0946, and were not committed.

## Run notes

- **Left on this machine:** `C:\ao\tmp-97b1b11e`, holding my mutation and probe scripts and test logs, with no credentials. I should have put it inside the worktree. The deny-list blocked removing it, and I did not work around that, so someone needs to delete it.
- **Blocked command:** an early shell command of mine included `cat .npmrc`, and the deny-list blocked it as a secrets read. The file was not read. I re-ran the command without it.

## NOT VERIFIED

Anything on a device, the real runtime's behaviour on /end and on start, whether a pinned bearer still works after sign-out or account deletion, and what happens to a session on the runtime after its account is deleted. The range has no native change, and no prebuild was run.

**Verdict: CLEAN. BLOCKER 0, HIGH 0, MED 0, LOW 9.** Subject to the two Dispatch calls above. If either is ruled against this reading, the verdict is NOT CLEAN.
