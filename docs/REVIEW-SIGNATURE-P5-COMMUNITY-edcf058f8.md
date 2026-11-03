# Review: Signature P5 Community, `985d2d93b..edcf058f8` (round 419)

Independent, read-only review of `sig/community-signin` @ `edcf058f8`. The range is one commit with 32 files. The runtime half (p5-custody) is not in this range, so server-side refusals are not verified here.

**Verdict: NOT CLEAN. BLOCKER 0, HIGH 3, MED 3, LOW 4.**

## Check results

| # | Check | Result |
|---|---|---|
| 1 | Terms box unticked, before the self-mint screen | **FAIL**: the code is correct, but no committed test covers it (H1) |
| 2 | Self-mint screen appears only after terms and needs an explicit action | **FAIL**: the code is correct, but no committed test covers it (H1) |
| 3 | Dark behind `EXPO_PUBLIC_AO_SIGNATURE_*` | **FAIL**: JS behaviour is dark, the app name and config are not (H3) |
| 4 | Lexicon-hash failure | **PASS**: PRE-EXISTING, not new |
| 5 | Per-app enrollment refuses data | **PARTIAL**: the gate has a hole (H2, M1) |
| 6 | Operator link only, never merge | **PASS** |
| 7 | Reflections untouched | **PASS** |
| 8 | No secrets in code | **PASS** |

## Findings

### HIGH

**H1. No committed test covers the terms screen or the self-mint screen (checks 1, 2).**
No test renders `AOEnrollment` or `AOConnectCommunity`. The only test that imports them mocks both (`shellPickerKey.test.tsx:43`, `:49`). Each mutation below left the 666 tests in the aoSignature, brand and agent-runtime suites green:

| Mutation | File | Committed tests |
|---|---|---|
| M1: terms and privacy boxes pre-ticked | `Enrollment.tsx:31-32` | GREEN |
| M2: marketing pre-ticked | `Enrollment.tsx:33` | GREEN |
| M3: tick guard and disabled state removed | `Enrollment.tsx:56`, `:178` | GREEN |
| M5: terms gate only when `needsAgent`, so an unenrolled person with an agent reaches self-mint | `Shell.tsx:51` | GREEN |
| M6: self-mint runs on mount, with no press and no credential guard | `ConnectCommunity.tsx:44`, `:64` | GREEN |

So the check's "show that a pre-ticked box fails" cannot be met by the committed suite. I rated this HIGH because these are carried rules with nothing guarding them.

Fix: commit a render test for each screen. A throwaway render test showed this is practical. It passed on the unmodified code, and went red on a pre-ticked terms box (`T1`).

**H2. A person with a PDS session and an agent never reaches the terms screen (check 5).**
`hooks.ts:42` returns `'shell'` only for `currentDid === r.did && r.needsAgent`, and does not look at `enrolled`.

- **Scenario:** someone signed in with their handle links Signature (or gets a 403 `enrollment-required`). The record is `enrolled: false, needsAgent: false`, so the gate returns `null` and the normal app renders.
- **Effect:** the terms screen is unreachable, so they cannot enroll and the runtime's refusals never clear. `noteAOEnrollmentRequired` flips a flag that nothing shows in this state.
- **Contradicts:** the `Enrollment.tsx` docblock ("nothing else of Community is reachable before") and the P5 report's "sends the person back to the terms screen".
- **Proof:** throwaway `T5` expected `'shell'` and received `null`. Control `T6` (enrolled) correctly returned `null`.
- **Bearer:** `aoRuntimeBearer` (`store.ts:210`) also ignores `enrolled`, so the client relies wholly on the runtime to refuse. That refusal is not in this range.

Fix: add `!r.enrolled` to the same-DID condition, with a test.

**H3. The rename ships with the env empty (check 3, carried rule "dark means no behaviour change").**
I resolved `app.config.js` at both commits with the Signature env removed. The differences:

| Field | `985d2d93b` | `edcf058f8` |
|---|---|---|
| `expo.name` | `Authority-One` | `Signature Community` |
| `ios.infoPlist.CFBundleDisplayName` | `authority-one` | `Community` |
| `plugins` | absent | `withAndroidAppLabelPlugin` with `label: Community` |

- **Source:** `brands/authority-one/brand.json:2-3` and `app.config.js:549`. Neither reads the env.
- **Effect:** the next build changes the home-screen label on iOS and Android and the store name, whether or not Signature is armed. The commit's "still dark" does not hold for these fields.
- **Locked in:** the golden was regenerated, including every `signature=off` hash. Reverting the rename (M15) or the plugin (M18) turns the `default brand resolves to the base config` tests red. So `brandConfig.test.js` now enforces the rename and can't detect this.
- **Possible overrule:** the commit and `app.config.js` attribute the names to Elliott (D2, 2026-11-03). That records the names, but I found nothing saying they ship unarmed, and the rollout plan is not in this repo. The carried rules allow Elliott to overrule. If that is the decision, record it and H3 closes with no code change. Otherwise, gate the names or move the rename to the arming release.

### MED

**M1. A 403 `enrollment-required` on the self-mint screen does not send the person back to terms.**
`ConnectCommunity.tsx:45-55` treats it as a generic failure, and the component never calls `noteAOEnrollmentRequired`. If the runtime stops counting the person as enrolled (for example after a terms version bump), they see "Accept Community's terms to continue" with only Try again, and it never clears. Sign-out is still available. `AgentPicker` and `agentsClient` both handle this case. Proof: throwaway `T4` recorded 0 calls.

**M2. The marketing tick survives a stale reload (carried rule "unticked").**
`Enrollment.tsx:65-66` resets terms and privacy but not `consents`. After `terms-version-stale`, or any other failed accept, the marketing box stays ticked against the newly loaded ask and is sent with it. The code comment and the P5 report both say the screen unticks. The person did tick it once and can see it, which is why this is MED and not HIGH. Proof: throwaway `T3` expected `[false, false, false]` and received `[false, false, true]`.

**M3. The other enrollment paths are also untested.** Each mutation left the suite green:

| Mutation | Line |
|---|---|
| M10: a persisted record decodes as `enrolled: true` (fail-open on reload) | `store.ts:97` |
| M11: `agentsClient` send-back removed | `agentsClient.ts:24` |
| M12: `AgentPicker` send-back removed | `AgentPicker.tsx:42` |

### LOW

- **L1.** `pdsBroker.ts` `xrpc` has no timeout, unlike runtime calls. A hung `createSession` leaves Connect disabled until the screen is remounted.
- **L2.** After a successful connect, the screen says "Your Community account is connected" while the timeline still needs the handle sign-in below it (P5 report, open item 1). The `Shell.tsx:22-23` docblock is also out of date, since this lane can now hand a PDS token to the device.
- **L3.** `decodeEnrollmentAsk` accepts any `ask.app`, so an ask for another app would be shown as Community's terms.
- **L4.** Style against `CLAUDE.md`: new strings use `_(msg...)` rather than the `l` macro, and two new `errors.ts` strings use an em dash. This matches the surrounding feature, so a later refactor is fine.

## Evidence by check

### 1. Terms box
- Own boxes: `Enrollment.tsx:114` (terms), `:137` (privacy), each with its own state, unticked at `:31-33`.
- Before self-mint: `Shell.tsx:51` checks `!record.enrolled` first, and self-mint sits at `Shell.tsx:69`.
- A new session cannot inherit ticks: `key={record.sid}` at `Shell.tsx:54`.
- Runtime behaviour on unmodified code (throwaway): `T1` all three boxes false and Continue disabled; `T2` one tick is not enough and both enroll exactly once.
- Pre-ticked fails: only under the throwaway `T1`, not the committed suite (H1).
- `client.ts` hardcodes `accept_terms: true`, which is safe only because of the guard at `Enrollment.tsx:56`. That guard is unprotected by tests (M3 mutation).

### 2. Self-mint screen
- Screen: `ConnectCommunity.tsx:118`; the mint call is `connect` at `:61`, reached only from the button at `:159`.
- On mount it only asks for a PDS session (`:45`) and does not mint. The form shows only on 409 `pds-credential-unavailable`.
- The password is cleared on success and on failure, and goes to the PDS only. The runtime receives the access JWT, and the session is ended with `deleteSession` in `finally`.
- Committed tests cover the function, not the screen: `community.test.ts:278`, `:309`. Mutation M17 (no `deleteSession`) goes red.

### 3. Dark
- JS gates: `config.ts:207` (`AO_SIGNATURE_CONFIG` null), `hooks.ts:37`, `store.ts:210` bearer, `agentsClient.ts:18`, `controller.ts` `aoPdsBroker`.
- Test: `dark.test.tsx:66`, `:71`, `:77`. M13 (arm check removed from `agentsClient`) goes red in `fetchOwnerAgents`.
- M14 (`hooks.ts:37` removed) stays green because a dark store never holds a record, so that line is a second layer and not the only guard.
- An old `authorityone` scheme now leaves native unarmed: `community.test.ts:89`.
- New JS is present in the bundle but unreachable while dark, so bundle bytes do differ from the base. Config differences are in H3.

### 4. Lexicon hash: PRE-EXISTING
- Check: `src/lib/lexicon/__tests__/lexicon.test.ts:125`, `group/post.json is byte-identical to the spike copy`.
- Ran on `985d2d93b` and on `edcf058f8`: both fail the same way, expected `678fa536...`, received `79c0a46b...`.
- Cause: `b424c48a6` (2026-10-29) edited `post.json` without updating the hash. `97d49d43b` still has the expected hash.
- `lexicons/` and `src/lib/lexicon` have no diff in the range.

### 5. Enrollment
- Client refusal: `Shell.tsx:51`; `wire.ts:146` and `store.ts:97` accept only an explicit `true`.
- Tests: `shellPickerKey.test.tsx:107` (M4 red), `community.test.ts:106` (M9 red), `session.test.ts:250` (M16 red).
- Holes: H2, M1, M3. The server refusal itself is out of range.

### 6. Operator link only
- `pdsBroker.ts:136-137` refuses a different DID before calling the runtime: `community.test.ts:309` (M7 red).
- `wire.ts` `decodePdsSession` requires the same DID: `community.test.ts:122` (M8 red).
- The existing link path still needs `linked` to the exact DID (`wire.ts:128-129`) and is unchanged.
- No merge code in the range. The only added line containing "merge" is prose in the P5 report ("Nothing was merged").

### 7. Reflections
No path or added line in the range mentions Reflections, and no tracked path in the repo matches it.

### 8. Secrets
I scanned the added lines for keys, tokens, JWTs and private-key shapes. The only hits are clearly fake test values (`'pw'`, `'y'`) and the `password` parameter itself. Golden additions are hashes and the rename only.

## Test runs

Run on Windows at `edcf058f8`.

| Run | Result |
|---|---|
| Full jest | 2 tests failed, 2699 passed, 28 todo; 4 of 209 suites failed |
| Same 4 suites at `985d2d93b` | Same 4 suites and same 2 tests fail, so none are new |
| `tsc` (`tsconfig.communities.json`) | Clean |
| `tsgo` (`tsconfig.check.json`) | 82 errors, all missing compiled `locales/*/messages` |
| eslint on changed source | Clean |

The 4 failing suites:
- `lexicon.test.ts`: check 4.
- `__tests__/lib/string.test.ts`: compiled locale messages are missing, and CI compiles them.
- `withUISceneLifecycle.test.js`: template regex mismatch. I suspect Windows line endings but did not confirm it.
- `noBackgroundLocationShipped.test.ts`: substring mismatch, same suspicion and also unconfirmed.

The commit's "2747 pass, 1 failure" was not reproduced on this machine because of those environment failures.

## How this was run, and limits

- **Dependencies:** `pnpm` is not installed here, and the approved `npm ci` cannot work because the repo has only `pnpm-lock.yaml`. I installed nothing. I temporarily linked `node_modules` by junction from another worktree with an identical lockfile (`1b4f3c1b`), and removed the junction afterwards.
- **Tools:** jest, tsc, tsgo and eslint were run directly with the script's env, not through `pnpm`, which departs from the `CLAUDE.md` rule. `--bail` was dropped to see every failure. Node was 24.14.0 against the required 24.15.
- **Throwaways:** the test file (`T1`-`T6`) and all mutations were local only, were reverted or deleted, and were never pushed. `T1`-`T6` used stubbed UI components, so they prove state and handlers, not pixels.
- **Blocked command:** the deny-list blocked one of my commands because it listed the environment. I did not need the listing and removed those variables by name instead.
- **Not verified:**
  - No device or simulator run.
  - Whether tapping a terms or privacy link inside a box's label also ticks that box. The links are nested inside `Toggle.Item`. Please check this on a device, because a link tap that ticks the box would break the "ticked by the person" rule.
  - Runtime enforcement of enrollment and of `/auth/ao/pds-credential`, which is not in this range.
- **No live activity:** no deploy, upload, live call, flag arming or token use.

VERDICT: NOT CLEAN. BLOCKER 0, HIGH 3, MED 3, LOW 4.
