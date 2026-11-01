# Review: One app Live mode, build 43, 0dcc84ad3..c23bdc031

Task d99ba0bd. Independent, read-only re-review of `fix/agent-live-review-2026-11-01` @ c23bdc031 (f26828a0e plus c23bdc031), against review 302c2986 (b273f7cf9). No device run, no deploy, no EAS, no TestFlight, no live system touched. The feature branch was not changed.

## Verdict: NOT CLEAN for build 43 (1 HIGH, which depends on question 1)

P1, P2, P3 and P4 are closed as they were reported, and P5 is closed except for the gaps below. All four mutations named in the brief turn a test red. Blur, background and unmount send no `/end`, and no refusal path sends one.

The one HIGH comes from check 4, which rates any `/end` trigger outside End, a deliberate navigation, Cancel or sign-out as HIGH:

- **HIGH: F1. A notification tap can still send `/end` on this device's own running session.** The path is not in the changed lines, but the ruling applies to every `/end`, and `index.tsx:215-219` says a notification does not end Live.
  - **F1a: a push for another account.** `useNotificationHandler.ts:240` calls `onPressSwitchAccount`, then `useAccountSwitcher.ts:40`, `state/session/index.tsx:275`, `registry.ts:26`, `session.ts:1012` and `end()` with `owner: true` (`session.ts:1192-1195`). Any owner with two accounts can reach it.
  - **F1b: a push that opens `/notifications`.** `useNotificationHandler.ts:294` calls `resetToTab`, whose `popToTop` (`Navigation.tsx:1268`) reaches `usePreventRemove` (`index.tsx:187-189`), then `onEnd` and `end()` with `owner: true`. This only happens when Live is in the notifications tab's stack, so it is narrow. A probe on a real navigator showed the prevent-remove callback firing on `popToTop`, including with another screen pushed over Live. The stand-in screen used the same hook; the real Live screen was not on a device.
- **MEDIUM: F2. The screen says both "ended" and "wasn't ended" for the same session.** Failure `agent_unavailable` (`index.tsx:529`) and a client-initiated drop (`index.tsx:560`) now send no `/end`, but their message still says the session ended, directly above the `leftRunning` line (`index.tsx:571-580`). Probes C1 and C2 rendered both texts with 0 `/end` calls.
- **MEDIUM: F3. A refused camera proof is forgotten by the ladder it starts.** `session.ts:621` records it, `session.ts:1175` calls `rejoinWithoutCamera` (`:969`), and `session.ts:777` clears it. Five outages then send `/end` (probe S1: `reconnect_failed`, 1 `/end`). No test covers this. See question 2.
- **MEDIUM: F4. Four mutations stay green (P5 remainder).** `network`, `http` and `bad_response` can be removed from `OUTAGES` (`session.ts:497-500`), and the `leftRunning` line can be hidden (`index.tsx:571`), with no test turning red. Probes O1 to O4 show the outage code itself is right.
- **LOW:** F5 to F10, section 7.

**Questions for the orchestrator (they decide the verdict):**

1. **Does a notification tap count as an explicit user action?** Specifically: is an account switch "sign-out", and is a notification tap that switches account or pops the stack "deliberately navigating away"? The ruling lists End, navigating away, Cancel and sign-out; it does not list an account switch, though the README (`README.md:76`) adds one. Without `/end` at a switch the old bearer is gone, so the session runs to its time limit unless the owner returns to that account. **If both answers are yes, F1 falls to LOW, the highest finding is MEDIUM, and this is clean for build 43 under the "any BLOCKER or HIGH" rule.** If only the plain switcher tap is allowed, the fix is to stop the notification paths from ending a running Live.
2. **F3: is the ladder after a refused camera proof a new ladder?** I rated it MEDIUM. The ladder's own rungs are all outages, which the per-ladder rule allows, but a refused proof started that ladder, and `rejoin(false, true)` (`:723`) records exactly that case for a removal. If you read "never on a refusal" as covering this, it is HIGH.

| # | Check | Result |
| --- | --- | --- |
| 1 | P1: `admitted: false` | CLEAN (`session.ts:1063-1068`; `session.test.ts:282`) |
| 2 | P2: refusal record per ladder | CLEAN (`session.ts:777-778`, read at `:466`; `session.test.ts:1657`). FINDING, MEDIUM (F3, `:1175`) |
| 3 | P3: blur, background, unmount | CLEAN (`index.tsx:221-223`, `:153`; no AppState listener) |
| 4 | P3: explicit triggers only | **FINDING, HIGH (F1, `session.ts:1012`, `index.tsx:187-189`)** |
| 5 | P4: the end call sites | CLEAN (table in section 2). No end call fires on a refusal. FINDING, MEDIUM (F2, `index.tsx:529`, `:560`) |
| 6 | P5: test gaps and mutations | Named mutations all RED. FINDING, MEDIUM (F4). LOW (F5) |
| 7 | Non-refusal outage | CLEAN in code (`session.ts:469`, `:496-504`). FINDING, MEDIUM (F4: first-join network, http, garbled have no test) |
| 8 | The split | CLEAN on all three panels |
| 9 | No path ends another device's session | CLEAN (`session.ts:463`). FINDING, HIGH (F1, on this device's own session only) |
| 10 | Earlier closures | CLEAN (section 5). Device items NOT VERIFIED |
| 11 | Flag gate | CLEAN (`eas.json:103`) |
| 12 | Tests | Live 312/312. Full suite: 4 suites fail, none Live, none in the range |
| 13 | Typecheck | tsc clean. tsgo 82 errors, all in `src/locale`, 0 elsewhere |
| 14 | Prebuild gate | NOT RUN (Windows). No native change |
| 15 | Scope | 5 files, all Live. None outside |
| 16 | Device items | NOT VERIFIED |

**P1 to P3: P1 CLEAN. P2 CLEAN as reported, with F3 MEDIUM on the camera path. P3 blur, background and unmount CLEAN. P3's "explicit triggers only" is FINDING, HIGH (F1).**

**Prebuild gate: NOT RUN on Windows. The Mac runs `expo prebuild --platform ios --no-install --clean` flag off and on. No native change in the range.**

**Flag gate: CLEAN. Only `development-live` sets the flag true (`eas.json:103`; the other 8 profiles are false; `buildGate.test.ts:57`). `eas.json` is not in the range. No new code runs outside the flag.**

**The split: CLEAN. Bound non-holder "Still open on your other device", no takeover, End. Unbound "Couldn't reconnect", End. Holder "Still open on your other device" plus "Take over here", End.**

## 1. How the rule works at c23bdc031

`finish()` (`session.ts:428`) decides, unless the call is the panel's End (`everywhere`):

| Line | Rule | Effect |
| --- | --- | --- |
| `:463` | Reused and not taken over | No `/end`, even for the owner. Copy `left_open` or `still_open_elsewhere` |
| `:466` | Not the owner, and `s.refused` | No `/end`. Copy `refused` or `refused_reconnect` |
| `:469` | Not the owner, and not an outage | No `/end`. `leftRunning: true` |
| `:483` | Otherwise | `endOnRuntime` |

`OUTAGES` (`:496-502`) holds `network`, `unavailable`, `http`, `bad_response` and `reconnect_failed`. A refused `http` 4xx is caught at `:466` first because `noteRefusal` has marked the session. A timeout is `network` (`api.ts:342`), 503 is `unavailable` and other 5xx is `http` (`api.ts:383-386`).

## 2. Every `/end` and every end call (checks 4, 5, 9)

`/end` has three call sites: `session.ts:483` (from `finish`), `:1022` (from `begin`) and `:1227` (from `retryEnd`).

Sites that can send `/end`:

| Site | Trigger | Refusal branch | Test |
| --- | --- | --- | --- |
| `session.ts:1192-1195` `end()`, from `index.tsx:169` `onEnd` | Stage End (`index.tsx:299`), Cancel (`:253`, `:276`), Not now or Done (`:267`, no `/end` there), back (`:188`) | Owner: sends even after a refusal; not on a reused session not taken over | `AgentLive.test.tsx:723`, `:1044`, `:1084`, `:506`; `session.test.ts:294`, `:1479`, `:1848` |
| `session.ts:1012` registry, to `end()` or `retryEnd()` | Sign-out (`state/session/index.tsx:197`, `:236`); account switch (`:174`, `:275`); **a notification for another account (F1a)** | As `end()` | `session.test.ts:1189`, `:741`; `AgentLive.test.tsx:1231` |
| `index.tsx:187-189` back, via `usePreventRemove` | A swipe, the header back, a tab re-press, **and `popToTop` from a notification (F1b)** | As `end()` | `AgentLive.test.tsx:1044` (back only) |
| `session.ts:1202-1205` `endOpen()`, from `index.tsx:265` | The panel's "End the live session" | Every device, the owner's explicit action | `AgentLive.test.tsx:1003` |
| `session.ts:1022` in `begin` | Cancel while the start call is out, not reused, not `screenLeft` | None: no session yet | `AgentLive.test.tsx:1084` |
| `session.ts:1227` `retryEnd`, from `index.tsx:285` | "Try again" on the failed-end panel, or the registry | The owner's action | `session.test.ts:1153` |
| `session.ts:884` `fail('reconnect_failed')` | The ladder ran out | `:466` blocks a refused ladder; `:463` blocks a reused one | `session.test.ts:1502`, `:1635`, `:480` |
| `session.ts:903` first mint, `:919` first join catch, `:1060` consent call | An outage kind only | `noteRefusal` (`:902`, `:621`, `:1059`), blocked at `:466` | `session.test.ts:1612`; F4 for the rest |

Sites from the prior report, at their new lines. None of them sends `/end`:

| Prior line | Now | What it is | Why no `/end` | Test |
| --- | --- | --- | --- | --- |
| `:636` | `:686` | Client-initiated drop | `:469` (`local` is not an outage) | `session.test.ts:393` |
| `:819` | `:873` | `server_outdated` in the ladder | `:469` | `session.test.ts:1571` |
| `:865` | `:919` | First join catch: `connect`, `bad_proof`, `server_outdated` | `:469` or `:466` | `session.test.ts:2056`, `:2076`, `:1601` |
| `:1011` | `:1070` | `no_join` (was `unavailable`) | `:469` | `session.test.ts:1587` |
| `:1017` | `:1076` | `agent_unavailable` | `:469` | `session.test.ts:1328` |
| `:1134` | `:1192-1195` | `end()`, now only for owner actions | Blur and unmount no longer call it | `AgentLive.test.tsx:1203`, `:1231` |
| `:434` | `:466` | The refusal rule, reading the per-ladder record | n/a | `session.test.ts:1635`, `:1657` |

**No path ends another device's session** without the owner's explicit panel End. The guard at `:463` runs before the owner check, so a reused session not taken over is safe from `end()`, a back and sign-out as well. `leave()` keeps nothing owed on it (`:1216`; `session.test.ts:1561`, `AgentLive.test.tsx:952`). F1 only reaches sessions this device holds.

## 3. P1 to P3 in detail

**P1 (check 1).** `session.ts:1006-1008` at c23bdc031 is now the start reply's destructuring. The old guard moved to `:1063-1068`: `s.refused = true`, then `fail('consent_incomplete')`, which `:466` turns into `ended`/`refused` with no `/end`. The test is `session.test.ts:282` (old `:280`, rewritten). Restoring the old behaviour (mutation P1c) turns it red.

**P2 (check 2).** `s.refused` lives on the `Session` object (`:314`), but `rejoin()` rewrites it at each new ladder: `:777` clears it unless the ladder carries on, and `:778` sets it if the drop that started the ladder was itself a refusal. `session.test.ts:1657` shows a recovered refusal not blocking `/end` on a later outage-only ladder, and it goes red when `:777` is removed. `session.test.ts:1635` covers one refused rung in the same ladder. See F3 for the camera exception.

**P3 (check 3).**

| Hook | Line | What it does | Test |
| --- | --- | --- | --- |
| Navigation blur | `index.tsx:221-223` | `setOnScreen(false)` only | `AgentLive.test.tsx:1203`, `:942` |
| Navigation focus | `index.tsx:224-229` | `setOnScreen(true)`, `left.current = false` | `AgentLive.test.tsx:1013` |
| Unmount | `index.tsx:148-154` | `detach`, then `leave()`, which leaves the room and sends no `/end` (`session.ts:1208-1222`) | `AgentLive.test.tsx:1231`, `:1106`; `session.test.ts:1521`, `:1535` |
| AppState and background | none | A grep of `src/features/agentLive` and `src/screens/AgentLive` finds no listener, so nothing to fire. Behaviour on a device is NOT VERIFIED | `backgroundAudio.test.ts` covers audio config only |

A session left by `leave()` stays registered and is owed to sign-out, unless it is another device's. `session.test.ts:1521`, `:1535` and `:1561` pin this.

## 4. Mutations (check 6)

45 single mutations. Each ran `session.test.ts`, `AgentLive.test.tsx` and `sessionHook.test.tsx` (199 tests), and the source was restored after each.

**The brief's four, all RED:**

| Mutation | Result | Test that went red |
| --- | --- | --- |
| Remove the `admitted: false` guard (P1b; also P1a, P1c) | RED | `session.test.ts:282` |
| Make the refusal record per session (P2: remove `:777`) | RED | `session.test.ts:1657` |
| Add `/end` on blur (P3a) | RED, 2 | `AgentLive.test.tsx:1203`, `:942` |
| Add `/end` on unmount (P3b) | RED, 2 | `AgentLive.test.tsx:1231`, `:1106` |

**The rest, RED (33):**

- **New-ladder record and `leave()`:** P2b, P3c to P3g.
- **Rules:** P4a (`:469`, 8 red), P4b (`:466`, 13 red), P4c to P4g.
- **Refusal paths:** P5a (the one-refused-rung test, `session.test.ts:1635`), P5c, P5d, P5e, P5f (e, `:1690`), P5g (e2, `:1710`), P5h and P5i (b3, `:1732`).
- **The End tests:** End1 (`owner` removed, 30 red), End2 (screen End calls `leave`, 13 red; includes `AgentLive.test.tsx:723`), End3, End4, End5, End6.
- **Outages:** Out1, Out3.
- **Other:** back swipe no longer ends (`:1044`), and Split1 to Split3.

**GREEN (6):**

| Mutation | Line | What it shows | Rating |
| --- | --- | --- | --- |
| Out2: `network` not an outage | `session.ts:497` | No test for a first-join network failure or timeout. Probe O1: 1 `/end` | MEDIUM (F4) |
| Out4: `http` not an outage | `session.ts:499` | No test for a first-join 5xx other than 503, or 408. Probes O2, O4: 1 `/end` | MEDIUM (F4) |
| Out5: `bad_response` not an outage | `session.ts:500` | No test for a garbled first-join reply. Probe O3: 1 `/end` | MEDIUM (F4) |
| Copy: `leftRunning` line hidden | `index.tsx:571` | `agentLiveLeftRunning` has no screen test at all | MEDIUM (F4) |
| P5b: ladder mint refusal not noted | `session.ts:791` | No effect on `/end`: `:469` catches it. Only the copy and flag change | LOW (F5) |
| P5j: `signed_out` not a refusal | `session.ts:535` | No effect on `/end`: `:469` catches it | LOW (F5) |

## 5. Earlier closures (check 10)

| Item | Where | Status | Test |
| --- | --- | --- | --- |
| H1: failed `/end` is a toast off screen | `session.ts:403-406`, `index.tsx:133-139` | CLOSED | `AgentLive.test.tsx:842`, `:870`, `:1106`; `session.test.ts:805` |
| H2: bounded `/end`, Leave at 8 s, mic off | `session.ts:238`, `:240`, `:386-398`, `:475`; `index.tsx:588-608` | CLOSED | `AgentLive.test.tsx:732`, `:802`; `session.test.ts:780`, `:1153` |
| H3: drawer lock | `index.tsx:213-214` | CLOSED. Device NOT VERIFIED | `AgentLive.test.tsx:1183` |
| H4: swipe on again | `index.tsx:200-203` | CLOSED. Device NOT VERIFIED | `AgentLive.test.tsx:1195` |
| H5: stale comment | `index.tsx:205-208` | CLOSED. New stale comments in F8 | n/a |
| G4: mic intent | `session.ts:361`, `:849`, `:912` | CLOSED by reading. The prior LOW on the argument was not re-run | `session.test.ts:875` |
| Prove body `{token, sig}`, no exchange | `api.ts:249`, `:257-259` | CLOSED | `api.test.ts:204`, `:216` |
| Ladder 1/2/4/8/16 s, no reset on a refused rung | `rejoin.ts:36-37`, `session.ts:784` | CLOSED. See F7 for a non-refused drop | `session.test.ts:480`, `:1061` |
| After 16 s "Couldn't reconnect" | `session.ts:884`, `index.tsx:525` | CLOSED | `session.test.ts:480`, `:1502` |
| 16 s give-up: outage versus refusal | `session.ts:466`, `:519-522`; `index.tsx:548` | CLOSED | `session.test.ts:1502`, `:1458`, `:1635`; `AgentLive.test.tsx:684` |
| Bound removal outside 10 s is final | `session.ts:726-730`, `rejoin.ts:47` | CLOSED | `session.test.ts:1061` |
| Refused mint final (4xx except 401, 408, 429) | `session.ts:813-828`; 401 at `:807` | CLOSED, no `/end` | `session.test.ts:1086`, `:1732`, `:1749` |
| Unbound wait | `session.ts:719-724` | CLOSED | `session.test.ts:955`, `:989`, `:1710` |

**The split (check 8).** The title is at `index.tsx:440-444`, the takeover button at `:465-476`, End at `:477-486`, and the holder decision at `session.ts:1030-1033`.

| Panel | Text and actions | Test |
| --- | --- | --- |
| Holder | "Still open on your other device", "Take over here", End | `AgentLive.test.tsx:912` |
| Bound non-holder | "Still open on your other device", no takeover, End | `AgentLive.test.tsx:924`, `:936` |
| Unbound | "Couldn't reconnect", no takeover, End | `AgentLive.test.tsx:962` |

`continueHere` also refuses a takeover without `canTakeOver` (`session.ts:1041`).

**Non-refusal outage (check 7).** `/end` goes out through `session.ts:469` (not blocked) and `:483`. Tests: a ladder of outages (`session.test.ts:1502`, `:480`), 408 and 429 (`:1732`), and a 503 on the first proof (`:1612`). Probes O1 to O4 confirm `/end` on the consent call for a network failure, 500, a garbled reply and 408. There are no permanent tests for those (F4). See F9 for a failed media join.

## 6. Findings

**F1, HIGH: a notification tap can send `/end`.** Summary at the top.

- **Why it is in this review:** check 4's wording, and P3's own comment at `index.tsx:215-219`. Nothing in the range adds these paths.
- **What the range changes:** blur no longer ends Live, so a session now lives on under other screens, and a tab re-press (`BottomBar.tsx:110`) or `popToTop` can reach it there. A tab re-press is the owner's tap, so I count it as deliberate. The notification paths are the ones I cannot place under the ruling.
- **Limit:** F1a was traced by reading, plus `session.test.ts:1189` for the registry end. F1b was probed on a real navigator with a stand-in screen. Neither was run on a device.

**F2, MEDIUM: contradictory copy.** Probes, real screen, 0 `/end` in both:

- C1 (`agent_unavailable`): "Your agent couldn't start, so the live session has ended. Try again later." followed by "The live session wasn't ended: open Live again to end it, or it ends on its own at its time limit."
- C2 (client drop): "Live session ended." followed by the same line.

`AgentLive.test.tsx:895` pins the first sentence of C1 and not the second. The range already rewrote the `server_outdated` copy for this reason (`index.tsx:523`), and these two were missed.

**F3, MEDIUM: refused camera proof.** Probe S1: live, camera on, token `tokenCamera`, proof 401, then five 503 mints. Result: `failed`/`reconnect_failed`, 1 `/end`, and the copy "Couldn't reconnect, so the live session has ended." The fix would be `rejoin(false, true)` from `rejoinWithoutCamera` when the failure was a refusal, plus a test.

**F4, MEDIUM: green mutations.** See section 4. The code is right on all four; the gap is tests.

## 7. LOW

- **F5: P5b and P5j stay green.** No effect on `/end`, because `:469` also blocks. Only `leftRunning` and the copy differ.
- **F6: `leave()` sets `endPending` after the await (`session.ts:1221`).** A sign-out while the room is disconnecting finds nothing owed and sends no `/end` (probe S2: 0, then 1 on a second sign-out). The window is short, and a real sign-out calls the registry before it unmounts. Moving the assignment above the `await` closes it.
- **F7: a non-refused drop in a rung resets the ladder and the record (`session.ts:763`, then `:777`, `:784`).** Probe S3: a refused rung, then an accepted proof with an instant network drop, then outages: 1 `/end`. The accepted proof means the refusal did recover, so this fits the ruling. The budget reset predates the range.
- **F8: stale comments.** `session.ts:438-439` still lists "leaving or covering the screen" as owner actions, the opposite of the ruling. `index.tsx:179-183` still says "no way out that skips /end".
- **F9: a failed media join on the first connect sends no `/end` (`session.ts:919`; `connect` is not in `OUTAGES`).** The ruling allows `/end` here and does not require it, and a rejection cannot be told apart from a refusal, so the choice is defensible. `session.test.ts:2056` pins it. In the ladder the same failure does end with `/end`.
- **F10: a `leftRunning` session is not owed to sign-out (`session.ts:481`), while a `leave()` session is.** Probe S5: 0 `/end` on sign-out after a client drop. The copy promises nothing about sign-out. Allowed by the ruling, but inconsistent.

## 8. Tests (check 12)

**Live suites:** pattern `features/agentLive|screens/AgentLive|state/shell`: **14 suites, 312 tests, all passed** (293 at the prior review). Without `state/shell`: 13 suites, 309 tests, all passed.

**Full suite, `NODE_ENV=test jest --forceExit --maxWorkers=4`: 198 of 202 suites passed; 2633 passed, 2 failed, 28 todo, of 2663.** Exit code not captured; the suite reported failures.

| Failed suite | CRLF checkout (this run) | LF | Live? |
| --- | --- | --- | --- |
| `src/lib/lexicon/__tests__/lexicon.test.ts`, group/post.json (Communities) | Fails | NOT RUN here. Prior report: still fails | No |
| `__tests__/lib/string.test.ts`: cannot find `locale/locales/en/messages` (compiled by CI) | Fails to run | NOT RUN here. Prior report: fails | No |
| `plugins/uiSceneLifecycle/__tests__/withUISceneLifecycle.test.js` | Fails to run | NOT RUN here. Prior report: passes | No |
| `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts` | Fails | NOT RUN here. Prior report: passes | No |

None of these four suites' test files is in the range.

**New or rewritten tests:**

| Item | Test |
| --- | --- |
| P1 | `session.test.ts:282` |
| P2 | `session.test.ts:1657`, `:1635` |
| P3 | `AgentLive.test.tsx:1203`, `:942`, `:952`, `:1106`, `:1231`; `session.test.ts:1521`, `:1535`, `:1561` |
| P4 | `session.test.ts:393`, `:1328`, `:1571`, `:1587`, `:1601`, `:2056`, `:2076` |
| P5 | a3 `session.test.ts:1635`, d `:1676`, e `:1690`, e2 `:1710`, b3 `:1732`, b5 `:1749`; m2 `AgentLive.test.tsx:684`, n6 `:936`, m3 `:952`; End `AgentLive.test.tsx:723` |

## 9. Typecheck (check 13)

- `tsc --noEmit -p tsconfig.communities.json`: exit 0.
- `tsgo -p tsconfig.check.json`: exit 2, 82 errors, **all 82 in `src/locale`**, 0 elsewhere. The same as the prior report: the compiled messages are absent here, and I did not compile them (CLAUDE.md, CI's job).

## 10. Prebuild (check 14)

**NOT RUN on Windows.** The Mac runs `expo prebuild --platform ios --no-install --clean` flag off and on. No native file, config plugin, `app.config`, `eas.json` or `package.json` is in the range.

## 11. Scope (check 15)

`git diff --stat 0dcc84ad3..c23bdc031`: 5 files, 499 insertions, 74 deletions.

- `src/features/agentLive/README.md`
- `src/features/agentLive/__tests__/session.test.ts`
- `src/features/agentLive/session.ts`
- `src/screens/AgentLive/__tests__/AgentLive.test.tsx`
- `src/screens/AgentLive/index.tsx`

None is outside the Agent Live client, the session controller, the reuse panel, the navigation or the Live screen. `b273f7cf9..c23bdc031` also shows the prior report removed, only because that report lives on the review branch and not here.

## 12. Device-only items (check 16)

NOT VERIFIED, all of them: the physical swipe, backgrounding the app on a device (including whether LiveKit itself drops or keeps the room), the lock screen, a phone call, permissions, stage rendering, the iOS archive, and a real notification tap while Live is running (F1).

## 13. How this was run

- The worktree's local `fix/agent-live-review-2026-11-01` was at 571924785, not the head. `origin/fix/agent-live-review-2026-11-01` is c23bdc031, and this review branch was created from that commit. Neither feature ref was changed.
- `node_modules` was a junction to `C:\ao\worktrees\f2caccaa-independent-priority-hig\node_modules` (`pnpm-lock.yaml` identical; `package.json` the same apart from line endings), used read-only and removed before the commit. Jest and tsc ran directly because `npx` stops on `devEngines` here (node 24.14.0 against `^24.15.0`).
- Mutations and probes used temporary files and source edits that were restored. The tree was clean before this report was added. Probes are not committed.
