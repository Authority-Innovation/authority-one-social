# RUN - communities app, round 488: tsc, jest, ESLint and Prettier

- Task: `cc3262d8` (independent, normal priority, report only)
- Date: 2026-11-05
- Head under test: `5a54c68b4` (`fix/communities-r474`, head of the r487 build)
- Base for comparison: `9321e9003`, in a separate detached checkout with the same install
- Task branch: `coord/independent-priority-normal-run-cc3262d8`

## Verdict: NOT READY

Two failures come from r487 itself. Both are in the A1 jest block that r487 added to `src/screens/Community/__tests__/CommunityScreen.test.tsx`. Neither is in the A1 app code (`access.ts`, `descriptor.ts`, `queries.ts`). Both pass on the base, where the block does not exist.

1. **`tsc -p tsconfig.communities.json` fails with one error (TS2345 at line 1012).** jest's types reject the `it.each([...] as const)` table. `pnpm test` runs this `tsc` before jest, so **`pnpm test` fails before any test runs.**
2. **One jest test fails:** `Community home - the door omits viewer_is_admin > a joined member gets the member home, with no wall and no Join button`. The list entry in the test has id `garden`, but the test opens the screen on id `btb`. `readCommunityHome` correctly finds that the caller has not joined `btb` and shows the wall and Join button. **The test data is wrong, not the fix.**

Also new on this branch, but not blocking tests: three files fail Prettier that pass on the base. Two are r487's new scripts and one is `access.ts`, which became unformatted in r484.

I changed no code. When the tsc error appeared, I asked whether to stop at step 4 or finish the read-only checks. Dispatch answered (question `a9f38ce1`): *"option (b) ... still run the remaining read-only checks ... Make NO code change. Report NOT READY with this evidence. A fix for the tsc error is a new round, not part of this task."*

## Summary

| Check | Head `5a54c68b4` | Base `9321e9003` | New on this branch? |
| --- | --- | --- | --- |
| Install, frozen lockfile | 1932 packages; postinstall failed (see below) | Same | No, same on both |
| `tsc --noEmit -p tsconfig.communities.json` | **1 error** (exit 2) | 0 errors (exit 0) | **Yes, from r487** |
| `tsgo` full typecheck (`tsconfig.check.json`) | 83 errors: 82 TS2307 + **1 TS2345** | 82 errors, all TS2307 | The TS2345 is new (the same r487 error). The 82 are environmental and on both |
| jest, community suites | 28 suites, 606 tests: **605 pass, 1 fail** | 28 suites, 597 tests: 597 pass, 0 fail | **Yes, from r487** |
| r487 node tests | 33 / 33 pass | n/a (they don't exist on the base) | - |
| r474 + r484 + r487 node tests | 81 / 81 pass | n/a | - |
| r487 mutation runner | 9 of 9 mutations caught; unmutated 33/33 | n/a | - |
| ESLint `src modules` | 92 errors in 10 files, none in community code | 92 errors, same files and counts | No |
| Prettier, as checked out (CRLF) | 2206 files | 2200 files | The difference is line endings, see below |
| Prettier, `--end-of-line auto` | 87 files | 84 files | **3 new:** 2 from r487, 1 from r484 |

## 1. Install

| Item | Value |
| --- | --- |
| Package manager | pnpm (`pnpm-lock.yaml`; `package.json` `devEngines` names pnpm 11.5.2) |
| pnpm version | 11.5.2 |
| Node | v24.14.0. `package.json` asks for `>=24.15.0`, with `devEngines.runtime` `^24.15.0`. Nothing failed because of this |
| Command | `pnpm install --frozen-lockfile` |
| Result | `Packages: +1932`, `added 1932, done`. **Exit 1, but only from the postinstall hook** |
| Lockfile | Unchanged. `git status` was clean after install, and nothing was added or upgraded |
| Base | Lockfile, `package.json` and `pnpm-workspace.yaml` are identical at `9321e9003` and `5a54c68b4`. Same command, same result |

**How I got pnpm.** pnpm is not on PATH on this machine. `npx pnpm@11.5.2` run from the repo is refused by npm itself (`EBADDEVENGINES`: node 24.14.0 does not match `^24.15.0`). So I ran `npx -y pnpm@11.5.2 --version` once from `%TEMP%` to fetch that exact pnpm, and then ran that binary in the worktree. No dependency outside the lockfile was installed into the repo.

**The postinstall failure.** The hook is `pnpm intl:compile-if-needed`, which runs `lingui compile`. It failed because its child shell could not find `pnpm` on PATH. I did not rerun it, because `CLAUDE.md` says not to run `pnpm intl:compile` (CI does it). It only writes the compiled catalogs `src/locale/locales/**/messages.*`, which are gitignored. **This leaves 82 TS2307 errors in the full typecheck and most of the ESLint errors in `src/locale/i18n.web.ts`, on head and base alike.** jest does not need the catalogs: all 28 community suites loaded.

## 2. TypeScript

### `tsc --noEmit -p tsconfig.communities.json` (the first half of `pnpm test`)

Head, exit 2, one error:

```
src/screens/Community/__tests__/CommunityScreen.test.tsx(1012,5): error TS2345:
  Argument of type '(_label: "a network failure" | "a 404", error: { readonly kind: "network"; }
  | { readonly kind: "http"; readonly status: 404; }) => Promise<void>' is not assignable to
  parameter of type '(...args: readonly ["a network failure", { readonly kind: "network"; }]
  | readonly ["a 404", { readonly kind: "http"; readonly status: 404; }]) => ...'.
  ...
  The type 'readonly ["a network failure", { readonly kind: "network"; }]' is 'readonly' and
  cannot be assigned to the mutable type '[_label: ..., error: ...]'.
```

**Where it came from:** `git blame` gives `f33f52310` (r487, "A1 - take membership from the join record") for the `it.each([` line and the first row, and `65c6bfd7c` (r487, "format the A1 jest block") for lines 1008-1015, including `] as const)(` and line 1012. The r487 report says `tsc` was never run on these lines.

Base, exit 0, no errors.

### Full typecheck: `tsgo --project ./tsconfig.check.json` (`pnpm typecheck`)

| | Head | Base |
| --- | --- | --- |
| TS2307 `Cannot find module '#/locale/locales/<lang>/messages'` in `src/locale/i18n.ts` (41) and `i18n.web.ts` (41) | 82 | 82 |
| TS2345, `CommunityScreen.test.tsx:1012` (the same error as above) | 1 | 0 |

The 82 TS2307 errors exist only because the catalogs are not compiled (section 1). I don't count them against the branch. Apart from the r487 error, the full app type-checks.

## 3. jest

Command (the jest half of `pnpm test`, with a path filter, and without `--bail` so every suite reports):

```
NODE_ENV=test jest --ci --forceExit --testTimeout=20000 --testPathPattern '[Cc]ommunit'
```

"Community suites" means every test file whose path matches `[Cc]ommunit`. That is 28 files on both head and base.

| | Suites | Pass | Fail | Tests | Pass | Fail |
| --- | --- | --- | --- | --- | --- | --- |
| Head `5a54c68b4` | 28 | 27 | **1** | 606 | 605 | **1** |
| Base `9321e9003` | 28 | 28 | 0 | 597 | 597 | 0 |

Head per suite:

| Suite | Tests | Pass | Fail |
| --- | --- | --- | --- |
| `src/features/communities/__tests__/agentLabel.test.ts` | 8 | 8 | 0 |
| `src/features/communities/__tests__/cache.test.tsx` | 4 | 4 | 0 |
| `src/features/communities/__tests__/membersPost.test.ts` | 7 | 7 | 0 |
| `src/features/communities/__tests__/postActionGuard.test.ts` | 55 | 55 | 0 |
| `src/features/communities/switcher/__tests__/CommunitySwitcher.test.tsx` | 16 | 16 | 0 |
| `src/features/communities/switcher/__tests__/util.test.ts` | 3 | 3 | 0 |
| `src/features/communityAgent/__tests__/communityAgent.test.tsx` | 17 | 17 | 0 |
| `src/features/communityAgent/__tests__/labelRule.test.ts` | 68 | 68 | 0 |
| `src/features/communityAgent/__tests__/launchControl.test.tsx` | 10 | 10 | 0 |
| `src/lib/agent-runtime/__tests__/communitiesClient.contract.test.ts` | 27 | 27 | 0 |
| `src/lib/agent-runtime/__tests__/communitiesClient.test.ts` | 92 | 92 | 0 |
| `src/lib/api/feed/__tests__/communities.test.ts` | 19 | 19 | 0 |
| `src/lib/communities/__tests__/composerTarget.test.ts` | 34 | 34 | 0 |
| `src/lib/communities/__tests__/doorContract.test.ts` | 10 | 10 | 0 |
| `src/lib/communities/__tests__/feedPostTarget.test.ts` | 16 | 16 | 0 |
| `src/lib/communities/__tests__/groupPostBinding.test.ts` | 20 | 20 | 0 |
| `src/lib/communities/__tests__/resolveTarget.test.ts` | 38 | 38 | 0 |
| `src/screens/Community/__tests__/CommunityScreen.test.tsx` | 61 | 60 | **1** |
| `src/screens/Community/__tests__/JoinConsent.test.tsx` | 25 | 25 | 0 |
| `src/screens/Community/__tests__/descriptor.test.ts` | 19 | 19 | 0 |
| `src/screens/Community/__tests__/flags.test.ts` | 5 | 5 | 0 |
| `src/screens/Community/__tests__/realPayloads.test.ts` | 5 | 5 | 0 |
| `src/screens/Community/__tests__/routeTable.test.ts` | 1 | 1 | 0 |
| `src/screens/Community/__tests__/routes.test.ts` | 5 | 5 | 0 |
| `src/screens/Community/components/__tests__/AgentCard.test.tsx` | 5 | 5 | 0 |
| `src/screens/Community/components/__tests__/CommunityComposerEntry.test.tsx` | 2 | 2 | 0 |
| `src/screens/Community/components/__tests__/MemberPostRow.test.tsx` | 10 | 10 | 0 |
| `src/state/queries/__tests__/post-feed-communities.test.ts` | 24 | 24 | 0 |

Head has 9 more tests than the base. They were added between the two, in r484 and r487. r487's share is the 4 cases in the A1 block plus 1 in `descriptor.test.ts`.

### The failing test

`Community home - the door omits viewer_is_admin > a joined member gets the member home, with no wall and no Join button` (added in `f33f52310`, r487):

```
Error: Unable to find an element with testID: communityMemberBadge
```

The rendered tree shows `communityTierBadge` "Members only", the description, and **`communityJoinButton` "Join community"**. So the screen treated the viewer as a non-member.

**Why: the test's ids don't match.**

- The test mocks `listMyCommunities` with `{ok: true, data: [omitted()]}`. `omitted()` is `memberCommunity()` without `viewerIsAdmin`, built from `door.json`'s `communityWithSponsorMember.community`, **whose `id` is `garden`.**
- The test calls `renderScreen()`, **whose default route id is `btb`** (`CommunityScreen.test.tsx:278`).
- `readCommunityHome('btb')` in `access.ts` computes `joined = mine.data.some(c => c?.id === id)`, which is `false` for `[{id: 'garden', ...}]`. So the descriptor says non-member, and the screen shows the wall and Join button.

**The fix's behaviour here is correct.** Matching on this community's id is required. Counting any entry on the list as this community is the fourth A1 mutation, and the r487 node tests catch it (section 4). The test would need the screen opened on `garden`, or a list entry with id `btb`. I did not make that change, by the task's rule. It belongs to the next round.

**The other A1 and C11 jest cases pass on head:**

| Test | Result |
| --- | --- |
| `descriptor.test.ts`: `toDescriptor takes membership, never admin, from the join record` | pass |
| `the door omits viewer_is_admin > someone their list does not name gets the wall and the Join button` | pass |
| `... > a network failure on the list shows neither wall nor member content` | pass |
| `... > a 404 on the list shows neither wall nor member content` | pass |
| `JoinConsent.test.tsx` (25 tests; covers the C10 unsupported and missing states; not changed in r487) | pass |

Note that the "not on the list" case passes for a reason it does not intend: the `btb`/`garden` mismatch makes even a list that contains the community read as "not on the list". It is still a fair test of that branch, because the default list mock is empty.

### Not a failure, but noted

Both runs print `A worker process has failed to exit gracefully and has been force exited`. This is the same on base and head, and is why the repo's scripts pass `--forceExit`.

## 4. The r487 tests for C9, C10, C11 and A1 (node runner)

```
node --import ./scripts/communities/r474/register.mjs --test "scripts/communities/r487/*.test.mjs"
node --import ./scripts/communities/r474/register.mjs --test "scripts/communities/r487/*.test.mjs" "scripts/communities/r484/*.test.mjs" "scripts/communities/r474/*.test.mjs"
node scripts/communities/r487/mutations.mjs
```

| Run | Tests | Pass | Fail |
| --- | --- | --- | --- |
| r487 only | 33 | 33 | 0 |
| r487 + r484 + r474 | 81 | 81 | 0 |

Mutation runner, exit 0 (`unmutated: 33 of 33 pass`):

| Mutation | Tests failing, of 33 |
| --- | --- |
| C9: the handler drops its gate check | 5 |
| C9: the screen builds an always-ok gate | 10 |
| C10: the unsupported state is never shown | 3 |
| C10: a missing version no longer shows the load error | 2 |
| C11: `isMember` always true | 4 |
| A1: the join record is ignored (the original bug) | 3 |
| A1: a failed list reads as a non-member | 5 |
| A1: a failed list passes through, so a 404 reads as a refusal | 2 |
| A1: any entry on the list counts as this community | 2 |

All 9 were caught, matching the r487 report. The runner restored every file; `git status` was clean afterwards. These scripts don't exist on the base, so there is nothing to compare.

## 5. ESLint

Command: `eslint --quiet src modules` (the `pnpm lint` script, without `--cache`).

**Head: exit 2, 92 errors, 0 warnings. Base: exit 2, 92 errors, 0 warnings.** The errors are in the same files with the same counts on both:

| Errors | File |
| --- | --- |
| 41 | `src/locale/i18n.web.ts` (mostly `no-unsafe-member-access` on the uncompiled catalogs, section 1) |
| 27 | `src/screens/AgentChat/__tests__/useAgentChat.transportError.test.tsx` |
| 4 | `src/state/supabase/index.tsx` |
| 4 | `src/lib/supabase/__tests__/client.test.ts` |
| 4 | `src/screens/AgentChat/useVoiceConversation.ts` |
| 3 | `src/state/shell/color-mode.tsx` |
| 3 | `src/screens/AgentChat/__tests__/MessageBubble.test.ts` |
| 3 | `src/screens/AgentChat/__tests__/MessageBubble.links.test.ts` |
| 2 | `src/screens/AgentChat/__tests__/ApprovalCard.test.tsx` |
| 1 | `src/lib/supabase/client.ts` |

By rule: 51 `no-unsafe-member-access`, 12 `no-explicit-any`, 9 `no-unsafe-call`, 6 `import-x/no-nodejs-modules`, 6 `no-floating-promises`, 3 `simple-import-sort/imports`, 3 `react-hooks/refs`, 1 `no-restricted-imports`, 1 `no-unnecessary-type-assertion`.

**No ESLint error is in community code or in any file this branch changed.** ESLint also prints "There are suppressions left that do not occur anymore", on both head and base.

## 6. Prettier

Command: `prettier --check .` (the `pnpm prettier` script).

**As checked out:** head 2206 files, base 2200 files. This checkout has `core.autocrlf=true`, so files are CRLF in the working tree (`git ls-files --eol` gives `i/lf w/crlf`), and Prettier's `endOfLine: lf` flags nearly every file. That is an artifact of this Windows checkout, not of the code. CI on LF checkouts won't see it.

**To get a real signal, I reran with `--end-of-line auto`:** head 87 files, base 84 files. The difference is exactly three files, none removed:

| File | On base | At `4ef27cc21` (r484 head) | On head | Introduced by |
| --- | --- | --- | --- | --- |
| `scripts/communities/r487/a1-membership.test.mjs` | absent | absent | needs format | **r487** |
| `scripts/communities/r487/mutations.mjs` | absent | absent | needs format | **r487** |
| `src/screens/Community/access.ts` | absent | needs format | needs format | **r484.** The flagged line is `isMembershipRefusal`'s return, which r487 did not touch. r487's additions to the file are clean |

Of the other files this branch changed, only `src/screens/Community/components/MembersSection.tsx` is flagged, and it is flagged on the base too, so it is pre-existing. The remaining 83 are outside community code and identical on both.

What Prettier wants is line wrapping only (for example, `const {postsSource, toDescriptor} =\n  await import(...)` in `a1-membership.test.mjs`). The r487 C9 and C10 tests read `JoinConsent.tsx` by its Prettier layout. `JoinConsent.tsx` passes Prettier on head, so those tests are not affected.

## Pre-existing versus new

| Failure | Pre-existing on `9321e9003`? | Evidence |
| --- | --- | --- |
| `tsc` communities: TS2345 at `CommunityScreen.test.tsx:1012` | **No, new: r487** | Base `tsc` exits 0. Blame: `f33f52310`, `65c6bfd7c` |
| jest: `a joined member gets the member home` | **No, new: r487** | Base 597/597 pass; the test was added in `f33f52310`. Cause: list id `garden` against route id `btb` |
| Prettier: 2 r487 scripts | **No, new: r487** | Absent on base and at `4ef27cc21` |
| Prettier: `access.ts` | **No, new: r484** | Absent on base, flagged at `4ef27cc21` |
| `tsgo`: 82 TS2307 in `src/locale/i18n*.ts` | Yes | Identical on base; caused by the uncompiled catalogs |
| ESLint: all 92 errors (10 files, none in community code) | Yes | Same files and counts on base |
| Prettier: 83 other files, including `MembersSection.tsx` | Yes | Same list on base |
| Prettier: about 2120 files with CRLF | Yes | Line endings in this Windows checkout |

**Is a failure caused by the r487 fix?** Not by the A1 app code. Both blocking failures are in the jest test r487 added alongside the fix. The A1 logic behaves as designed in every run that exercises it: the r487 node tests, all 9 mutations, the descriptor jest test, and the three other A1 screen cases. Step 4 told me to stop if a failure came from the fix. I asked first, and Dispatch ruled that I should finish the read-only checks.

## READY or NOT READY (flags OFF)

**NOT READY.** `pnpm test` fails at its `tsc` step, and the community jest run has one failure. Both are in the r487 A1 jest block. Neither failure, nor any other change in this range, touches a flag, route or config. `COMMUNITIES_ENABLED` is mocked on in these tests, and nothing here changes the flags-off app. But the stated gate is a green suite, and it is not green.

For the next round, one commit should clear both blockers:

- Make the `it.each` table type-check, for example by dropping `as const`, or by typing the rows as a mutable tuple array.
- Make the joined-member case open the screen on the id in its list (`renderScreen({id: 'garden'})`), or give the list entry `id: 'btb'`.
- Optionally, run `prettier --write` on the two r487 scripts and `access.ts`.

Then rerun `pnpm test` and this report's steps.

## What I did not do

- No code change, no commit of `node_modules`, no lockfile edit, no deploy, and no live or network calls other than the package fetch the install ruling approved.
- I did not run `pnpm intl:compile` or the postinstall again (`CLAUDE.md`).
- I did not run the full app jest suite, only the 28 community suites the task asked for.
- No device, web or clickthrough run.
- The base checkout is a separate detached git worktree at `C:\ao\worktrees\cc3262d8-base` (`9321e9003`, with its own `node_modules`), created for this comparison. **It is still there.** The builder deny-list blocks `git worktree remove`/`prune` as the loop's job, so it needs cleanup by the loop or a human. Nothing in it was changed.
