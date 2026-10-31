# Review a6b1d75f: a4ed5eb7 "Communities W1-T4: merge Signature P2b dark"

Review only. Reviewer: Opus, 2026-10-31. Nothing was committed to, merged
into, or pushed to any branch other than this review branch.

**Verdict: CAN LAND** (as a dark merge). 0 BLOCKER, 0 HIGH, 2 MEDIUM, 5 LOW.
The merge is mechanically clean, and Signature stays fully dark: no
`EXPO_PUBLIC_AO_SIGNATURE_*` value is set, native modules load lazily, the
bearer stays the PDS JWT and the scheme stays `one`.

## What was reviewed

- `main` exists. Its tip is `571924785`, which does **not** contain this
  work.
- The record's branch is `origin/coord/communities-w1-t4-merge-signatur-a4ed5eb7`
  at head `11a255da3`:
  - `da1fce83f` is the `--no-ff` merge. Its parents are `569b3b240` (the build
    line, `fix/ao-uiscene-lifecycle`) and `589e00164` (P2b after review
    round 4).
  - `f2664c375` adds `src/screens/Login/__tests__/signInDark.test.tsx`.
  - `11a255da3` adds the report and the log entry.
- `11a255da3` is already contained in `origin/communities/integration`, along
  with many other branches.
- The record's own report is `docs/communities/W1-T4-merge-p2b-dark-report.md`.
  I could not read the bus body for a4ed5eb7: no bus-read tool is available
  in this session. I used the report and the AUTONOMOUS-LOG entry on the
  branch instead.

## What I ran

1. `git diff 569b3b240 da1fce83f` against `git diff 571924785 589e00164`.
   Both show the same 59 files, +6042 / -42, and the patches are the same
   length (6673 lines). So the merge brings in exactly P2b, with nothing lost
   and nothing extra.
2. Files changed on both sides since the merge base: only `app.config.js`. The
   merged file has the UIScene plugin and the P2b `scheme` and
   `aoSignatureNativeScheme`, in separate hunks. This confirms the report's
   "no conflicts".
3. jest at `11a255da3`, run directly with `--ci`:
   `NODE_ENV=test node node_modules/jest/bin/jest.js --forceExit --testTimeout=20000 --ci src/features/aoSignature src/screens/Login src/lib/agent-runtime src/state/session`.
   Result: **48/48 suites, 544/544 tests, 25/25 snapshots pass.** This covers
   `dark`, `appConfigParity`, `bearerCallSites`, `bearerHosts`, `authToken`,
   `agentFetch` and the new `signInDark` snapshot.
4. `tsgo --project ./tsconfig.check.json` (what `pnpm typecheck` runs): no
   errors except `TS2307` for `src/locale/locales/*/messages`. Those are the
   uncompiled Lingui catalogs, which CI generates, so this is expected in a
   worktree.
5. I did **not** run the full suite, lint, or a native or EAS build.

How I ran them: `pnpm` is not installed on this machine, and installing would
mean reaching the registry. So I added a local, untracked directory junction
`node_modules` pointing at the a4ed5eb7 worktree's `node_modules` (read-only
use), checked out `11a255da3` detached, and called the binaries the pnpm
scripts call. This departs from the CLAUDE.md "always use pnpm scripts" rule.

## Dark-state checks (code read)

- `config.ts`: `AO_SIGNATURE_CONFIG` fails closed. Any missing,
  non-https or off-allow-list value gives `null`. The runtime origin must
  equal `AGENT_RUNTIME_BASE_URL`.
- `storage.ts`, `cryptoPort.ts` and `browser.ts` only use `import type` at
  the top of the file. They `require()` `expo-secure-store`, `expo-crypto` and
  `expo-web-browser` inside functions, and every entry point checks the config
  before it gets there. `store.aoRuntimeBearer` returns `null` while dark.
- `authToken.getAgentRuntimeAccessToken`: when the AO bearer is null, it
  returns the same `currentAccount.accessJwt` as before.
- `agentsClient.noteAONotProvisionedFrom` returns before touching the body
  while dark.
- `AOSignatureLifecycle`, `SignInButton` and `AccountSection` render `null`
  while dark. `useAOSignatureGate` returns `null`, so the navigator's new early
  return never fires. I also checked `createNativeStackNavigatorWithAuth.tsx`
  lines 125-143: every hook runs before that early return, so arming the lane
  later cannot change the hook order.
- `app.config.js`: `scheme` stays `'one'` unless the full native config is
  set, and the parity test passes.

## Findings

### BLOCKER

None.

### HIGH

None.

### MEDIUM

**M1. Landing this onto `main` also brings in unreviewed build-line commits.**
- **Where:** `da1fce83f`, first parent `569b3b240`.
- **Failure scenario:** the base is not `main`. It is the build line, which
  adds 10 commits on top of `571924785`: build 34 through 36, the UIScene
  lifecycle, the network and offline latch, and the contextEngine wake
  changes. Those commits are outside this record and outside this review. If
  someone merges the W1-T4 branch, or `communities/integration`, into `main`
  on the strength of this verdict alone, those commits ship without being
  looked at.
- **Fix:** gate the move to `main` on their own reviews, or land
  `fix/ao-uiscene-lifecycle` first.

**M2. Two new native dependencies ride along in the next binary.**
- **Where:** `package.json` (lines 168 and 190 at `11a255da3`):
  `expo-crypto ~15.0.9`, `expo-secure-store ~15.0.8`.
- **Failure scenario:** the JS stays dark, but the next EAS build links both
  modules. Neither has been exercised on a device or in a build (`check:bundle`
  and EAS are on the deny-list and were not run). The new UIScene lifecycle
  makes the iOS native-build risk higher. In the other direction, an OTA JS
  update that arms the lane on a binary built *before* this merge would crash
  on `require('expo-secure-store')`. That is safe only because
  `runtimeVersion` uses the `appVersion` policy, which keeps OTA updates to
  the same app version.
- **Fix:** run one Dev EAS build plus a launch smoke test before TestFlight,
  and only ever arm the lane together with a version bump.

### LOW

**L1. Hard-coded default runtime URL in `app.config.js`.**
- **Where:** `app.config.js`, line 66 (`AO_SIGNATURE_DEFAULT_RUNTIME`).
- **Failure scenario:** this copies `AGENT_RUNTIME_SERVICE` from
  `src/lib/constants.ts:31`, and the parity test hard-codes a third copy
  (`appConfigParity.test.ts:15`). If the constant changes and this copy does
  not, the native scheme is never registered, while the TS config still arms.
  Sign-in on native would then dead-end at the bounce.
- **Fix:** add a test asserting
  `AO_SIGNATURE_DEFAULT_RUNTIME === AGENT_RUNTIME_SERVICE`, for example by
  reading the source.

**L2. User-facing strings use the em dash.**
- **Where:** `src/features/aoSignature/errors.ts:59-103` and `session.ts:62`.
- **Failure scenario:** CLAUDE.md asks for "non-breaking space + en dash"
  instead of the em dash. These are new strings, and translators will copy
  the em dash.
- **Fix:** replace each `—` with a non-breaking space followed by `–`.

**L3. `useCallback` and `useMemo` despite the React Compiler.**
- **Where:** `src/features/aoSignature/hooks.ts:1` and `:69-84` (`usePdsPort`).
- **Failure scenario:** none at runtime. It goes against CLAUDE.md's "don't
  proactively add" rule, unless the port object is an effect dependency
  downstream.
- **Fix:** drop them, or add a comment giving the reason.

**L4. `not-provisioned` is only handled for the owner-agents fetch.**
- **Where:** `src/lib/agent-runtime/agentsClient.ts:260-265` is the only
  caller of `noteAONotProvisioned`.
- **Failure scenario:** once the lane is armed, a 403 `not-provisioned` from
  any other `/app/*` client (chat, threads and so on) does not send the person
  back to the picker. They see a generic signed-out or empty state instead.
- **Fix:** route the 403 handling through the shared fetch helper when the
  lane is armed. This does not matter while dark.

**L5. Leftover local ref, and commits made with `--no-verify`.**
- **Where:** `refs/rescue/a4ed5eb7-foreign-stash` (`2ab392c1d`) still exists
  in the shared repo. The record's commits skipped husky.
- **Failure scenario:** the stray ref confuses later sessions. The skipped
  hooks are why the record ran lint and prettier by hand.
- **Fix:** a human runs `git update-ref -d refs/rescue/a4ed5eb7-foreign-stash`.
  CI lint stays the gate.

## Notes

- The record's report says its two failing suites come from CRLF and are not
  regressions. I did not re-run them. Neither one is in the Signature code.
- The test count I got for the targeted set (544) is consistent with the
  report's per-suite numbers.
