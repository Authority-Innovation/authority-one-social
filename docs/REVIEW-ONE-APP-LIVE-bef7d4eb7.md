# Review: One app Live, build 46, range 5a8dd2603..bef7d4eb7

Task 14a11cd9, round r383. Independent and read-only. No feature branch was changed. Nothing was merged, built, submitted or deployed, and no live system was touched.

## Verdict

**CLEAN for build 46: no BLOCKER and no HIGH.** One judgement call could change this.

**The call for Dispatch (M1 below).** The handoff says a current-account delete "that removes before /end settles" is HIGH. Two narrow paths make the delete's wait return while a /end is still in flight. I rated them MEDIUM, with reasons in M1. If Dispatch applies the sentence literally, M1 becomes HIGH and the verdict becomes NOT CLEAN. The fix is small.

| Check | Result |
| --- | --- |
| 1. F21 | CLEAN on the main paths. FINDING MEDIUM (M1, `session.ts:1335`, `session.ts:1285`). FINDING LOW (L1, L2) |
| 2. F18 | CLEAN. LOW test gap (L3) |
| 3. Polyfill guard | FINDING MEDIUM by the letter of the handoff (M2, `src/lib/utf8.ts:165`). Guard present, capable global kept |
| 4. Owner-mic | CLEAN. Server hearing rule NOT VERIFIED |
| 5. Earlier closures | CLEAN (by test and code read) |
| 6. Flag gate | CLEAN for Live code. FINDING LOW: polyfills are outside the flag (L4) |
| 7. Prebuild gate | NOT RUN on Windows. No native change in the range |
| 8. Tests | Live 359/359. Full suite: only the 4 named unrelated suites fail |
| 9. Typecheck | `tsc` 0 errors. `tsgo` 82 errors, all in `src/locale` |
| 10. Scope | 18 files. One outside the named list: `src/lib/weakRef.ts` and its test (L4) |
| 11. Device items | NOT VERIFIED |

**The range holds four commits, not two.** The handoff names c31515c18 and bef7d4eb7. `git log` also shows 92afe70c2 (TextDecoder install) and 985d2d93b (WeakRef, stronger TextDecoder guard, error name in the on-screen code). I reviewed all four. 985d2d93b corrects the earlier build-43 diagnosis, and that correction affects checks 3 and 6.

## 1. F21: delete ends Live first, awaited and bounded

**(a) Awaited and bounded: CLEAN.**
- `src/screens/Settings/components/DeleteAccountDialog.tsx:130` runs `await endOpenLiveSessionsAndWait(LIVE_END_BEFORE_DELETE_MS)`. The server `deleteAccount` call follows at `:131`.
- The bound is **8,000 ms**, `LIVE_END_BEFORE_DELETE_MS`, at `DeleteAccountDialog.tsx:49`.
- `src/features/agentLive/registry.ts:35-42` starts every open session's end and races `allSettled` against the timer.
- The registered end is `session.ts:1091-1093`. It returns the real /end promise from `end()` or `retryEnd()`, so the await is meaningful. Probe P-A confirmed the wait stays pending while /end is out and settles after it. Probe P-C confirmed the same for a session the screen left owed.

**"Removing the current account":**
- `src/state/session/index.tsx:331-333` still uses the fire-and-forget `endOpenLiveSessions()`. This does not breach the ruling, because of its two callers:
  - `DeleteAccountDialog.tsx:139`, which runs after the awaited end and the server delete.
  - `Settings.tsx:692`, the quick-access removal. Its rows exclude the current account (`Settings.tsx:151`), so it cannot reach this branch.
- The hook's `removeAccount` has no awaited path of its own. A future caller that removes the current account without the dialog would not wait.

**(b) After the bound: CLEAN.** The delete **proceeds**. It does not hang and does not refuse. The /end retries keep running on the bearer captured at the start.
- Test: `registry.test.ts` "is bounded: an end that hangs is given up on at the timeout". Also "a failing end does not reject the wait".
- Test: `deleteAccountEndsLive.test.ts:19`, a source-order check. See L2.
- The bound (8 s) is shorter than one /end attempt's timeout (`LIVE_REQUEST_TIMEOUT_MS`, 10 s, `api.ts:322`). A /end taking 8-10 s therefore proceeds unsettled. This is within the ruling. Dispatch may want to know.

**(c) Removing a different account: CLEAN.** `sessionHook.test.tsx:301` "removing another account (not the current one) ends nothing".

**(d) Switch and sign-out still end: CLEAN.**
- `index.tsx:200` logout current, `:239` logout every, `:280` switch, `:177` login, `:147` createAccount.
- Tests: `sessionHook.test.tsx:197`, `:207`, `:217`, `:162`, `:242`.

### M1. MEDIUM: the delete's wait can return while a /end is in flight

Two paths, both reproduced with an uncommitted probe test against the real controller (deleted before this commit).

| Probe | Path | Cause | Result |
| --- | --- | --- | --- |
| P-D | A retry /end is already out, then a second wait starts | `session.ts:1335`: `retryEnd()` returns at once when `state.ending` is true | Wait settled, /end still out |
| P-E | Cancel while starting, on a created session, /end out | `session.ts:1285`: `end()` awaits `ending`, the promise from `finish()`, which had already resolved. The /end was started by `begin` at `session.ts:1104` | Wait settled, /end still out |

A third, narrower gap: a start call still out is not registered until it answers (`session.ts:1091`), so a delete in that window has nothing to wait for.

**Why MEDIUM and not HIGH:**
- In all the /end paths the request has already been sent and its retries continue. The original F21 sent 0 /end at return.
- The realistic P-D case is a mistyped delete code after attempt 1 has already waited the full 8 s bound, retried during an outage. It loses at most a further 8 s, which the bound allows anyway.
- P-E needs the owner to leave Live, open Delete, fetch the emailed code and confirm within the /end retry window. That window is at most about 51 s (4 attempts at 10 s, plus 11 s of delays), and only during an outage of the runtime but not the PDS.

**Fix if wanted:** track the in-flight `endOnRuntime` promise and return it from `retryEnd()` and from `end()`, including on the `begin` path. Add both cases to `registry.test.ts`.

### L1. LOW: up to 8 s of silence, and the Delete button stays live

`DeleteAccountDialog.tsx:317` disables the button only on field validity, with no pending state. The wait adds up to 8 s with a session open. A second press reruns the chat delete, the wait and `deleteAccount`. The confirm code should make only one server delete succeed, so the outcome looks benign (not run), but the second call can show an error in a closing dialog.

### L2. LOW: dialog behaviour is pinned only by source text

`deleteAccountEndsLive.test.ts:19` checks string order in the source. No test renders the dialog and shows `deleteAccount` waiting for /end, or proceeding after the bound. The value 8,000 is not asserted against the dialog's constant.

### Note, by ruling: a failed delete still ends Live

The end runs before the server delete, so a wrong code or password ends the live session and leaves the account in place. The chat-service delete call has also already run by then. Ruling r381 requires ending first, so this is not a finding. It differs from login, which waits for success (f2caccaa F7).

### Note: reused sessions and other accounts

- A reused session this device has not taken over gets no /end on delete (`session.ts:504`). That matches the refusal and reuse rules, and it stays open on the other device.
- The registry is not per account. A session from account A kept by a notification-tap switch (`keepLive`) is ended if account B is then deleted. It was owed to sign-out, so this looks acceptable.

## 2. F18: Cancel ends what it created, or says nothing

Cancel: `src/screens/AgentLive/index.tsx:272` `onCancel` goes to `onEnd` (`:167`), then `controller.end()` (`session.ts:1283`), and `begin` settles it (`session.ts:1096-1105`, `:1130-1135`).

- **(a) Reused: CLEAN.** `session.ts:1099` unregisters with no /end. `:1133` sets `endReason: 'cancelled'`, and its copy is empty (`index.tsx:569`).
  - Tests: `session.test.ts:1584`, `AgentLive.test.tsx:1202`. Failed start: `session.test.ts:1612`.
- **(b) Created: CLEAN.** `session.ts:1103-1104` sends and awaits /end, with `stopping` held until it settles.
  - Copy is "Stopping the live session." (`index.tsx:590`), and the extra line "Ending the session…" (`index.tsx:623`) shows while /end is out. There is no Done button (`:684`).
  - Then `leaveWhenEnded` leaves the screen (`index.tsx:175-182`).
  - Tests: `AgentLive.test.tsx` "F1: Cancel while the session is starting ends it, then goes back", `session.test.ts:1558`.
  - **Wording against the handoff:** the handoff says "then nothing further is said". The state is `endReason: 'local'`, which renders "Live session ended." The screen leaves in an effect immediately after that render, so at most one commit shows it, and it is true by then. I did not rate this.
- **(c) No "ended" before /end settles: CLEAN.** The copy branch puts `stopping` first (`index.tsx:590`). Probe P-E showed `stopping: true, ending: true` while /end was out. If /end fails, probe P-F showed `stopping: false, endFailed: true`, which renders "may not have ended" (`:592`).

One more window, on a reused start, while `wasHeldHere` is awaited (`session.ts:1113`): Cancel there sends no /end but says the `left_open` copy, because `leftOpen()` drops `stopping` (probe P-G). The copy is true, so this is acceptable. It is not literally "says nothing".

### L3. LOW: test gap

The F1 screen test checks "Stopping" only before the start answers. No screen test holds /end open after the start answers and checks the copy, and none covers Cancel with a failing /end. Probes P-E and P-F covered both at controller level, but they were not committed.

## 3. Polyfill guard

- Install: `src/platform/polyfills.ts` calls `installTextDecoder()`. Guard: `src/lib/utf8.ts:165`, `if (isCapableTextDecoder(scope.TextDecoder)) return false`. Write: `:166`.
- Without the global: `utf8.test.ts:55` "installs a decoder when there is no global one (Hermes)". It asserts the global is undefined first.
- Existing global kept: `utf8.test.ts:65` "leaves a full TextDecoder alone (Node, web)".

### M2. MEDIUM by the letter: an existing, incapable global is overwritten

The handoff says "only when the global is missing" and rates overwriting an existing global MEDIUM. The guard also replaces a global that cannot do `fatal` and `stream`, which is fast-text-encoding's (`utf8.test.ts:71`). This is deliberate, from 985d2d93b, and the reason is stated: fast-text-encoding's decoder throws on `{fatal: true}`, and livekit-client asks for that at module scope. Changing it to missing-only would undo that. **I recommend Dispatch accept it.** It does not gate the build.

### Observation: Expo's global probably replaces this one on the phone

`index.js:2` loads the polyfills before `expo`. `expo/src/Expo.fx.tsx:2` imports `./winter`, and `runtime.native.ts:8` calls `install('TextDecoder', ...)`, which `installGlobal` documents as replacing an existing property. Expo 54.0.34 is installed.

From this read, the global after startup is likely **Expo's**, not `Utf8TextDecoder`, on native. That conflicts with the commit's "on React Native the global is fast-text-encoding's". The Expo decoder passed `isCapableTextDecoder` in probe P-H, in Jest under Node, so this looks harmless either way. It was not run on a device. Check it on Hermes when the polyfill item below is verified.

**LOW:** `utf8.ts:19` accepts overlong sequences, so `C0 80` decodes to U+0000 even with `fatal: true`. A platform decoder would reject it. Found by reading the code, not by running it.

## 4. Owner-mic

There is a single SDK call: `src/features/agentLive/room/livekit.tsx:228`, `setMicrophoneEnabled(on, undefined, {name: OWNER_MIC_TRACK})`, with `OWNER_MIC_TRACK = 'owner-mic'` at `:66`. `room/types.ts:75` takes only `on`, so no caller can pass or drop a name.

| Path | Call | Name |
| --- | --- | --- |
| First join | `session.ts:992` | owner-mic |
| Rejoin ladder | `session.ts:910` | owner-mic |
| Owner toggle | `session.ts:1186` | owner-mic |
| Camera token swap | `session.ts:1263` | owner-mic |

- Searched `src` for `publishTrack`, `createLocalAudioTrack`, `createLocalTracks` and `enableCameraAndMicrophone`: no other mic publish. `room/livekit.web.tsx` throws and publishes nothing.
- SDK 2.23.0: `publishOptions` reaches `publishTrack` (`livekit-client.esm.mjs:32678`), the request carries `name: opts.name` (`:33114`), and the options stay on the publication (`:33320`) for an SDK republish (`:33659`).
- Tests: `livekitBinding.test.ts:188` asserts on and off. `sdkContract.test.ts:70` is the SDK tripwire.
- No test asserts the name per path, because the session tests' fake room (`fakeRoom.tsx:43`) does not see it. The single call site covers this.
- `setCameraEnabled` remains unnamed. It is not a mic, so I did not rate it.

## 5. Earlier closures

All passing in this run, and the code was read for the range:
- **F11:** `index.tsx:147`, `sessionHook.test.tsx:242`.
- **F12:** `index.tsx:545`, `:591-592`, `AgentLive.test.tsx:663`, `:688`.
- **F13:** `useAccountSwitcher.ts:43`, `index.tsx:276`, `sessionHook.test.tsx:232`, `notificationTapKeepsLive.test.ts`.
- **P1:** `session.test.ts:285`.
- **P2, P5:** `session.test.ts:1895` block.
- **P3, P4:** `session.test.ts:1789` block, `AgentLive.test.tsx:997`.
- **Refusal rule:** `session.test.ts:1428` block, enforced at `session.ts:503-516`.

The range did not change `finish()`'s rule. The new `endedCreated` path runs only for a Cancel on a created session.

**LOW (985d2d93b):** `logStepFailure` returns a thrown string as the error name, unscrubbed (`session.ts:551-552`). It reaches the log and the on-screen code, while `message` is scrubbed. The call sites I read pass `Error` objects or an error kind, so I found no live path.

## 6. Flag gate

`EXPO_PUBLIC_AGENT_LIVE_ENABLED` is `"true"` only at `eas.json:103` (`development-live`). All eight other profiles are `"false"`. `buildGate.test.ts:57` pins this and passes.

| New path | Gating |
| --- | --- |
| `session.ts`, `screens/AgentLive/index.tsx` | Screen off at `index.tsx:72`, button off at `GoLiveButton.tsx:26` |
| `room/livekit.tsx` | Reached only from the session controller, which only that gated screen starts |
| `registry.ts` wait, dialog await | Unflagged but inert: with no session registered it resolves at once and clears its timer |
| `src/platform/polyfills.ts`, `lib/utf8.ts`, `lib/weakRef.ts` | **Unflagged**, run at `index.js:2` and `index.web.js:2` in every profile |

### L4. LOW: polyfills run outside the flag, and WeakRef has no ruling

Ruling r381 covers the TextDecoder, not `installWeakRef()`.
- **Web and Node:** both guards leave the native global alone.
- **Native, flag off:** a strong-holding `WeakRef` global is installed. In the installed packages, the only non-tooling code that constructs one is `livekit-client` (with its `machina` dependency), and the flag keeps that out of the build. Other hits were dev or transitive tooling (`@atproto/lex-cli`, `jsdom`, `prettier`, `@react-native/debugger-frontend`). A spot search for `typeof WeakRef` in key runtime packages found none. So it looks inert in practice, but this was a search and not a run, and it is not literally behind the flag.
- **Native, flag off, TextDecoder:** chat streaming and other callers may now get a different decoder from before. See the Expo observation in section 3.

## 7. Prebuild gate

**Prebuild: NOT RUN on Windows.**

No native change in 5a8dd2603..bef7d4eb7: no change under `ios`, `android` or `plugins`, nor to `app.config`, `package.json`, the lockfile or `eas.json`. The Mac still runs `expo prebuild --platform ios --no-install --clean` with the flag off and on.

## 8. Tests

`NODE_ENV=test jest --forceExit --maxWorkers=4`, called directly because `pnpm` is not on this machine's PATH.

The worktree had no `node_modules`, so I used a temporary directory junction to the `node_modules` of worktree 679a9d48, removed before committing. Its `pnpm-lock.yaml` hash matches this branch (`a9459e0f`) and it holds `livekit-client` 2.23.0.

- **Live suites plus polyfill and delete tests:** 17 suites, **359 of 359 passed**.
- **Full suite:** 208 suites: 204 passed, 4 failed. 2,717 tests: 2,687 passed, 2 failed, 28 todo.
- **The 4 failures, all among those the handoff names as unrelated, none touching range files, not counted:**
  - `__tests__/lib/string.test.ts`
  - `src/lib/lexicon/__tests__/lexicon.test.ts`
  - `plugins/uiSceneLifecycle/__tests__/withUISceneLifecycle.test.js`
  - `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts`

New tests:
- **F21:** `registry.test.ts` (3 tests), `deleteAccountEndsLive.test.ts:19`.
- **F18:** `session.test.ts:1584`, additions at `:1558` and `:1612`, `AgentLive.test.tsx:1202`.
- **Polyfill:** `utf8.test.ts:55`, `:65`, `:71`, `:87`, `weakRef.test.ts`.
- **Owner-mic:** `livekitBinding.test.ts:188`, `sdkContract.test.ts:70`.

Probes P-A to P-H were my own throwaway tests. They are not in this commit, and their results are reported as seen. They ran against stubbed `api` and timers, not a server.

ESLint: NOT RUN (not requested).

## 9. Typecheck

- `tsc --noEmit -p tsconfig.communities.json`: exit 0.
- `tsgo -p tsconfig.check.json`: exit 2, **82 errors, all under `src/locale`**, none in range files. I assume these come from uncompiled catalogs, since `intl:compile` is a CI job here. I did not confirm that. The builder's commits report the same category ("0 non-locale").

## 10. Scope

All 18 files changed:

```
src/features/agentLive/__tests__/livekitBinding.test.ts
src/features/agentLive/__tests__/pop.test.ts
src/features/agentLive/__tests__/registry.test.ts
src/features/agentLive/__tests__/sdkContract.test.ts
src/features/agentLive/__tests__/session.test.ts
src/features/agentLive/pop.ts
src/features/agentLive/registry.ts
src/features/agentLive/room/livekit.tsx
src/features/agentLive/session.ts
src/lib/__tests__/utf8.test.ts
src/lib/__tests__/weakRef.test.ts
src/lib/utf8.ts
src/lib/weakRef.ts
src/platform/polyfills.ts
src/screens/AgentLive/__tests__/AgentLive.test.tsx
src/screens/AgentLive/index.tsx
src/screens/Settings/components/DeleteAccountDialog.tsx
src/screens/Settings/components/__tests__/deleteAccountEndsLive.test.ts
```

Outside the named areas: `src/lib/weakRef.ts` and `src/lib/__tests__/weakRef.test.ts` (the WeakRef path, not the TextDecoder path; L4). Rejoin and navigation code are unchanged except for the mic name reaching rejoin through the binding.

## 11. NOT VERIFIED (device or server)

Physical swipe, lock screen, phone call, notification tap, delete on device, the polyfills on Hermes (including which TextDecoder wins, section 3), permissions, background, stage rendering, iOS archive. Also the runtime's hearing rule accepting `owner-mic`, which needs the server side.

## Findings by severity

| ID | Severity | Location | Summary |
| --- | --- | --- | --- |
| M1 | MEDIUM (HIGH if read literally) | `session.ts:1335`, `session.ts:1285` | The delete's wait can return with a /end in flight, on two narrow paths |
| M2 | MEDIUM by the letter, accept recommended | `src/lib/utf8.ts:165` | Replaces an incapable existing TextDecoder, deliberately |
| L1 | LOW | `DeleteAccountDialog.tsx:317` | Up to 8 s with no pending state, button stays live |
| L2 | LOW | `deleteAccountEndsLive.test.ts:19` | Dialog order pinned by source text only |
| L3 | LOW | `AgentLive.test.tsx` | No screen test with /end held open, or failing, after Cancel |
| L4 | LOW | `src/platform/polyfills.ts` | Polyfills outside the flag, WeakRef has no ruling |
| L5 | LOW | `src/lib/utf8.ts:19` | Overlong UTF-8 accepted under `fatal` |
| L6 | LOW | `session.ts:551-552` | A thrown string reaches log and screen unscrubbed |
