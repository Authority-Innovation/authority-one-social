# Re-review: Signature P5 Community, `edcf058f8..905706c1b` (round 425b)

Independent, read-only re-review of `sig/community-signin` @ `905706c1b`. The range is one commit with 8 files. Baseline: `review/edcf058f8-sig-p5-r419` (HIGH 3, MED 3, LOW 4).

**Verdict: NOT CLEAN, because verification is incomplete. No test was run and no RED was shown. I found no BLOCKER, HIGH or MED by reading the code.**

## The main limit: this is a static review

The task asks me to show each test going RED. I could not do that, so **no test, mutation, type check or lint ran in this round.**

- **Why:** the only approved install is `npm ci`. The repo has only `pnpm-lock.yaml`, pnpm is not on this machine, and npm refuses with `EBADDEVENGINES` (Node 24.14.0, repo wants ^24.15.0).
- **What I asked:** whether I could link `node_modules` by junction from another worktree, as round 419 did (qid `2a66a1cf`). There was no answer after about 30 minutes of waiting.
- **What I did:** I did not make the junction. It reaches outside this worktree, the install rule is binding, and no one approved it.
- **To finish:** approve that route or provide an install, then run the mutations listed under "Still to run". They are the only thing keeping this from a full result.

"Expected RED" below means I traced the revert through the test by hand. The builder's report claims 14 of 14 mutations go RED and 2762 tests pass. I did not reproduce either figure.

## Check results

| # | Check | Result | Code | Test that should go RED on revert (not run) |
|---|---|---|---|---|
| 1 | H1: committed tests render both screens | **PARTIAL**: tests exist and look sound, RED not shown | `screens.test.tsx` | `every box starts UNTICKED…` (`:170`); `never self-mints on mount…` (`:257`) |
| 2 | H2: gate honours `enrolled` | **PARTIAL**: fix is correct, RED not shown | `hooks.ts:44` | `a PDS session for the SAME person…` (`shellPickerKey.test.tsx:157`) |
| 3 | H3: nothing else in the rename changes dark behaviour | **PASS** by reading; config not resolved | `app.config.js:233-235`, `:548-549` | Existing `brandConfig` golden, not re-run |
| 4 | Terms unticked and before self-mint | **PARTIAL**: code holds, RED not shown | `Enrollment.tsx:31-33`, `Shell.tsx:51` | `screens.test.tsx:170`; `Shell order…` (`shellPickerKey.test.tsx:123`) |
| 5 | Self-mint only after an explicit action | **PARTIAL**: code holds, RED not shown | `ConnectCommunity.tsx:69-72`, `:168` | `screens.test.tsx:257`; `self-mint runs only on press…` (`:266`) |
| 6 | Dark with the env empty | **PARTIAL**: code holds, tests not re-run | `hooks.ts:37`, `config.ts` | `dark.test.tsx:66`, `:71`, `:77`, `:89`, `:95` |
| 7 | Lexicon hash unchanged | **PASS**: measured | `lexicon.test.ts:114-115` | Pre-existing failure, not new |
| 8 | Per-app enrollment, link never merge | **PASS** by reading, with baseline RED evidence | `Shell.tsx:51`, `pdsBroker.ts:136`, `wire.ts:128-131` | Round 419 mutations M4, M7, M8, M9, M16 |
| 9 | Reflections untouched, no secrets | **PASS**: scanned | whole diff | n/a |

## Evidence by check

### 1. H1 render tests
`screens.test.tsx` renders the real `AOEnrollment` and `AOConnectCommunity`, with the UI kit stubbed by host elements that keep a toggle's value and a button's disabled state.

Expected RED, traced by hand:

| Revert | Test |
|---|---|
| Terms, privacy or marketing pre-ticked (`Enrollment.tsx:31-33`) | `every box starts UNTICKED and Continue is disabled` (`:170`) reads all three values |
| `disabled` removed (`Enrollment.tsx:180`) | Same test, through `continueDisabled()` |
| Tick guard removed (`Enrollment.tsx:56`) | `the press handler itself refuses…` (`:204`) calls the raw handler past `disabled` |
| Auto-mint on mount (`ConnectCommunity.tsx:46-67`) | `never self-mints on mount…` (`:257`) expects `mockConnect` not called |
| Credential guard removed (`ConnectCommunity.tsx:72`) | `self-mint runs only on press…` (`:266`) presses with a handle and no password |

Limit: the UI kit is stubbed, so these tests prove state and handlers, not the real `Toggle` or pixels.

### 2. H2 gate
`hooks.ts:44` now reads `currentDid === r.did && (!r.enrolled || r.needsAgent)`. The path is correct when read end to end:

1. The gate returns `'shell'`.
2. `createNativeStackNavigatorWithAuth.tsx:142-143` renders `AOSignatureShell`.
3. `Shell.tsx:51` renders `AOEnrollment`.
4. Accepting calls `adoptEnrollment`, which sets `enrolled: true`, and the gate returns `null`.

- **Tests:** `shellPickerKey.test.tsx:157` (gate), `:164` (enrolled and other-account controls), `:123` (Shell order) and `screens.test.tsx:182` (can enrol). They cover the path piece by piece; no single test walks all of it.
- **No dead end from the fix:** this gate now replaces the social app for a person with a PDS session. If the runtime is down, they still have Try again (`Enrollment.tsx:81`) and sign-out. `signOutAO` clears the record even when the server call fails (`session.ts:160-165`), and that returns the gate to `null`.

### 3. H3 as far as the code goes
The range does not touch `app.config.js`, `brands/`, `plugins/` or the golden. Reading `git diff 985d2d93b..905706c1b` on those files, the rename changes these env-independent items:

- `expo.name`, `CFBundleDisplayName` and the Android label plugin. These are the known flag and are not rated.
- `brand.signature.schemes`. Only `scripts/lint-brand-config.js:131` reads it, so it has no dark effect.
- The scheme allow-list in `app.config.js:113`. It applies only when `EXPO_PUBLIC_AO_SIGNATURE_SCHEME` is set. With it unset, `scheme` stays `'one'` (`app.config.js:233-235`).

Bundle id, slug, `scheme` and `owner` are unchanged. `src/` has no reader of the app name for behaviour (no `applicationName` hit).

Two things I could not confirm:

- **Config not resolved.** `app.config.js:8` needs a dependency, so I could not run it. The builder's "exactly three fields" table matches the baseline's table and my reading, but I did not reproduce it this round.
- **Prebuild not run.** As far as I know, Expo derives the iOS project and target name from `expo.name`, so `.app` and project paths would change. `withUISceneLifecycle.js:253`, `:262` look the name up rather than hardcoding it. The only hardcoded `AuthorityOne` in `plugins/` is a test fixture. I found nothing that breaks, but a prebuild should confirm it.

### 4 and 5. Terms and self-mint
- **Terms first:** `Shell.tsx:51` checks `!record.enrolled` before the self-mint branch at `:69`.
- **Ticks do not carry over:** `key={record.sid}` at `Shell.tsx:54`, and `setConsents({})` now clears marketing on a failed accept (`Enrollment.tsx:68`, test `screens.test.tsx:217`).
- **Self-mint:** `connect` (`ConnectCommunity.tsx:69`) is reached only from the button at `:168`. On mount the screen only calls `b.get` (`:50`).
- **M1 closed in code:** `ConnectCommunity.tsx:56`, `:90`, tests `screens.test.tsx:292`, `:302`.

### 6. Dark
- `hooks.ts:37` returns `null` before the new clause at `:44`, so H2 cannot act while dark.
- `dark.test.tsx` is unchanged in the range.
- Round 419 found that removing `hooks.ts:37` alone stays green, because a dark store never holds a record. That makes it a second layer, and it is still true.

### 7. Lexicon hash
SHA-256 of the committed `lexicons/com/authorityone/group/post.json`:

| Commit | Hash |
|---|---|
| `985d2d93b` | `79c0a46be3f8d8e6…` |
| `edcf058f8` | `79c0a46be3f8d8e6…` |
| `905706c1b` | `79c0a46be3f8d8e6…` |
| Expected by `lexicon.test.ts:115` | `678fa536825aac19…` |

`lexicons/` and `src/lib/lexicon` have no diff in `985d2d93b..905706c1b`. This is unchanged from the baseline's pre-existing finding.

### 8. Enrollment and link
`pdsBroker.ts`, `wire.ts`, `store.ts` and `Shell.tsx` have no diff in this range, so the baseline's evidence still applies. Only an explicit `enrolled: true` survives a reload (`store.ts:97`, `wire.ts:146`). A different DID is refused (`pdsBroker.ts:136`, `wire.ts:128-131`). No merge code was added. Server-side refusal is not in this repo's range and is not verified.

### 9. Reflections and secrets
- **Reflections:** no changed path matches, and no added line in `985d2d93b..905706c1b` mentions it.
- **Secrets:** I scanned added lines for AWS, GitHub, OpenAI-style and Slack keys, JWTs and private-key shapes, with no hits. The only password value is the fake `'pw'` in tests.

## Findings

No BLOCKER, HIGH or MED.

### LOW, new in this round

- **L5. `AgentPicker`'s send-back is still untested (the rest of baseline M3).** Nothing renders `AgentPicker`, so removing `AgentPicker.tsx:42` should stay green. The builder's report discloses this but argues `agentsClient` pins the routing. That test does not exercise this line, so "every MED is fixed" overstates it slightly. The call itself is correct.
- **L6. The password clear on success has no test.** `screens.test.tsx:289` covers only the failure path (`ConnectCommunity.tsx:89`). Removing `:85` should stay green. The value stays in state only until the screen remounts.
- **L7. The social app can render before the stored record is read (armed only).** With a PDS session and `loaded: false`, `hooks.ts:38-40` returns `null`, so an unenrolled person may briefly see the social app before the gate flips. This is from reading the code and I did not see it happen. The `hooks.ts:42` comment says "before the social app renders", which does not hold in that window.

### LOW, carried from baseline and unchanged
- **L1.** `pdsBroker.ts` `xrpc` has no timeout.
- **L2.** Connected-copy wording and the stale `Shell.tsx:22-23` docblock. The navigator comment at `createNativeStackNavigatorWithAuth.tsx:123-124` is also now out of date, because it does not mention the terms.
- **L3.** `ask.app` is not checked.
- **L4.** `_(msg)` style.

## Questions (not rated)

**For Elliott:** should dark builds carry the new display name? This is the known flag, recorded here only as a question. A related point is that `CFBundleSpokenName` is still `Authority One` (`app.config.js:292`), which may also need deciding.

**Still unverified from round 419:** whether tapping a terms or privacy link inside a box's label also ticks that box. This needs a device.

## Still to run

Once dependencies are available:

1. The full suite, `tsc`, `tsgo` and eslint at `905706c1b`.
2. These reverts, each expected RED:
   - `Enrollment.tsx:31`, `:32`, `:33` pre-ticked
   - `Enrollment.tsx:56` guard removed
   - `Enrollment.tsx:68` reset removed
   - `Enrollment.tsx:180` disabled removed
   - `ConnectCommunity.tsx:72` guard removed, plus a mint on mount
   - `ConnectCommunity.tsx:56` and `:90` removed
   - `hooks.ts:44` reverted to `r.needsAgent`
   - `Shell.tsx:51` terms only when `needsAgent`
3. These reverts, expected GREEN, which would confirm L5 and L6: `AgentPicker.tsx:42` and `ConnectCommunity.tsx:85`.

## How this was run

- **Branch:** this worktree's local `sig/community-signin` was stale at `571924785`, so I cut this report branch from `905706c1b`, verified on origin.
- **Commands:** only git, grep and Node's built-in `crypto`. One throwaway script tried to resolve `app.config.js` from a temp folder inside this worktree. It failed on a missing dependency and the folder was removed.
- **`npm ci --dry-run`:** I ran this once to confirm the failure. It installed nothing.
- **No live activity:** no deploy, upload, live call, flag arming, account change or token use.

VERDICT: NOT CLEAN (verification incomplete: no test run, no RED shown). BLOCKER 0, HIGH 0, MED 0, LOW 7.
