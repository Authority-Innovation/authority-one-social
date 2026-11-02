# Review: One app Live, build 44, range 784dbc925..5a8dd2603

Task a5fcff70. Supersedes 0c47c93a (verdict 632a8d0bf on 3b593301c). Read-only. Reviewed commit 5a8dd2603. Nothing merged, built or submitted, and no live system touched.

## Verdict: NOT CLEAN for build 44

F21 and F18, the two HIGHs from the last verdict, are both still open. Neither of the two commits after 3b593301c touches them: `git diff 3b593301c..5a8dd2603` shows no change to `DeleteAccountDialog.tsx`, `state/session/index.tsx` or `registry.ts`, and the `begin` reused branch is the same code.

Separately, the TextDecoder root cause in commit 5a8dd2603 does not hold up against the installed packages, so the build 43 start failure may not be fixed. See check 5.

| # | Check | Result |
| --- | --- | --- |
| 1 | F21 | **FINDING, HIGH**: `DeleteAccountDialog.tsx:126`, `state/session/index.tsx:332`, `registry.ts:26`. (a) fails: /end is started, not awaited. (b) and (c) CLEAN |
| 2 | F18 | **FINDING, HIGH**: `session.ts:1074`, `AgentLive/index.tsx:591`. Reused Cancel reads "Live session ended." with 0 /end. Created-session path CLEAN |
| 3 | L1 refused delete | **FINDING, MEDIUM**: `DeleteAccountDialog.tsx:126`. Live is ended before the server can refuse the delete |
| 4 | singlePeerConnection | CLEAN: `room/livekit.tsx:73`, used at `:120`. No change to the join gate or R-rules in the code. Dev edge behaviour NOT VERIFIED |
| 5 | TextDecoder | Test without the global: CLEAN. **FINDING, MEDIUM**: `pop.ts:41-44`, the stated root cause is contradicted, and no polyfill install exists in this range |
| 6 | Step logging | CLEAN: no token logged on any path found. LOW: gaps in `scrub` (`session.ts:337`) |
| 7 | On-screen error | CLEAN: no error text reaches the screen, only a fixed code. LOW: no committed token-shaped test at screen level |
| 8 | Earlier closures | CLEAN |
| 9 | Flag gate | CLEAN |
| 10 | Prebuild gate | NOT RUN on Windows. No native change |
| 11 | Tests | Live 339/339. Full suite 2667 pass; only the 4 known unrelated suites fail. Gap to the commit's count reconciled |
| 12 | Typecheck | tsc 0 errors. tsgo 82 errors, all in `src/locale/i18n*.ts` |
| 13 | Scope | CLEAN: 15 files, none outside scope |
| 14 | Device items | NOT VERIFIED |

## 1. F21: FINDING, HIGH on (a)

### Paths

- **Delete path:** `src/screens/Settings/components/DeleteAccountDialog.tsx:109` `confirmDeletion`. Line 126 calls `endOpenLiveSessions()`, line 127 awaits the server `deleteAccount`, line 135 calls `removeAccount(currentAccount)`.
- **Removal path:** `src/state/session/index.tsx:322` `removeAccount`. Lines 331-333 end when the account is current, line 335 dispatches `removed-account`.
- **Registry:** `src/features/agentLive/registry.ts:24-28`. It returns `void` and runs `void end().catch(() => {})`.

### (a) Ends first and waits: FAILS

Nothing can wait on or see the result of /end, because the function returns nothing.

**Probe (throwaway, not committed):** a live session with /end answering 401.

| Moment | /end calls | State |
| --- | --- | --- |
| When `endOpenLiveSessions()` returned (returned `undefined`) | **0** | |
| After settling | 1, no retry | `endFailed: true` |

The fake runtime's 401 stands in for a deleted account's bearer. Whether /end or the delete wins on a real network, and what the runtime does after a delete, are NOT VERIFIED.

**Test that goes red if the await is reverted: none exists, because there is no await.** `deleteAccountEndsLive.test.ts:20` checks source text order only, and `sessionHook.test.tsx` mocks the registry.

**Proposed fix (not applied):**

- Add an awaitable, bounded form to the registry (`Promise.allSettled` over the same ends).
- Await it in `confirmDeletion` before line 127, and decide what a failed /end does to the delete.
- Add a test that gates /end and asserts `deleteAccount` is not sent until it settles.
- Resolve this together with L1, because the two pull against each other (see check 3).

### (b) Removing a different account ends nothing: CLEAN

Guard at `state/session/index.tsx:331`. Goes red if reverted (mutation M6): `sessionHook.test.tsx` "removing another account (not the current one) ends nothing". Removing the guard's end entirely (M7) turns "removing the current account (a delete) ends them first..." red.

### (c) Switch and sign-out still end: CLEAN

| Path | Line in `state/session/index.tsx` | Test in `sessionHook.test.tsx` |
| --- | --- | --- |
| createAccount | 147 | 242 |
| login | 177 | 162 |
| logoutCurrentAccount | 200 | 197 |
| logoutEveryAccount | 239 | 207 |
| resumeSession (switch) | 280 | 217 |

## 2. F18: created-session path CLEAN, FINDING HIGH on the reused path

**Handler and copy:** `AgentLive/index.tsx:167` `onEnd` calls `controller.end()` (`session.ts:1247`), which sets `stopping` at `:1258-1263`. The copy is at `index.tsx:588`, "Stopping the live session." Done is hidden at `:682`, the auto-leave waits at `:178`, and `stopping` clears at `session.ts:1099`.

**Note on line numbers:** the task's `session.ts:1040` is the line from the older tree. The same branch is now `session.ts:1074`.

**Created session: CLEAN.** "Stopping" holds until `endOnRuntime` settles inside `begin` (`session.ts:1077`). A failed /end reads "may not have ended". Tests: `session.test.ts:1558`, `:1582`, `AgentLive.test.tsx:1202`.

**Reused session: FINDING, HIGH.** `session.ts:1074` sends no /end, which is correct, because the session may be live on another device. But `endReason` stays `local` from `end()`, so when `stopping` clears the copy falls through to `index.tsx:591`.

**Probe (throwaway, screen level):** Begin, Cancel, then the start answers.

| Start answered | Copy during | Copy after | /end calls | goBack |
| --- | --- | --- | --- | --- |
| `startReused` | Stopping the live session. | **Live session ended.** | **0** | 1 |
| 503 | Stopping the live session. | **Live session ended.** | **0** | 1 |

The session is still running in the reused case, so the copy is false. In the 503 case no sid is known, and a session may or may not exist. The screen pops straight away, so the copy shows only during the pop; how long that is on a device is NOT VERIFIED.

**No test covers this.** The F18 tests only use `startAwaitingConsent` and a 503 that checks the flag, not the copy.

**Proposed fix (not applied):** on the reused branch set `endReason: 'left_open'`, the copy the panel's own Cancel already gets (`index.tsx:574`), and add a screen test. The 503 case needs a wording choice.

## 3. L1: FINDING, MEDIUM

**Behaviour:** `DeleteAccountDialog.tsx:126` ends Live before line 127 sends the delete. If the server refuses (wrong code or password), lines 137-146 send the owner back to retry with the account intact and Live already ended. `login` deliberately avoids this (`state/session/index.tsx:174-176`).

**This needs a Dispatch decision.** F21 asks for the end to finish before the delete, and L1 asks that a refused delete leave Live alone. Both cannot hold if /end is sent first, unless the delete can be pre-validated or the owner is warned that Live ends either way. The chat-service delete at line 117 also runs before any of this.

## 4. singlePeerConnection: CLEAN

- **Where:** `LIVE_ROOM_OPTIONS` at `room/livekit.tsx:69-74`, flag at `:73`, used by the only `new Room` at `:120`. Not set anywhere else.
- **Why this value:** `false` selects the v0 path and the legacy two peer connections (one publisher, one subscriber). `true`, the SDK default, uses one peer connection and `/rtc/v1` with the join request in the query string. The commit's reason is that the Dev edge's query-size rule answered `/rtc/v1` with a 400, which the SDK treats as final.
- **SDK confirmed (livekit-client 2.23.0, `dist/livekit-client.esm.mjs`):** default at `:21843`; `Room.connect` passes `!singlePeerConnection` as `useV0Path` at `:34869`; the restart path does the same at `:26382`; plain params at `:18955`; offer-with-join off on v0 at `:25528`.
- **Join gate and R-rules unchanged:** the session still proves first and joins with the returned token (`session.ts:960-963`, `:659-669`). `autoSubscribe: false` (`livekit.tsx:205`) and `NO_SDK_RECONNECT` are unchanged, and the disconnect mapping and `onConnection` are not touched. The `connect()` refactor that inlines `join()` keeps the same order.
- **Tests:** `livekitBinding.test.ts:187` (red with `true`, mutation M2), `sdkContract.test.ts:53`.

NOT VERIFIED: `/rtc` through the Dev edge, and two peer connections through it on a device. The flag is not gated by environment, so it applies to any Live build, including after the edge is fixed.

## 5. TextDecoder

**Root cause as the commit states it:** Hermes has no global TextDecoder, the app's `fast-text-encoding` installs neither global because TextEncoder exists, so `new TextDecoder()` in `joinClaimsOf` threw and became a local `bad_proof`.

### The fix as it actually is

- `pop.ts:45` decodes with a built-in `utf8Decode` (`pop.ts:81`), which needs no global.
- **The task describes a global polyfill installed when missing. No such install exists in this range.** Nothing in `784dbc925..5a8dd2603` adds one, so there is no new install line or guard to name.
- `utf8Decode` checks out: multi-byte text matches TextDecoder in the test, and a code point above U+10FFFF throws a RangeError that the `joinClaimsOf` catch turns into null.

### Test without the global: CLEAN

`pop.test.ts:61-73` deletes `globalThis.TextDecoder` and asserts it is undefined. `pop.test.ts:75` "reads the claims and signs exactly as the runtime accepted" then runs without it, and goes red when the code goes back to TextDecoder (mutation M1). `pop.test.ts:84` compares `utf8Decode` with TextDecoder when the global is present.

### FINDING, MEDIUM: the stated root cause is contradicted (`pop.ts:41-44`)

Two installers that the commit's explanation depends on do install the decoder:

| Installer | Loaded from | Guard | Clean VM: TextEncoder present, TextDecoder absent |
| --- | --- | --- | --- |
| `fast-text-encoding` 1.0.6 (lockfile version) | `src/platform/polyfills.ts:1`, `index.js:2` | `scope.TextDecoder=scope.TextDecoder\|\|g` (per global) | **TextDecoder installed, decodes correctly** |
| `@livekit/react-native` 3.1.0 `EncoderDecoderTogether.min.js` | its `src/index.tsx:17` | `F\|\|(q.TextDecoder=x)` | **TextDecoder installed, decodes correctly** |

- **The commit's "installs neither" does not match the installed `fast-text-encoding`.** It guards each global separately.
- **LiveKit's polyfill runs before the failing line.** In `connect()`, unchanged in order since build 43, `roomFactory` runs before `prove`. So the binding has called into `@livekit/react-native` by then, and if that call had thrown, `prove` would never have been reached.
- **livekit-client itself needs the global.** `livekit-client.esm.mjs:37894` runs `new TextDecoder()` at module scope; loading the file in Node with the global deleted throws `ReferenceError: TextDecoder is not defined` at that line. This app's `inlineRequires: true` (`metro.config.js:47`) can defer when that runs, so this is supporting evidence only.

**A possible explanation for the commit's reproduction (hypothesis, not confirmed):** its bare Hermes VM defines no `window` or `global`, so the polyfill's `scope` falls back to `this`. In a Node VM with neither defined and a CommonJS-style wrapper, the result was global `TextDecoder` undefined and `module.exports.TextDecoder` a function. That is what the commit reports, and the real app would not behave that way, because Metro supplies `global`. I do not have the commit's harness, so I cannot say this is what happened.

**Why it matters:** if the decoder was present in build 43, `utf8Decode` fixes nothing on the phone and build 44 may fail the same way. Other things between consent and /prove also make no network call and show the same default copy: `roomFactory` (`registerGlobals`, `setupIOSAudioManagement`, `new Room`) and `key.sign`. None of these has been shown to be the cause.

**Why MEDIUM and not HIGH:** the change itself is harmless, the evidence is not from a device, and the commit reports a Hermes run I could not repeat (Windows has `hermesc.exe` only, no `hermes` VM). It should be treated as HIGH if build 44 still fails to start.

**The new on-screen code settles this on the first device run:** `(code: proof)` or any other step names where it stops. If the join works on build 44, the cause is still not proven, because `singlePeerConnection` shipped in the same build.

**Also to correct:** the comments at `pop.ts:41-44` and `pop.test.ts:59-60` state the "installs neither" claim as fact.

## 6. Step logging: CLEAN, with LOW gaps

Every log call on the Live path:

| Call | Fields |
| --- | --- |
| `session.ts:532` `agentLive: join step failed` | `step`, `name`, scrubbed `message` |
| `session.ts:248` `/end gave up with no screen` | none |
| `api.ts:341` `request timed out` | none |
| `api.ts:394` `request failed` | none; the error text is deliberately not logged |
| `deviceKey.ts:49` `device key unavailable` | none |

There are none in `room/` or `AgentLive/`. The SDK's own connect log redacts `access_token` (`livekit-client.esm.mjs:19004-19019`).

- **Redaction:** `scrub` at `session.ts:337-342`: JWTs, `token=` and `access_token=` values, 200 characters.
- **Test that greps the logs:** `session.test.ts:1626` "a binding step error (%s) is named, and logged without tokens". Goes red with the scrub removed (M3). `session.test.ts:1658` covers `scrub` and the cap (M4).

**LOW, `session.ts:337`:** a probe of `scrub` showed these pass through unchanged: `sig=VALUE`, `{"sig":"VALUE"}`, `Bearer OPAQUE`, `{"token":"opaque"}`, a two-part `eyJ.eyJ`, `secret=`, and `refreshJwt=`. I found no path that puts these in an error message today, so this is hardening only. `e.name` at `session.ts:530` is neither scrubbed nor capped.

**LOW, noise:** a Cancel during the proof logs a "join step failed" line for `JoinError('connect')` (`session.ts:961`, `:971`), with no failure to report.

## 7. On-screen error: CLEAN by construction

**There is no on-screen message cap, because no error text reaches the screen.** The screen shows fixed copy plus ` (code: <step>)` (`AgentLive/index.tsx:603-605`). `failStep` is the closed `LiveConnectStep` union (`room/types.ts:9-17`), with `webrtc-globals` the longest at 14 characters. The 200 cap at `session.ts:341` applies to the log only.

**Probe (throwaway, screen level):** the room connect rejected with a JWT-shaped message plus 600 characters. The screen showed "Couldn’t start the live session. Try again later." and " (code: room-connect)", with no `eyJ`.

**Test:** `AgentLive.test.tsx:1095` pins `(code: proof)` on the copy (mutation M5).

**LOW:** no committed test puts a token-shaped error through to the screen. The existing one would only catch a change to the exact string.

## 8. Earlier closures: CLEAN

- **F11:** `state/session/index.tsx:147-148`, test `sessionHook.test.tsx:242`; a failed create ends nothing, `:268`.
- **F12:** `AgentLive/index.tsx:545`, `:586-590`, `:682`; tests `AgentLive.test.tsx:663`, `:688`. The reused Cancel in check 2 has no /end out, so it breaks F18 rather than this narrower rule.
- **F13:** `useAccountSwitcher.ts` sets `keepLive`, `state/session/index.tsx:276` honours it; test `sessionHook.test.tsx:232`.
- **P1:** `session.ts:1129`, test `session.test.ts:285`.
- **P2:** `session.ts:814-815`, test `session.test.ts:1892`.
- **P3:** `session.ts:1279-1295`, `AgentLive/index.tsx:155-157`.
- **P4:** `session.ts:501-505`, test `session.test.ts:396`, the `:1755` block.
- **P5:** the `session.test.ts:1861` block passes.
- **Refusal rule:** `session.ts:497-500`. Only the owner's actions end after a refusal; the 16 s give-up ends only on an outage (`OUTAGES`, `:540`). The new failure path passes `failStep` only and goes through the same `finish()` rule.

## 9. Flag gate: CLEAN

Only `development-live` sets the flag true (`eas.json:103`). All 8 other profiles are "false" (`eas.json:16, 45, 74, 130, 163, 196, 228, 261`). `flag.ts` requires exactly `'true'`.

| New path | Gating |
| --- | --- |
| `DeleteAccountDialog.tsx:126`, `state/session/index.tsx:332` | Inert off: the registry set is empty, and the only registrant is `session.ts:1066` |
| `session.ts` (`stopping`, `failStep`, `scrub`, step logging), `pop.ts` `utf8Decode` | Inside the controller, only made under `AGENT_LIVE_ENABLED` (`AgentLive/index.tsx:72`) |
| `room/livekit.tsx` (`LIVE_ROOM_OPTIONS`, `step`) | Dynamic import only (`room/index.ts`), behind the same gate |
| `room/types.ts` `LiveStepError`, imported statically by `session.ts:72` | No SDK import; its `react` and `react-native` imports are type-only |
| `AgentLive/index.tsx:178, 588, 603, 682` | Inside the same gate |

## 10. Prebuild gate

**Prebuild: NOT RUN on Windows.**

Native changes in 784dbc925..5a8dd2603: **none**. No file under `ios`, `android`, `modules`, `plugins` or `patches`, and no change to `app.config.js`, `package.json`, the lockfile or `eas.json`. `utf8Decode` is JS, and `singlePeerConnection` is a JS option on the SDK already shipped.

## 11. Tests

`NODE_ENV=test jest --forceExit --maxWorkers=4` at 5a8dd2603, with no local `.env`.

- **Live suites** (`src/features/agentLive`, `src/screens/AgentLive`, `src/screens/Settings/components/__tests__`): 14/14 suites, 339/339 tests.
- **Full suite:** 201 of 205 suites pass. 2667 tests pass, 2 fail, 28 todo.

Failing suites, known and unrelated, none touched by this range, not counted:

| Suite | Reason |
| --- | --- |
| `__tests__/lib/string.test.ts` | Suite did not run |
| `src/lib/lexicon/__tests__/lexicon.test.ts` | `group/post.json` differs from the spike copy (1 test) |
| `plugins/uiSceneLifecycle/__tests__/withUISceneLifecycle.test.js` | AppDelegate template does not match; suite did not run |
| `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts` | Expected source not found (1 test) |

**Count against the commits:**

- **2673** is the count claimed by 3b593301c, not this commit. The head commit 5a8dd2603 claims **2681**, with only 2 failing suites.
- **This run has 2667, a gap of 14 to 2681.** The gap is accounted for by the two extra failing suites here: `withUISceneLifecycle` did not run (13 tests by a grep of `it(`/`test(`, not an executed count) and `noBackgroundLocationShipped` has 1 failure. 13 + 1 = 14.
- **The gap matches the last review.** That run had 2659 against the claimed 2673, also 14. This range adds 8 Live tests here, 331 to 339 in the Live suites and 2659 to 2667 in the full suite.
- **Not determined:** why those two suites pass in the commit's environment and fail here.

**New tests:**

- **F21:** `deleteAccountEndsLive.test.ts`; `sessionHook.test.tsx` "removing the current account..." and "removing another account...". None covers the wait.
- **F18:** `session.test.ts:1558`, `:1582`; `AgentLive.test.tsx:1202`. None covers the reused copy.
- **TextDecoder:** without the global `pop.test.ts:75`; with the global `pop.test.ts:84`.
- **Logging and cap:** `session.test.ts:1604`, `:1626`, `:1658`; `AgentLive.test.tsx:1095`.
- **singlePeerConnection:** `livekitBinding.test.ts:187`, `sdkContract.test.ts:53`.

**Mutations, each restored after its run:**

| # | Change | Goes red |
| --- | --- | --- |
| M1 | `pop.ts` back to TextDecoder | `pop.test.ts:75` |
| M2 | `singlePeerConnection: true` | `livekitBinding.test.ts:187` |
| M3 | Log message unscrubbed | `session.test.ts:1626` (both steps) |
| M4 | 200 cap removed | `session.test.ts:1658` |
| M5 | Screen code removed | `AgentLive.test.tsx:1095` |
| M6 | `removeAccount` ends for any account | "removing another account..." |
| M7 | `removeAccount` never ends | "removing the current account..." |

## 12. Typecheck

- `tsc --noEmit -p tsconfig.communities.json`: exit 0, 0 errors.
- `tsgo -p tsconfig.check.json`: exit 2, 82 errors, all in `src/locale/i18n.ts` and `src/locale/i18n.web.ts` (41 each), the same as the last review. None in a file this range changed.

## 13. Scope: CLEAN

All 15 changed files, none outside the named areas:

- **Agent Live client and TextDecoder path:** `src/features/agentLive/pop.ts`, `room/index.ts`, `room/livekit.tsx`, `room/types.ts`
- **Session controller:** `src/features/agentLive/session.ts`
- **Live screen:** `src/screens/AgentLive/index.tsx`
- **Account removal:** `src/screens/Settings/components/DeleteAccountDialog.tsx`, `src/state/session/index.tsx`
- **Tests:** `src/features/agentLive/__tests__/{livekitBinding,pop,sdkContract,session}.test.ts`, `sessionHook.test.tsx`, `src/screens/AgentLive/__tests__/AgentLive.test.tsx`, `src/screens/Settings/components/__tests__/deleteAccountEndsLive.test.ts` (new)

## 14. Device items: NOT VERIFIED

Physical swipe, lock screen, phone call, notification tap, delete on device, the TextDecoder on device, permissions, background, stage rendering, iOS archive. Also: `/rtc` and two peer connections through the Dev edge, how long the F18 copy shows during the pop, and /end against delete timing on a real network.

## Lower findings (do not gate)

- **L2, LOW, tests, `deleteAccountEndsLive.test.ts:20`.** Still an `indexOf` on source text, as the last review reported.
- **L3, LOW, copy, `AgentLive/index.tsx:588`.** The ruling says "Stopping…"; the string is "Stopping the live session."
- **L4, LOW, `AgentLive/index.tsx:191-197, 213`, by reading only.** While `stopping` with /end not yet started, the back swipe is enabled and there is no Done for up to 30 s (`LIVE_START_TIMEOUT_MS`). Swiping away loses nothing.
- **Scrub gaps, log noise, and the screen-level test:** see checks 6 and 7.

## How this was run

- The worktree started at 571924785, not 5a8dd2603. The review branch was created from 5a8dd2603.
- Dependencies came from worktree `f2caccaa`, whose `package.json`, lockfile and `patches` match, through a temporary junction. It was removed before this commit.
- Probes and mutations were applied to the working tree only, restored after each run, and never committed. The VM and SDK load probes were scratch files outside the repo.
- Commands ran as `node_modules/.bin/jest`, `tsc` and `tsgo` directly, as this task specified, rather than through the pnpm scripts.
- The deny-list blocked one of my commands because it included an environment count. I dropped that part and did not need it.
- Nothing here ran on Hermes or a device. The polyfill results come from Node VM contexts.
