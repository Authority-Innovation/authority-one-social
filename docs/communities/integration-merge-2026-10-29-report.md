# Communities integration merge, 2026-10-29 (task 979f2078)

Line: `communities/integration`, from `08d7abba4`. Each fix went in as a
normal `--no-ff` merge. No force-push, no main merge, no deploy.

## Merges

| # | Fix | Merge commit | Conflicts and resolution |
| --- | --- | --- | --- |
| 1 | W1-T3 `261539b25` | `c9d72bcf1` | `AUTONOMOUS-LOG.md` (add/add). Kept every entry from both sides. |
| 2 | W2-T9 `d8adbd9bd` | `a50a7c608` | `src/routes.ts`: kept the W1-T1 router-level gate (`resolve: applyCommunitiesFlag`) and added `CommunityJoin: '/c/:id/join'`. `CommunityJoin` is in `COMMUNITY_ROUTE_NAMES`, so the flag-off gate covers all 3 community routes. `src/Navigation.tsx`: kept the `CommunityJoinScreen` import and screen. Dropped W2-T9's `applyCommunitiesFlag` import, because the line applies the gate inside `matchPath`. Log: kept both sides. |
| 3 | W2-T12 `da039c5d5` | `f173cb2b3` | `src/screens/Community/index.tsx`: only the header comment conflicted. Took the W2-T12 home in full (is_agent label, public-tier gate, DID-keyed keys). Log: kept both sides. **Semantic fix:** W2-T9's `JoinConsent.tsx` imported the fallback hook from `./index`. After W2-T12, `./index` is the full home, which pulls in Dialog and a bottom-sheet native module, so the JoinConsent suite would not load. I moved the hook unchanged into `useCommunitiesDisabledFallback.ts`. `index.tsx` re-exports it. |
| 4 | W2-T15 `d26b73d7b` | `6e338cf01` | `AUTONOMOUS-LOG.md` only. Kept both sides. New deps (`expo-crypto`, `expo-secure-store`) were installed from the lockfile. |
| 5 | W2-T17 `c3ba85375` | **held, not pushed** | See below. |

## Held: W2-T17

Two fixes that both passed review disagree about `src/lib/communities/composerTarget.ts`
(`guardComposerPdsWrite` / `assertComposerPdsWrite`):

- **W1-T3 r2** (`931e6e8c5` tests, merged in `c9d72bcf1`): the guard **allows** a
  public-tier community target, and allows an undefined target (default
  profile). Tests: `composerTarget.test` "allows default" and "allows community
  public", `queries.guard.test` "a public community target is unchanged" (4
  tests), and `video.guard.test` "a public community target still uploads".
- **W2-T17 fix** (`c40e0184f`, review M1): the same guard **refuses** a public
  tier (`public-community-write-not-available`) and refuses a missing target.

On the merged tree, those 7 tests fail (3 suites). Everything else merges.
Typecheck is clean apart from the locale errors listed under Tests.

The resolved merge is kept only in the local branch
`wip/979f2078-w2-t17-merge-held` (`c42f8143b`). It was not pushed. That merge:

- Composer imports are the union of both sides.
- Hook dependency arrays carry both `targetResolution` and `target`.
- The W1-T3 draft and video `target` params are widened from `ComposerTarget`
  to `ComposerTarget | undefined`. They are still required. Their bodies already
  go through the guard, which refuses `undefined`.
- The members-target rule holds: the members path never reaches
  `uploadBlob` or `uploadVideo`.

Proposed resolution, awaiting orchestrator (question `add798f1`): take W2-T17's
stricter rule and change those 7 W1-T3 assertions to expect refusal.

## Tests

The runs used jest directly, without `--bail`, with `NODE_ENV=test`. The
suites ran were `src/screens/Community`, `src/features/communities`,
`src/lib/communities` and `src/view/com/composer`, plus the others named
below.

| After | Suites | Tests |
| --- | --- | --- |
| baseline `08d7abba4` (Community, features/communities, composer) | 6 passed | 74 passed |
| 1 W1-T3 (+ lib/communities) | 11 passed | 122 passed |
| 2 W2-T9 (+ lib/routes) | 12 passed | 146 passed |
| 3 W2-T12 (+ agent-runtime, state/queries) | 48 passed | 620 passed |
| 4 W2-T15 (+ aoSignature, Login, scripts) | 69 passed | 820 passed |
| 5 W2-T17 held merge (+ PostThread, post, posts, PostControls) | 71 passed, 3 failed | 906 passed, 7 failed |

- `pnpm typecheck` was run after merges 3 and 5. The only errors were 82 TS2307
  errors for `src/locale/locales/*/messages`. Those files are not compiled here
  because I did not run intl:compile, so the errors come from the environment.
- `lint:brands`: ok after merge 4.
- I did not run full jest or repo-wide ESLint.

## Flag check

`EXPO_PUBLIC_COMMUNITIES_ENABLED` is `"false"` in every `eas.json` profile. It
defaults to off in `src/env/common.ts`.
