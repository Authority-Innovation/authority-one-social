# VERIFY - communities A1 fix round, round 498

- Task: `9763bdba` (independent, read-only, one round)
- Date: 2026-11-05
- Target: `58add3081` (commits `25fda0d53`, `445342b9e`, `58add3081`) on base `5a54c68b4`
- Fix report checked: `docs/FIX-communities-a1-r498.md` (at the target)
- This report: `docs/VERIFY-communities-a1-r498.md` on `review/verify-communities-a1-r498`. Nothing was pushed to the target.

## Verdict

**READY** for the stated purpose (flags OFF, arming planning).

| Item | Verdict |
| --- | --- |
| Target on `origin/fix/communities-r474` by fast-forward | **FIXED** (confirmed) |
| tsc TS2345 at `CommunityScreen.test.tsx:1012`: test typing only, tsc passes | **FIXED** |
| A1 jest failure: the test was wrong, the app is right | **FIXED.** The builder's claim is correct |
| A1 test not weakened; mutations fail it | **FIXED.** Stronger than before |
| No app code changed this round | **FIXED** (confirmed) |
| OPEN JOIN, consent step, D2 Option A, flags OFF | Unchanged (confirmed) |
| Community jest, node tests, community ESLint | All green |
| Full `pnpm lint` 92 errors | None in community paths; same set on base |
| Full jest failures | Pre-existing at `9321e90` and `5a54c68b4`. **Correction to the spec:** it is 4 failing suites and 2 failing tests, not 2 suites. The builder's "4 suites" is right |

One open item that is **not** from this round and does not block flags-OFF: `lexicon.test.ts > group/post.json is byte-identical to the spike copy` is a real failure, pre-existing since `b424c48a6`, which is a communities commit. It needs its own ruling (see "Full jest").

## 1. Is the target on origin?

- `origin/fix/communities-r474` = `58add3081abd003e93571105fe60fda8832c2c1d` (after `git fetch`).
- Parents run linearly: `58add3081` -> `445342b9e` -> `25fda0d53` -> `5a54c68b4`. `5a54c68b4` is an ancestor of `58add3081`, so this was a plain fast-forward.
- `git log 5a54c68b4..origin/fix/communities-r474` lists exactly the three round commits.

## 2. What changed (`git diff --stat 5a54c68b4 58add3081`)

```
 docs/FIX-communities-a1-r498.md                    | 152 +++++
 .../Community/__tests__/CommunityScreen.test.tsx   |  16 ++-
```

**No app code changed.** The only `src/` file touched is a test. `access.ts`, `descriptor.ts`, `queries.ts`, `JoinConsent.tsx`, `consent.ts`, `src/env/*`, `eas.json` and `app.config.js` show no diff.

## 3. tsc TS2345

- The change replaces `it.each([...] as const)` with a typed, mutable table `const listFailures: [string, communitiesClient.CommunitiesError][]`. It has the same two rows (`{kind: 'network'}` and `{kind: 'http', status: 404}`) and an unchanged test body. It is a typing fix only, and the rows still type-check against the real `CommunitiesError` union.

| Run | `tsc --noEmit -p tsconfig.communities.json` |
| --- | --- |
| Base `5a54c68b4` (its test file) | exit 2, TS2345 at `CommunityScreen.test.tsx(1012,5)` (readonly tuple vs mutable) |
| Target `58add3081` | **exit 0** |

## 4. A1: was the test wrong, and is it fixed correctly?

**App behaviour (unchanged, `src/screens/Community/access.ts`, `readCommunityHome`):** when the door omits `viewer_is_admin`, the app reads the caller's own list and sets `joined = mine.data.some(c => c?.id === id)`, where `id` is the route id. If the list fails to load, the result is `membership unknown`, which leads to the error state, not to a refusal. For a real member who joined community X and opens X, the list holds X, so `joined` is true and they get the member home. That is the right behaviour. Membership of a different community must not count.

**The old test was wrong:** `renderScreen()` defaults the route to `'btb'`, but `memberCommunity()` comes from `door.json`, whose community `id` is `'garden'` (`src/lib/communities/__fixtures__/door/door.json:13,33,52`). The old "joined member" test put `garden` on the list and opened `btb`, so it asked the app to treat a member of another community as a member. Proof: **with the base test file and the app mutated to "any entry counts" (`joined = mine.data.length > 0`), the A1 block passed 4 of 4.** The old test was encoding the bug that the r487 mutation is meant to catch.

**The new test:**

- "joined member" opens `renderScreen({id: joined.id})`, so the route, `GET /:id` and the list entry all name `garden`. The assertions are unchanged: member badge, no Join, no wall, no Admin badge, timeline read.
- "someone their list does not name" now puts `garden` on the list while the route is `btb`, instead of an empty list. That is strictly stronger, because it is the cross-community case.
- The list-failure cases (network, 404) are unchanged in substance: error state, with no Join, no not-member notice, no wall, no member badge and no timeline read.

**Not weakened.** Jest mutations on `access.ts` at the target, A1 block (`-t "omits viewer_is_admin"`), with the app restored after each run (`git status` clean):

| Mutation | Result | Failing test |
| --- | --- | --- |
| none | 4 pass | - |
| `const joined = false` (join record ignored) | **1 fail** | a joined member gets the member home |
| `const joined = mine.data.length > 0` (any entry counts) | **1 fail** | someone their list does not name gets the wall |
| `const joined = true` (everyone a member, extra) | **1 fail** | someone their list does not name gets the wall |
| Base test file + "any entry counts" | 4 pass (**not caught**) | - |

Base test file, no mutation: 3 pass and 1 fail (the joined-member case), which matches the reported red.

## 5. Rulings and flags

| Ruling | State at `58add3081` |
| --- | --- |
| OPEN JOIN (no invite, no approval) | Unchanged. `JoinConsent.tsx:9-10` and `consent.ts:6` still state open join; neither file changed |
| Consent step | Unchanged (`JoinConsent.tsx`, `consent.ts` not in diff; `JoinConsent.test.tsx` passes) |
| D2 Option A | Unchanged (no diff in consent or join code) |
| Flags OFF | Unchanged. `eas.json` has no diff vs base. `EXPO_PUBLIC_COMMUNITIES_ENABLED` is `"false"` in `base` and in every shipping profile (`development`, `preview`, `production`, `production-apk`, `testflight`, `testflight-android`); it is `"true"` only in `development-communities`, as before. `src/env/common.ts:206-207` enables only on `'1'`/`'true'`. `flags.test.ts` passes |

## 6. Results at the target

| Check | Result |
| --- | --- |
| Community jest (`src/screens/Community src/features/communities src/lib/communities communitiesClient src/lib/api/feed post.groupBinding`) | **25/25 suites, 507/507 tests**, 1/1 snapshot |
| Node tests r487 (C9-C11, A1) | **33/33** |
| Node tests r487 + r484 + r474 | **81/81** |
| `node scripts/communities/r487/mutations.mjs` | unmutated 33/33; **all 9 mutations caught** (C9 5, 10; C10 3, 2; C11 4; A1 3, 5, 2, 2) |
| ESLint `--quiet` on `src/screens/Community src/features/communities src/lib/communities src/lib/agent-runtime/communitiesClient.ts` | **0 problems** |
| Full ESLint `--quiet src modules` (the `pnpm lint` scope) | **92 errors, 0 in community paths** |

Full lint errors by file at the target: `src/locale/i18n.web.ts` 41, `src/screens/AgentChat/__tests__/useAgentChat.transportError.test.tsx` 27, `src/screens/AgentChat/useVoiceConversation.ts` 4, `src/lib/supabase/__tests__/client.test.ts` 4, `src/state/supabase/index.tsx` 4, `src/state/shell/color-mode.tsx` 3, `src/screens/AgentChat/__tests__/MessageBubble.test.ts` 3, `src/screens/AgentChat/__tests__/MessageBubble.links.test.ts` 3, `src/screens/AgentChat/__tests__/ApprovalCard.test.tsx` 2, `src/lib/supabase/client.ts` 1.

**Same on base:** the base-to-target diff contains only `CommunityScreen.test.tsx` and a doc, and that test file lints clean at the target (it is inside the 0-problem community run). None of the 10 files above differs between `5a54c68b4` and `58add3081`, so the base has the same 92 errors in those files. I did not run a separate full lint at the base; this conclusion follows from the diff.

## 7. Full jest (no `--bail`)

Target `58add3081`: **186 of 190 suites pass, 4 fail. 2395 tests pass, 2 fail, 28 todo (2425). Snapshots 26/26.**

| Failing suite | Cause | At `9321e90` | At `5a54c68b4` | Classification |
| --- | --- | --- | --- | --- |
| `__tests__/lib/string.test.ts` | Suite fails to run: `src/locale/locales/en/messages` missing because lingui catalogues are not compiled (postinstall `intl:compile-if-needed` did not run; CLAUDE.md says not to run `intl:compile`) | fails | fails | Environment |
| `plugins/uiSceneLifecycle/__tests__/withUISceneLifecycle.test.js` | Suite fails to run: fixture regex vs CRLF checkout (`core.autocrlf=true`) | fails | fails | Environment. **Verified: passes** with its directory checked out LF |
| `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts` | 1 test: expects `return\n`, reads CRLF `app.config.js` / `src/state/contextEngine/*` | fails | fails | Environment. **Verified: passes 4/4** with those files checked out LF |
| `src/lib/lexicon/__tests__/lexicon.test.ts` | 1 test: `group/post.json is byte-identical to the spike copy`. Pinned hash mismatch | fails | fails | **Real and pre-existing.** It still fails with LF. `b424c48a6` ("group.cid optional in the binding", an ancestor of `9321e90`) changed `lexicons/com/authorityone/group/post.json` and did not update the pin. Unrelated to this round, but it is communities-adjacent and needs a ruling: update the pin or the spike copy |

At both `9321e90` and `5a54c68b4`, running the same 4 suites gives 4 failed suites and 2 failed tests, with the same test names as at the target. **None is introduced by this round.** The spec's "2 failing suites" matches the 2 failing *tests*. The suite count is 4.

After the LF experiments, the worktree was restored with a normal checkout (`git status` clean).

## How it was run

- Worktree detached at `58add3081`, and later at `9321e90` and `5a54c68b4` for the base runs. Then it was returned to `review/verify-communities-a1-r498` for this report.
- Install: `corepack pnpm install --frozen-lockfile` (pnpm 11.5.2 from the corepack cache; 1770 packages reused from the local store, none downloaded; lockfile unchanged). The postinstall `pnpm intl:compile-if-needed` failed because `pnpm` is not on PATH. The packages were linked; the catalogues were left uncompiled.
- `pnpm` scripts could not be called directly (not on PATH; `npx tsc` also refused because of a `devEngines` node-version mismatch, local v24.14.0 vs ^24.15.0). I ran the scripts' underlying commands with the repo's own binaries: `node node_modules/typescript/bin/tsc`, `node node_modules/jest/bin/jest.js` (with `NODE_ENV=test --forceExit --testTimeout=20000`, as in `pnpm test`), and `node node_modules/eslint/bin/eslint.js --quiet`.

## Could not run, or ran differently

| Item | Why |
| --- | --- |
| `pnpm test` / `pnpm lint` as pnpm scripts | No `pnpm` on PATH; ran the equivalent commands directly (see above) |
| `pnpm typecheck` (`tsgo`) | Not in this round's checklist, and not run. The builder reports 82 TS2307 errors, all from the uncompiled locale catalogues |
| Locale-dependent tests (`string.test.ts`) | Catalogues not compiled; compiling is CI's job per CLAUDE.md |
| Full lint on the base | Not re-run; equality is inferred from the diff (section 6) |
| Device, web, live door | Out of scope for a read-only verify |
