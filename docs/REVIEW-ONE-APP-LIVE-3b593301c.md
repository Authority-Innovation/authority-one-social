# Review: One app Live, build 44, range 784dbc925..3b593301c

Task 0c47c93a. Read-only. Reviewed commit 3b593301c. Nothing merged, built or submitted, and no live system touched.

## Verdict: NOT CLEAN for build 44

Two HIGH findings, both under the rulings as written.

| # | Check | Result |
| --- | --- | --- |
| 1 | F21 | **FINDING, HIGH**: `DeleteAccountDialog.tsx:126`, `state/session/index.tsx:332`, `registry.ts:26`. (a) fails: /end is started, not waited for. (b) and (c) CLEAN |
| 2 | F18 | **FINDING, HIGH**: `session.ts:1040`, `AgentLive/index.tsx:591`. The created-session path is CLEAN. A Cancel answered by a reused session reads "Live session ended." with nothing ended |
| 3 | F12 | CLEAN |
| 4 | Earlier closures | CLEAN |
| 5 | Flag gate | CLEAN |
| 6 | Prebuild gate | NOT RUN on Windows |
| 7 | Tests | Live 331/331. Full suite: only the 4 known unrelated suites fail |
| 8 | Typecheck | tsc 0 errors. tsgo 82 errors, all in `src/locale/i18n*.ts` |
| 9 | Scope | CLEAN: 8 files, none outside scope |
| 10 | Device items | NOT VERIFIED |

Lower findings, none of which gate the build: L1 to L4 at the end of this report.

## 1. F21: FINDING, HIGH on (a)

### Paths

- **Delete path:** `src/screens/Settings/components/DeleteAccountDialog.tsx:109` `confirmDeletion`. Line 117 tells the chat service, line 126 calls `endOpenLiveSessions()`, line 127 awaits the server `deleteAccount`, and line 135 calls `removeAccount(currentAccount)`.
- **Removal path:** `src/state/session/index.tsx:322` `removeAccount`. Lines 331-333 end when the account is the current one, and line 335 dispatches `removed-account`.
- **Who reaches it:** only two callers exist. `DeleteAccountDialog.tsx:135` removes the current account. `Settings.tsx:692` removes other accounts, because the rows are filtered to non-current accounts (`Settings.tsx:151`). So in the app today, current-account removal only happens after a delete.

### (a) Delete or current-account removal ends FIRST and waits: FAILS

`endOpenLiveSessions()` returns `void`. It runs `void end().catch(() => {})` (`registry.ts:24-28`), and its docblock says "The end is started, not awaited". Neither caller can wait or see a failure:

- `DeleteAccountDialog.tsx:126-127` sends `deleteAccount` in the same tick.
- `state/session/index.tsx:332-335` dispatches the removal in the same tick.

**Probe (throwaway, not committed):** at the moment `endOpenLiveSessions()` returned, the fake runtime had received **0** /end calls, with `ending=true`. The fetch sits behind `await bearerFor(auth)` (`api.ts:363`), so the delete request is issued before /end goes out. With a 401 on /end, the result after settling was 1 call, no retry, `endFailed=true`.

**Failure scenario:**

1. The owner holds a Live session and deletes the account.
2. /end and `deleteAccount` race. The runtime validates the bearer against the PDS with `getSession` (per `authToken.ts:6-9`).
3. If the delete lands first, /end gets a 401. That is `signed_out`, which stops retries at once (`session.ts:401`).
4. The account is gone and the agent stays live until the session time limit.
5. Nothing in the dialog knows. `removeAccount` at line 135 retries on the deleted bearer. If the Live screen is gone or covered, the owner gets the toast "Open Live again to end it" (`AgentLive/index.tsx:140`), which they can no longer do.

The ruling says "ENDS a held session FIRST, then removes", and this check asks for "waits for it (or handles its failure)". The code does neither. I rated it HIGH on that text.

**Not measured:** whether /end or the delete wins on real networks, and the runtime's actual behaviour after a delete. The 401 path rests on the code comment and the probe's fake runtime, because live systems were out of bounds.

**If Dispatch meant:** if "started first, as logout does" was enough, this drops out. That is what the commit implemented, and its comment says "as logout does". The ruling and this check's wording say otherwise, so that call is Dispatch's.

**Proposed fix (not applied):**

- Have the registry offer an awaitable, bounded form, using `Promise.allSettled` over the same ends.
- Have `confirmDeletion` await it before line 127.
- Decide what a failed /end does to the delete: proceed and tell the owner, or stop.
- `removeAccount` is synchronous by type (`types.ts:50`). If a non-delete caller of current-account removal is ever added, it needs the same treatment.

### (b) Removing a DIFFERENT account calls no /end: CLEAN

`state/session/index.tsx:331` guards on `account.did === currentAgentState.did`, and `Settings.tsx:692` only offers non-current accounts.

### (c) Account switch and sign-out still end: CLEAN

| Path | Line in `state/session/index.tsx` | Test in `sessionHook.test.tsx` |
| --- | --- | --- |
| createAccount | 147 | 242 |
| login | 177 | 162 |
| logoutCurrentAccount | 200 | 197 |
| logoutEveryAccount | 239 | 207 |
| resumeSession (switch) | 280 | 217 |

### Tests, each confirmed by a temporary mutation that was then restored

| Change | Goes red |
| --- | --- |
| Remove the dialog's end call (`DeleteAccountDialog.tsx:126`) | `deleteAccountEndsLive.test.ts` "calls endOpenLiveSessions before the server deleteAccount" |
| Move the dialog's end call after the delete | same test |
| `removeAccount` no longer ends for the current account | `sessionHook.test.tsx:291` "removing the current account (a delete) ends them first..." |
| Move the end after the removal dispatch | same test |
| `removeAccount` ends for every account (revert of (b)) | `sessionHook.test.tsx:301` "removing another account (not the current one) ends nothing" |

**No test covers the wait.** Both tests pass with fire-and-forget, so they pin the call order only. See L2.

## 2. F18: created-session path CLEAN, FINDING HIGH on the reused path

### Handler and copy

- **Cancel:** `AgentLive/index.tsx:272` calls `onEnd`, which calls `controller.end()` (`session.ts:1213`). `stopping` is set at lines 1224-1229.
- **Copy:** `AgentLive/index.tsx:588`, "Stopping the live session."
- **Done hidden:** `index.tsx:677`.
- **No auto-leave:** `index.tsx:178`.
- **Cleared:** `session.ts:1065`, in the `finally` of `begin`.

### Created session: CLEAN

While the start is out the copy is "Stopping". When the start answers, `endOnRuntime` runs inside `begin` (`session.ts:1043`), and `stopping` only clears after /end settles. If /end fails, `endFailed` is set (`session.ts:408`) and the copy is "may not have ended" (`index.tsx:590`), never "ended".

| Mutation | Goes red |
| --- | --- |
| Cancel no longer sets `stopping` | `session.test.ts` "F18: Cancel while the start call is out is “stopping”..." and `AgentLive.test.tsx:1202` "F1: Cancel while the session is starting..." |
| `begin` never clears `stopping` | both of those, and `session.test.ts` "F18: a start that fails after Cancel also clears “stopping”" |
| Stopping copy removed | `AgentLive.test.tsx:1202` |
| Done shown while stopping | `AgentLive.test.tsx:1202` |
| `ended` ignores `stopping` | `AgentLive.test.tsx:1202` |

### FINDING, HIGH: a Cancel answered with `reused: true` says "ended" when nothing ended

The owner taps Cancel during the start, and the runtime answers with the session already open on another device. `session.ts:1040` unregisters and sends no /end, which is correct. But the state keeps `endReason: 'local'` from `end()`, so when `stopping` clears the copy falls to `index.tsx:591`, **"Live session ended."**, while the session is still running.

**Probe (throwaway, not committed), screen level:** Begin, Cancel, start answered `startReused`. Result: 0 /end calls, `goBack` called once, and the copy read `"Live session ended."`.

- **Rule:** "A Cancel that shows 'ended' before the session is ended is a FINDING at HIGH."
- **How long it shows:** `leaveWhenEnded` pops the screen straight away, so the copy is visible only during the pop. The duration on a device is NOT VERIFIED.
- **When it arose:** the branch is unchanged by this commit, so the behaviour predates the range. The F18 ruling makes it a finding, and the new tests only cover `startAwaitingConsent`.
- **Proposed fix (not applied):** on that branch set `endReason: 'left_open'`, the honest copy the panel's own Cancel already gets (`index.tsx:574`), and add a test.

**Same copy, smaller case:** Cancel, then the start fails with a timeout or 5xx. No sid is known, so nothing can be ended, and the runtime may or may not have created a session. The copy still reads "Live session ended." during the pop. The fix for this case is a wording choice.

## 3. F12: CLEAN

No "ended" copy while /end is in flight or failed, across the screen touched:

- `AgentLive/index.tsx:586-591`: stopping, then ending, then failed, then "ended", in that order.
- `index.tsx:544-547`: `reconnect_failed` says "has ended" only when neither ending nor failed.
- `index.tsx:175-179`: no auto-leave while ending, stopping or failed.
- `index.tsx:677`: no Done while ending or stopping.
- `session.ts:387` and `408`: `ending` and `endFailed` set around the attempts.

The reused path above involves no /end in flight or failed, so it breaks the F18 ruling rather than this narrower check.

`index.tsx:580` ("has ended") is `ended_elsewhere`, where the runtime itself says the session is gone. Out of scope for this rule, and true.

## 4. Earlier closures: CLEAN

- **`begin` refactor:** `git diff -w` shows the move to `beginSession()` changes no logic, only one reformatted line (`canTakeOver`). The rest of the controller diff is the `stopping` field and its wrapper.
- **F11:** `state/session/index.tsx:147-148` ends, then dispatches the switch. Test `sessionHook.test.tsx:242`; a failed create ends nothing, test `:268`.
- **Notification tap never /end:** `useAccountSwitcher.ts:43` sets `keepLive`, `state/session/index.tsx:276` honours it. Test `sessionHook.test.tsx:232`.
- **P1:** `session.ts:1095`, test `session.test.ts:282`.
- **P2:** `session.ts:794-795`, per ladder, test `session.test.ts:1825`.
- **P3:** `session.ts:1245-1261`, `AgentLive/index.tsx:155-157`, tests `AgentLive.test.tsx:1230`, `1327`, `1355`.
- **P4:** `session.ts:481-485`, tests `session.test.ts:393`, `1739`, `1755`, `1769`.
- **P5:** `session.test.ts:1794` block, every refusal path pinned, and it passes.
- **Refusal rule:** `session.ts:477-480`. Only the owner's actions end after a refusal, and the 16 s give-up ends only on an outage (`:481`, `OUTAGES` at `:513`). The new delete call goes through `controller.end()` with `owner: true`, the same as sign-out, so it is an owner action.
- **Reused session on delete:** a session open on another device and not taken over here is not ended by a delete or removal (`session.ts:474`, and the panel path at `:1221`). This follows the existing rule, and the F21 ruling speaks of a "held" session. Noted so Dispatch can correct it if a delete should end those too.

## 5. Flag gate: CLEAN

Only `development-live` sets the flag true (`eas.json:103`). All 8 other profiles are "false" (`eas.json:16, 45, 74, 130, 163, 196, 228, 261`). `flag.ts` requires exactly `'true'`.

| New path | Gating |
| --- | --- |
| `state/session/index.tsx:147` (F11) | Inert off: the registry set is empty |
| `state/session/index.tsx:331-333` (removeAccount) | Inert off, same reason |
| `DeleteAccountDialog.tsx:126` | Inert off, same reason. The import is only `registry.ts`, which has no dependencies (test `sessionHook.test.tsx:315`) |
| `session.ts` `stopping`, `beginSession` | Inside the flag: the controller is only made under `AGENT_LIVE_ENABLED` (`AgentLive/index.tsx:72`, `128`) |
| `AgentLive/index.tsx:178, 588, 677` | Inside the flag, same gate |

The only registrant is `session.ts:1032`, and the only controller is made behind that gate, so with the flag off `endOpenLiveSessions()` loops over nothing and sends nothing. Android is also gated off at `index.tsx:72`.

## 6. Prebuild gate

**Prebuild: NOT RUN on Windows.**

Native changes in 784dbc925..3b593301c: **none**. No file under `ios`, `android`, `modules` or `plugins`, and no change to `app.config`, `package.json`, the lockfile, `patches` or `eas.json`. The Mac still runs `expo prebuild --platform ios --no-install --clean` flag off and on.

## 7. Tests

`NODE_ENV=test jest --forceExit --maxWorkers=4` at 3b593301c, with no local `.env`. Dependencies came from another worktree whose `package.json`, lockfile and `patches` match 3b593301c (`f2caccaa`), through a temporary junction.

- **Live suites** (`src/features/agentLive`, `src/screens/AgentLive`, `src/screens/Settings/components/__tests__`): 14/14 suites, 331/331 tests.
- **Full suite:** 201 of 205 suites pass. 2659 tests pass, 2 fail, 28 todo.

The 4 failing suites are the known unrelated ones, none touched by this range, and are not counted:

| Suite | Reason |
| --- | --- |
| `__tests__/lib/string.test.ts` | Compiled locale `messages` missing (suite did not run) |
| `src/lib/lexicon/__tests__/lexicon.test.ts` | `group/post.json` hash differs from the spike copy |
| `plugins/uiSceneLifecycle/__tests__/withUISceneLifecycle.test.js` | AppDelegate template does not match (suite did not run) |
| `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts` | Expected source substring not found |

The commit message reports 2673 passing and 2 failing suites. This run has 2659 and 4. The two extra failing suites account for at least part of the gap of 14; I did not reconcile it further.

New tests:

- **F21:** `deleteAccountEndsLive.test.ts`; `sessionHook.test.tsx:291`, `:301`.
- **F18:** `session.test.ts` "F18: Cancel while the start call is out...", "F18: a start that fails after Cancel..."; assertions added to `AgentLive.test.tsx:1202`.

## 8. Typecheck

- `tsc --noEmit -p tsconfig.communities.json`: exit 0, 0 errors.
- `tsgo -p tsconfig.check.json`: exit 2, 82 errors, all in `src/locale/i18n.ts` and `src/locale/i18n.web.ts` (41 each). None in a file this range changed.

## 9. Scope: CLEAN

All 8 changed files, none outside the named areas:

- `src/features/agentLive/session.ts`: session controller
- `src/features/agentLive/__tests__/session.test.ts`
- `src/features/agentLive/__tests__/sessionHook.test.tsx`
- `src/screens/AgentLive/index.tsx`: Live screen
- `src/screens/AgentLive/__tests__/AgentLive.test.tsx`
- `src/screens/Settings/components/DeleteAccountDialog.tsx`: account removal
- `src/screens/Settings/components/__tests__/deleteAccountEndsLive.test.ts`
- `src/state/session/index.tsx`: account removal

## 10. Device items: NOT VERIFIED

Physical swipe, lock screen, phone call, notification tap, account removal on device, permissions, background, stage rendering, iOS archive. Also: how long the F18 copy shows during the pop, and /end against delete timing on a real network.

## Lower findings (do not gate)

- **L1, LOW, ruling question, `DeleteAccountDialog.tsx:126`.** A delete the server refuses (wrong code or password, lines 144-146 send the owner back to retry) has already ended Live, with the account intact. `login` avoids this on purpose (`state/session/index.tsx:174-176`, review f2caccaa F7). It follows from "ends first", so it is for Dispatch to accept. The chat-service delete at line 117 also runs before the end.
- **L2, LOW, tests, `deleteAccountEndsLive.test.ts:20`.** The test is an `indexOf` on source text. With the call removed and `// endOpenLiveSessions()` left in a comment, it stays green (mutation run). `sessionHook.test.tsx` mocks the registry, so neither test can see whether /end was waited for. The fix for F21 should bring a test that gates /end and asserts `deleteAccount` is not sent until it settles.
- **L3, LOW, copy, `AgentLive/index.tsx:588`.** The ruling says "Stopping…"; the string is "Stopping the live session." The meaning holds and it matches its sibling "Ending the live session." Noted because the ruling quotes the text.
- **L4, LOW, `AgentLive/index.tsx:191-197, 213`, by reading only.** While `stopping` with /end not yet started, `open` and `ending` are both false, so the back swipe is enabled, and there is no Done or Leave anyway for up to 30 s (`LIVE_START_TIMEOUT_MS`). Swiping away loses nothing: `leave()` returns early, `begin` still ends the session, and a give-up becomes a toast. It does skip the "no leaving while out" behaviour. Also, `begin()` clears `stopping` even on a re-entrant call that returns at once (`session.ts:995`, `1065`). The UI cannot make that call, because Begin is unmounted by then.

## How this was run

- The worktree started at 571924785, not 3b593301c. The review branch `review/3b593301c-one-live-b44-r371` was created from 3b593301c.
- Mutations and probes were applied to the working tree only, restored after each run, and never committed. The temporary files and the `node_modules` junction were removed before the commit.
- Commands ran as `node_modules/.bin/jest` and `tsc`/`tsgo` directly, as this task specified, rather than through the pnpm scripts.
