# FIX - communities, round 498: A1 jest test and tsc TS2345

- Task: `59bb9cc4` (independent, one round, a single verify follows)
- Date: 2026-11-05
- Base: `5a54c68b4` (= `origin/fix/communities-r474` when this round started)
- Task branch: `coord/independent-priority-high-fix-co-59bb9cc4`
- Target: `fix/communities-r474` (see "Push" below)

## Result

Both failures are fixed. **Both fixes are in the test. No app code changed.**

- `tsc -p tsconfig.communities.json`: 1 error before, **0 after**.
- Community jest: 506 of 507 before, **507 of 507 after** (25 of 25 suites).
- The A1 jest block: 3 of 4 before, **4 of 4 after**.

Open join, the consent step, D2 Option A and the flags are unchanged. No source file outside `CommunityScreen.test.tsx` was edited. Nothing was merged or deployed, and no live calls were made.

## Commits

| Commit | Kind | What |
| --- | --- | --- |
| `25fda0d53` | test | TS2345: the list-failure table for `it.each` is a typed, mutable `[string, CommunitiesError][]` instead of `[...] as const` |
| `445342b9e` | test | A1: the joined-member case renders the community its list holds. The not-named case now puts a *different* community on the list |
| (this commit) | docs | This report |

## 1. tsc TS2345 at `CommunityScreen.test.tsx:1012`

**Cause:** `it.each([...] as const)` gives a union of readonly tuples. Jest's `it.each` types want mutable argument tuples, so the callback `(_label, error) => ...` was rejected.

**Fix (test typing only):** the table is declared as `const listFailures: [string, communitiesClient.CommunitiesError][]` and passed as `it.each(listFailures)`. Same two rows (network failure; 404) and the same assertions.

| Run | `tsc --noEmit -p tsconfig.communities.json` |
| --- | --- |
| Red, `5a54c68b4` | exit 2, 1 error (TS2345 at 1012,5) |
| Green, `25fda0d53` and later | exit 0, 0 errors |

## 2. jest: "door omits viewer_is_admin > a joined member gets the member home"

**Which was wrong: the test. The app is correct.**

**Evidence:**

- `renderScreen()` defaults the route id to `'btb'`.
- The test's community is `memberCommunity()` without `viewerIsAdmin`, built from `door.json`'s `communityWithSponsorMember`, whose `id` is **`'garden'`**.
- The test mocked `listMyCommunities` to return `[that community]`, so the caller's list held `garden`, while the screen was asked for `btb`.
- `readCommunityHome` (`src/screens/Community/access.ts`) decides membership with `mine.data.some(c => c?.id === id)`, where `id` is the route id. `garden` is not `btb`, so it read a non-member and rendered the wall and Join. The jest failure output shows exactly that: `communityWallPlaceholder` and the members notice, with no member badge.
- That is the behaviour the spec asks for. Being a member of another community must not count as membership of this one. The r487 mutation "any entry on the list counts as this community" exists to stop that.

**Fix:** the joined-member case renders `renderScreen({id: joined.id})`, so the route, the door's `GET /:id` response and the list entry all name `garden`. Its assertions are unchanged: member badge, no Join button, no wall, no Admin badge, and the timeline is read.

**Extra hardening, also test-only:** the "someone their list does not name" case used an empty list. It now uses a list holding `garden` while the route is `btb`. This is the exact situation the broken test was in, so jest now catches "any list entry counts" as well.

### Red before, green after (A1 block, `-t "omits viewer_is_admin"`)

| Run | Pass | Fail |
| --- | --- | --- |
| Red, `5a54c68b4` test file | 3 | **1** (`a joined member gets the member home`) |
| Green, `445342b9e` | 4 | 0 |
| Whole `CommunityScreen.test.tsx`, red | 60 | 1 |
| Whole `CommunityScreen.test.tsx`, green | 61 | 0 |

### Jest mutation check on the fixed block (app restored after each)

| Mutation in `access.ts` | A1 block result |
| --- | --- |
| None | 4 pass |
| `const joined = false` (join record ignored, the original A1 bug) | **1 fail**, 3 pass |
| `const joined = mine.data.length > 0` (any entry counts) | **1 fail**, 3 pass |

The failed-list cases (network and 404) still show the error state, with no wall, no Join button, no member badge and no timeline read. Member content fails closed.

## Full results on the final head

### tsc

| Command | Result |
| --- | --- |
| `tsc --noEmit -p tsconfig.communities.json` (first half of `pnpm test`) | **exit 0, 0 errors** |
| `tsgo --project ./tsconfig.check.json` (`pnpm typecheck`) | exit 2, 82 errors. **All 82 are TS2307 for `src/locale/locales/*/messages`** in `i18n.ts` and `i18n.web.ts`, meaning the catalogues are not compiled (see "Could not run"). No other errors |

### Jest

| Scope | Suites | Tests |
| --- | --- | --- |
| Community suites (`src/screens/Community`, `src/features/communities`, `src/lib/communities`, `communitiesClient` tests, `lib/api/feed` communities, `post.groupBinding`) | **25 of 25 pass** | **507 of 507 pass**, 1 snapshot pass |
| Full jest, no `--bail` | 186 pass, 4 fail (of 190) | 2395 pass, 2 fail, 28 todo (of 2425). 26 of 26 snapshots pass |

The 4 failing suites are **outside communities and are not from this round.** My commits touch only `CommunityScreen.test.tsx`, so they fail the same way at `5a54c68b4`:

| Suite | Why | This round's view |
| --- | --- | --- |
| `__tests__/lib/string.test.ts` | Cannot find `src/locale/locales/en/messages`, because the catalogues are not compiled | Environment |
| `plugins/uiSceneLifecycle/__tests__/withUISceneLifecycle.test.js` | Regex fails on CRLF. This machine checks out with `core.autocrlf=true` | Environment. **Passes** once its files are checked out with LF |
| `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts` | Expects `return\n` and gets CRLF | Environment. **Passes** with LF |
| `src/lib/lexicon/__tests__/lexicon.test.ts` > `group/post.json is byte-identical to the spike copy` | Hash mismatch | **A real, pre-existing failure, and it is still red with LF.** `b424c48a6` ("group.cid optional in the binding") changed `lexicons/com/authorityone/group/post.json` but did not update the test's pinned hash. Not in scope here, so not fixed. It needs its own ruling: update the pin or the spike copy |

**`pnpm test` itself** (tsc, then `jest --bail`) passes the tsc half. Jest then bails on the first of the suites above, so on this machine it ends red for reasons that are not communities. Because pnpm 11's pre-run dependency check re-runs install and fails on the postinstall (below), I ran the script's two commands directly, unchanged.

### Node tests (C9, C10, C11, A1)

| Command | Result |
| --- | --- |
| `node --import ./scripts/communities/r474/register.mjs --test "scripts/communities/r487/*.test.mjs"` | **33 of 33 pass** |
| Same, plus `r484` and `r474` | **81 of 81 pass** |
| `node scripts/communities/r487/mutations.mjs` | Unmutated 33 of 33. **All 9 mutations caught:** C9 5 and 10, C10 3 and 2, C11 4, A1 3, 5, 2 and 2 |

### ESLint

| Scope | Result |
| --- | --- |
| `eslint --quiet src/screens/Community src/features/communities src/lib/communities src/lib/agent-runtime/communitiesClient.ts` | **0 problems** |
| `eslint --cache --quiet src modules` (`pnpm lint`) | 92 errors, **none in community code.** They are in `src/lib/supabase`, `src/screens/AgentChat`, `src/locale/i18n.web.ts`, `src/state/shell/color-mode.tsx` and `src/state/supabase` |

### Prettier

The checkout here is CRLF, so a plain `prettier --check` flags every file (70 in community paths) for line endings. I checked the **committed (LF) content** instead: `git show HEAD:<file> | prettier --check --stdin-filepath <file>`.

| Scope | Files | Unformatted |
| --- | --- | --- |
| Community source, tests, fixtures, `scripts/communities`, r487 report | 74 | **10, all pre-existing.** None was changed in this round |
| `CommunityScreen.test.tsx` (the only file changed here) | 1 | 0 |

The 10: `src/screens/Community/access.ts`, `memberRows.ts`, `components/MemberPostRow.tsx`, `components/MembersSection.tsx`, `src/lib/agent-runtime/communitiesClient.ts`, `scripts/communities/r474/{f2-moderation.test.mjs,f5-leave-delete-export.test.mjs,register.mjs}`, `scripts/communities/r487/{a1-membership.test.mjs,mutations.mjs}`. The diffs are line wrapping only, for example `isMembershipRefusal`'s return in `access.ts`. **I did not reformat them.** They are outside this round's two fixes, and `mutations.mjs` edits `access.ts` by matching text, so reformatting needs its own rerun of the mutation runner. One `prettier --write` commit followed by `node scripts/communities/r487/mutations.mjs` would clear it.

## Install

- No `pnpm` on PATH. I used the copy of pnpm 11.5.2 (the `devEngines` version) already in corepack's local cache, with `COREPACK_ENABLE_NETWORK=0 corepack pnpm@11.5.2 install --frozen-lockfile`. All 1770 packages came from the local store, and none were downloaded.
- The lockfile is unchanged. No dependency was added.
- **The postinstall failed:** `pnpm intl:compile-if-needed` could not find `pnpm` on PATH. The packages were installed, but the lingui catalogues were not compiled. CLAUDE.md says not to run `intl:compile` (CI does it), so I left it.

## Could not run, or ran differently

| Item | Why |
| --- | --- |
| `pnpm test` as a pnpm script | pnpm 11's dependency check re-runs install and stops on the postinstall above. I ran its exact commands directly |
| Locale-dependent checks (`string.test.ts`, 82 `tsgo` errors) | Catalogues not compiled, and compiling is CI's job |
| Device, web, clickthrough, live door | Not allowed in this round |

## Earlier rulings

| Ruling | State |
| --- | --- |
| Open join, no invite, no approval | Unchanged |
| Join consent step | Unchanged |
| D2 Option A | Unchanged. `JoinConsent.tsx` and `consent.ts` were not edited |
| Flags | Off. No flag, route or config file changed |
| A1 behaviour (`access.ts`, `descriptor.ts`, `queries.ts`) | Unchanged from `f33f52310`. This round shows it is correct under jest |

## Push

Rule 5 of the run limits me to pushing the task branch, while the spec asks for a fast-forward of `fix/communities-r474`. The task branch is pushed. Whether `fix/communities-r474` was fast-forwarded is recorded in the task's `report_result`.
