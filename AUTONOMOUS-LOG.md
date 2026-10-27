# Autonomous build log

## 2026-10-28 - Communities W1-T1 flags + routes (task df17dfda)

- Branch `coord/communities-w1-t1-flags-routes-f-df17dfda`, base `569b3b240`, feature head `322245a40`.
- Changed: 5 dark env flags in `src/env/common.ts` (all off/empty, `BRAND` = `authority-one`); same keys set to defaults in all 7 `eas.json` profiles; `Community` `/c/:id` and `CommunityMembers` `/c/:id/members` in routes, types and `commonScreens`; placeholder `src/screens/Community` that renders nothing; flag off -> `/c/...` deep links land on Home.
- Tests: +10 (3 suites). Full suite 1421 -> 1431 passed; the same 2 pre-existing suite failures before and after (Windows CRLF artefacts).
- Verdict: done, draft PR, awaiting a separate reviewer.
- NOT done: no real community screen, no API, no intl extraction, no device test, no Cloudflare deploy CLI or check:bundle (deny-listed), no deploy or EAS build.
- Report: `docs/communities/W1-T1-flags-routes-report.md`.

## 2026-10-28 – Communities W1-T3: composer no-PDS-write guard (task 1550eefa)

- Branch `coord/communities-w1-t3-composer-no-pd-1550eefa`, base `569b3b240`.
- Changed: `ComposerTarget` + pure fail-closed `guardComposerPdsWrite`
  (`src/lib/communities/composerTarget.ts`); `submitComposerThread`
  (`src/view/com/composer/state/submit.ts`); `ComposerOpts.target` threaded to
  `ComposePost`; composer refuses members/paid targets before publish, drafts and
  bsky video upload.
- Head: see `git log` (feature commit `f0a4c68d8`, then this log/report commit).
- Tests: base 1387 passed / 1 failed / 28 todo (128 suites, 3 failing);
  head 1406 passed / 1 failed / 28 todo (130 suites, same 3 pre-existing failures).
- Verdict: done, draft PR, awaiting separate review.
- NOT done: members write path (walled-store client), any UI that sets a
  community target, public-tier routing. No wrangler / check:bundle (deny-listed).
- Report: `docs/communities/W1-T3-composer-guard-report.md`.

## 2026-10-28 – Communities W1-T8: communities client (task f45195a0)

- **Branch:** `coord/communities-w1-t8-communities-cl-f45195a0`, from `569b3b240`
- **Code head:** `b828226ec`. The report and this log are in a follow-up commit.
- **What changed:** new files `src/lib/agent-runtime/communitiesClient.ts` and `src/lib/agent-runtime/__tests__/communitiesClient.test.ts`. The client has 10 methods. Each returns a typed result and never throws. Requests carry no tenant id and never go to the PDS. The bearer comes from `getAgentRuntimeAccessToken()`. Nothing imports the client yet, so it is dark.
- **Tests:**
  - Before: 1387 passed, 1 failed, 28 todo (128 suites).
  - After: 1451 passed, 1 failed, 28 todo (129 suites).
  - The same 3 suites fail on base, all because of the environment.
  - The P2b `bearerCallSites` test passes on a local merge with the T4 branch.
- **Verdict:** ready for a separate review. The PR is a draft.
- **Not done:**
  - No UI, routes or walled store.
  - The runtime routes are assumed and still need the server side to match.
  - No `wrangler` or `check:bundle` (deny-listed), and no deploy.
- **Details:** `docs/communities/W1-T8-communities-client-report.md`

## 2026-10-28 - Communities W2-T17: composer target + fail-closed rule (task f0037cb5)

- Branch `communities/w2-composer-target`, base `569b3b240` + T1, T3, T8 merged (merge commits). Feature head `3ad7673d6`.
- Changed: pure `resolveTarget` (`src/lib/communities/resolveTarget.ts`); `submitComposerThread` keeps the T3 guard first and routes members/paid only to `communitiesClient.post`/`.reply`; Composer resolves the target (reply inheritance, `LOCKED_COMMUNITY`, `COMMUNITIES_ENABLED`) before any write path; `ComposerOptsPostRef.target`.
- Tests: base 1387 passed / 1 failed / 28 todo (128 suites); predecessors merged 1480 passed; head 1525 passed / 1 failed / 28 todo (135 suites). Same 3 pre-existing environment-only failing suites throughout.
- Verdict: done, draft PR, awaiting a separate reviewer.
- NOT done: no UI sets a target (T12), members media, locked-community tier from config, no `wrangler` / `check:bundle` (deny-listed, not run), no deploy or EAS build.
- Report: `docs/communities/W2-T17-composer-target-report.md`.
