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
