# Re-review: Signature P5 Community, `edcf058f8..905706c1b` (round 425b, re-kick)

Independent, read-only, static re-review of `sig/community-signin` @ `905706c1b`. The range is one commit with 8 files. Baseline: `review/edcf058f8-sig-p5-r419` (HIGH 3, MED 3, LOW 4).

**Verdict: CLEAN on the BLOCKER or HIGH gate, static only. BLOCKER 0, HIGH 0, MED 0, LOW 8.**

**H1 and H2 are fixed in the code, but not proven closed.** No test or mutation ran in this round, so no RED was shown. Six of the nine checks are PARTIAL for that reason. Run the list under "Still to run" before relying on this verdict for release.

## What changed from the earlier report on this branch

This replaces the report from run `b9f31f64` (`d36eed806`, still in this branch's history).

| | `b9f31f64` | This run |
|---|---|---|
| Verdict | NOT CLEAN, because verification was incomplete | CLEAN on the gate, with the same limit stated |
| Findings | No BLOCKER, HIGH or MED; LOW 7 | No BLOCKER, HIGH or MED; LOW 8 (adds L8) |
| Checks 3 and 8 | PASS | Check 3 is PARTIAL; check 8 stays PASS |

The evidence did not get stronger. The verdict differs because this task sets the gate at BLOCKER or HIGH and tells me to report dependency-bound checks as PARTIAL. Missing test runs therefore show as PARTIAL, not as a failed gate. **If you want "CLEAN" to require RED evidence, treat this as NOT CLEAN until the list below has run.**

## Check results

"Expected RED" means I traced the revert through the test by hand. Nothing was run.

| # | Check | Result | Code | Test expected to go RED on revert |
|---|---|---|---|---|
| 1 | H1: committed tests render both screens | **PARTIAL**: tests exist, RED not shown | `Enrollment.tsx:31-33`, `ConnectCommunity.tsx:69-72` | `screens.test.tsx:170`, `:257` |
| 2 | H2: gate honours `enrolled` | **PARTIAL**: fix is correct, RED not shown | `hooks.ts:44` | `shellPickerKey.test.tsx:157` |
| 3 | H3: nothing else in the rename changes dark behaviour | **PARTIAL**: no finding from the full diff, config and prebuild not run | `app.config.js:113`, `:233-235`, `:549` | Brand golden, regenerated in the rename (see check 3) |
| 4 | Terms unticked, before self-mint | **PARTIAL**: code holds, RED not shown | `Enrollment.tsx:31-33`, `Shell.tsx:51`, `:69` | `screens.test.tsx:170`; `shellPickerKey.test.tsx:123` |
| 5 | Self-mint only after a person acts | **PARTIAL**: code holds, RED not shown | `ConnectCommunity.tsx:69-72`, `:168` | `screens.test.tsx:257`, `:266` |
| 6 | Dark with the env empty | **PARTIAL**: code holds, tests not re-run | `config.ts:207`, `hooks.ts:37` | `dark.test.tsx:66`, `:77`, `:89`, `:95` |
| 7 | Lexicon hash unchanged | **PASS**: measured | `lexicon.test.ts:115` | Pre-existing failure, not new |
| 8 | Per-app enrollment, link never merge | **PASS**: code unchanged since baseline, RED carried from round 419 | `Shell.tsx:51`, `pdsBroker.ts:136`, `wire.ts:128-131`, `store.ts:97` | `community.test.ts:309`, `:122`, `:106`; `wire.test.ts:84` |
| 9 | Reflections untouched, no secrets | **PASS**: scanned | whole diff | n/a |

## Evidence by check

### 1. H1: render tests
`screens.test.tsx` renders the real `AOEnrollment` and `AOConnectCommunity`. The UI kit is stubbed with host elements that keep a toggle's value and a button's disabled state.

| Revert | Test expected to go RED | Why |
|---|---|---|
| Terms, privacy or marketing pre-ticked (`Enrollment.tsx:31-33`) | `every box starts UNTICKED and Continue is disabled` (`:170`) | Reads all three values and expects `false` |
| `disabled` removed (`Enrollment.tsx:180`) | Same test | `continueDisabled()` expects `true` |
| Tick guard removed (`Enrollment.tsx:56`) | `the press handler itself refuses without both ticks…` (`:204`) | Calls the raw handler past `disabled` |
| Mint on mount that calls `connectCommunityAccount` directly | `never self-mints on mount…` (`:257`) | `mockConnect` must not be called |
| Credential guard removed (`ConnectCommunity.tsx:72`) | `self-mint runs only on press…` (`:266`) | Presses with a handle and no password |

Two limits:
- **Auto-mint mutation:** adding a bare `void connect()` to the mount effect stays green, because the guard at `:72` stops it with empty fields and nothing is minted. A valid RED mutation has to skip that guard, as baseline M6 did.
- **Stubs:** the tests prove state and handlers, not the real `Toggle` or what appears on screen.

### 2. H2: gate
`hooks.ts:44` now reads `currentDid === r.did && (!r.enrolled || r.needsAgent)`. I traced the path by reading:

1. The gate returns `'shell'`.
2. `createNativeStackNavigatorWithAuth.tsx:142-143` renders `AOSignatureShell`. A guest game link skips this gate, which is an existing waiver.
3. `Shell.tsx:51` renders `AOEnrollment` before the picker or self-mint.
4. Accepting calls `adoptEnrollment` (`session.ts:274`, reached from `Enrollment.tsx:61`), which sets `enrolled: true`, and the gate returns `null`.

Tests:
- `shellPickerKey.test.tsx:157`: same person with an agent, not enrolled, gets `'shell'`. Reverting `:44` to `r.needsAgent` returns `null`, so this should go RED.
- `shellPickerKey.test.tsx:164`: controls for an enrolled person and for another account.
- `screens.test.tsx:182`: the person can enrol.

These cover the path piece by piece. No single test walks all of it.

**No new dead end:** if the runtime is down, the person has Try again (`Enrollment.tsx:81`) and sign-out (`AccountActions.tsx:59`). `signOutAO` clears the record even when the server call fails, which returns the gate to `null`.

### 3. H3: the rest of the rename
The display name is not rated. See Questions.

The range itself does not touch `app.config.js`, `brands/`, `plugins/` or the golden, so I read `git diff 985d2d93b..905706c1b` on those files. Beyond the name fields, it changes only:

- **Signature schemes:** `brand.signature.schemes` is read only by `scripts/lint-brand-config.js:131`.
- **Scheme allow-list:** `app.config.js:113` matters only when `EXPO_PUBLIC_AO_SIGNATURE_SCHEME` is set. Unset, `scheme` stays `'one'` (`:233-235`).
- **Android label plugin:** `plugins/withAndroidAppLabelPlugin.js` writes only the `app_name` string, and it is part of the known name flag.

Bundle id, slug, `owner`, `.github/` and `eas.json` have no diff. `src/` has no reader of the app name for behaviour.

**Why PARTIAL:**
- `app.config.js` needs dependencies, so I could not resolve it. The builder's "exactly three fields" table matches my reading and round 419's measured table, but I did not reproduce it.
- The golden cannot show dark equivalence with the pre-rollout build, because the rename regenerated every `signature=off` hash. It only pins the new state.
- No prebuild ran. `expo.name` should also change the generated iOS project name. `withUISceneLifecycle.js:253`, `:262` look that name up instead of hardcoding it, and the only hardcoded `AuthorityOne` in `plugins/` is in tests and fixtures. I found nothing that breaks.
- `.github/workflows/build-submit-ios.yml:153`, `:160` hardcode `Bluesky.ipa` and `Bluesky.app.dSYM.zip`. They predate this work and are not in the diff. I cannot tell without a build whether those paths match the real output, so check them at the first native build.

### 4 and 5. Terms and self-mint
- **Unticked:** `Enrollment.tsx:31-33`.
- **Terms first:** `Shell.tsx:51` checks `!record.enrolled` before the self-mint branch at `:69`. Test: `Shell order…` (`shellPickerKey.test.tsx:123`). Changing `:51` to apply only when `needsAgent` should go RED at `:135`.
- **Ticks do not carry to a new session:** `key={record.sid}` at `Shell.tsx:54`. L8 covers a narrower case.
- **Stale reload (M2):** `Enrollment.tsx:68`, test `screens.test.tsx:217`.
- **Self-mint:** `connect` (`ConnectCommunity.tsx:69`) is reached only from the button at `:168`. On mount the screen calls only `b.get` (`:50`), and `pdsBroker.ts:38-59` shows that call asks for a session and sends no credential.
- **M1:** `ConnectCommunity.tsx:56`, `:90`, tests `screens.test.tsx:292`, `:302`.

### 6. Dark
- **The switch:** `AO_SIGNATURE_CONFIG` (`config.ts:207`) is null when the env is empty, and every path below depends on it.
- **Gate:** `hooks.ts:37` returns `null` before the new clause at `:44`, so H2 cannot act while dark.
- **Runtime client:** `agentsClient.ts:18` returns before the new `enrollment-required` branch at `:24`.
- **Tests:** `dark.test.tsx:66` (no config), `:71` (renders nothing), `:77` (gate always null), `:89` (bearer is the PDS token), `:95` (store inert). The file has no diff in this range.
- **Second layer only:** removing `hooks.ts:37` alone should stay green, as round 419's M14 showed, because a dark store never holds a record. `dark.test.tsx:77` therefore does not pin that line by itself.

### 7. Lexicon hash
SHA-256 of the committed `lexicons/com/authorityone/group/post.json`:

| Commit | Hash |
|---|---|
| `985d2d93b` | `79c0a46be3f8d8e6…` |
| `edcf058f8` | `79c0a46be3f8d8e6…` |
| `905706c1b` | `79c0a46be3f8d8e6…` |
| Expected by `lexicon.test.ts:115` | `678fa536825aac19…` |

The range has no change to `lexicons/` or `src/lib/lexicon`. This matches the pre-existing finding from round 419, which traced it to `b424c48a6`.

### 8. Enrollment and link
`pdsBroker.ts`, `wire.ts`, `store.ts`, `signIn.ts` and `Shell.tsx` have no diff in this range, so round 419's RED evidence applies to the same code. I did not re-run it.

- Only an explicit `enrolled: true` survives (`store.ts:97`, `wire.ts:146`). `session.test.ts` adds a test for this in the range.
- A different DID is refused before the runtime is called (`pdsBroker.ts:136`, `community.test.ts:309`).
- A session answer must name the same DID (`decodePdsSession`, `community.test.ts:122`).
- A link must come back `linked` to the exact DID (`wire.ts:128-131`, `wire.test.ts:84`).
- The range adds no merge code. Server-side refusal is not in this repo's range and is not verified.

### 9. Reflections and secrets
- **Reflections:** no changed path matches, and no added line in `985d2d93b..905706c1b` mentions it.
- **Secrets:** added lines have no hits for AWS, GitHub, OpenAI-style or Slack keys, JWTs or private-key blocks. A wider `password`, `secret` and `token` search on the range found only test code and report prose. The only password value is the fake `'pw'`.

## Findings

No BLOCKER, HIGH or MED. All LOWs come from reading the code and none were observed running.

### LOW, new since baseline

- **L5. `AgentPicker`'s send-back is still untested (the remainder of baseline M3).** The only test importing `AgentPicker` mocks it, so removing `AgentPicker.tsx:42` should stay green. The builder's report discloses the gap, but its "every MED is fixed" overstates it slightly. The call itself is correct.
- **L6. The password clear on success has no test.** `screens.test.tsx:289` covers only the failure path (`ConnectCommunity.tsx:89`), so removing `:85` should stay green. The value would stay in memory until the screen remounts.
- **L7. The social app can render before the stored record is read (armed only).** With a PDS session and `loaded: false`, `hooks.ts:38-40` returns `null`, so an unenrolled person may briefly see the social app before the gate flips. This contradicts the comment at `hooks.ts:42-43` and the `Enrollment.tsx` docblock. The runtime refusal is the backstop, but it is not in this range.
- **L8. Ticks made during a stale reload carry onto the newer terms (armed only).** After a failed accept, `Enrollment.tsx:66-69` unticks the boxes and reloads, but the old ask stays on screen with live toggles until the answer arrives. If the person re-ticks in that window, the `setAsk` at `:45` swaps in the newer ask without clearing the ticks, and Continue accepts versions they did not tick against. The window is one network round trip, and the links do point to the new ask by then. `screens.test.tsx:217` does not cover it. Fix: untick again whenever a new ask loads, or hide the boxes until it does.

### LOW, carried from baseline and unchanged
- **L1.** `pdsBroker.ts` `xrpc` has no timeout.
- **L2.** Connected-copy wording and the stale `Shell.tsx:22-23` docblock. The comment at `createNativeStackNavigatorWithAuth.tsx:123-124` also no longer mentions the terms.
- **L3.** `decodeEnrollmentAsk` does not check `ask.app`.
- **L4.** `_(msg)` style and em dashes in `errors.ts`.

## Questions (not rated)

- **For Elliott:** should dark builds carry the new display name? This is the known flag, recorded only as a question. A related point: `CFBundleSpokenName` is still `Authority One` (`app.config.js:292`).
- **Needs a device:** does tapping a terms or privacy link inside a box's label also tick that box? This is still open from round 419. The stubs drop label content, so the new tests cannot answer it.

## Still to run

These need dependencies, which this round was barred from installing.

1. The full suite, `tsc`, `tsgo` and eslint at `905706c1b`. Round 419 saw 3 further failing suites on this Windows machine, from missing compiled locales and suspected line endings. Compare against those rather than expecting only the lexicon failure.
2. Reverts expected to go RED:
   - `Enrollment.tsx:31`, `:32`, `:33` pre-ticked
   - `Enrollment.tsx:56` guard removed
   - `Enrollment.tsx:68` reset removed
   - `Enrollment.tsx:180` disabled removed
   - `ConnectCommunity.tsx:72` guard removed
   - a direct `connectCommunityAccount` call on mount
   - `ConnectCommunity.tsx:56` and `:90` removed
   - `hooks.ts:44` reverted to `r.needsAgent`
   - `Shell.tsx:51` terms only when `needsAgent`
3. Reverts expected to stay GREEN, which would confirm L5 and L6: `AgentPicker.tsx:42` and `ConnectCommunity.tsx:85`.
4. Resolve `app.config.js` with the Signature env empty at `985d2d93b` and `905706c1b` and diff the output, then run one prebuild.

The builder's report claims 14 of 14 mutations went RED and 2762 tests pass. I did not reproduce either figure.

## How this was run

- **Commands:** only git, read-only shell tools and `sha256sum`. I ran no install, no `npm ci` dry run, no junction and no package scripts.
- **Spec conflict:** the task body allows "the approved npm ci", but the binding constraint says no install of any kind (Dispatch r427). I followed the constraint.
- **Branches:** this worktree's local `sig/community-signin` was stale at `571924785`. `905706c1b` is what origin has, and I read that code. `review/905706c1b-sig-p5-r425b` is still checked out in the `b9f31f64` worktree, so I committed on a local branch and fast-forwarded the named remote branch.
- **No live activity:** no deploy, upload, live call, flag arming, account change or token use.

VERDICT: CLEAN (static only; gate BLOCKER or HIGH; no test run, no RED shown; checks 1-6 PARTIAL). BLOCKER 0, HIGH 0, MED 0, LOW 8.
