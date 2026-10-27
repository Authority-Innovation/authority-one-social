# Autonomous build log

## 2026-10-28 - Communities W1-T1 flags + routes (task df17dfda)

- Branch `coord/communities-w1-t1-flags-routes-f-df17dfda`, base `569b3b240`, feature head `322245a40`.
- Changed: 5 dark env flags in `src/env/common.ts` (all off/empty, `BRAND` = `authority-one`); same keys set to defaults in all 7 `eas.json` profiles; `Community` `/c/:id` and `CommunityMembers` `/c/:id/members` in routes, types and `commonScreens`; placeholder `src/screens/Community` that renders nothing; flag off -> `/c/...` deep links land on Home.
- Tests: +10 (3 suites). Full suite 1421 -> 1431 passed; the same 2 pre-existing suite failures before and after (Windows CRLF artefacts).
- Verdict: done, draft PR, awaiting a separate reviewer.
- NOT done: no real community screen, no API, no intl extraction, no device test, no Cloudflare deploy CLI or check:bundle (deny-listed), no deploy or EAS build.
- Report: `docs/communities/W1-T1-flags-routes-report.md`.

## 2026-10-28 – Communities W1-T2: lexicon + codegen (task 98e02647)

- What changed:
  - Tracked the `com.authorityone.group.*` lexicons and added the draft `com.authorityone.community.config` lexicon under `lexicons/`.
  - Wired `@atproto/lex-cli` codegen (`pnpm lexgen`, `pnpm lexgen:check`) into the committed `src/lib/lexicon/generated`.
  - `src/state/queries/group.ts` now aliases the generated types under the same exported names. TODO(codegen) removed.
  - Added 18 tests.
- Deviation: I fixed two invalid spike lexicons (defs `groupViewBasic.creator`, getMemberships `membershipView`). The wire shape is unchanged, and the change is recorded in `lexicons/README.md`. The orchestrator questions were unanswered at the time of writing.
- Tests: before 1421 passed, 1 failed; after 1439 passed, 1 failed. The same pre-existing failure appears both times. Typecheck green.
- Verdict: done, as a draft PR awaiting a fresh review.
- NOT done: no UI, runtime calls or flags (out of scope). No wrangler, check:bundle or deploy (deny-listed or not allowed).
- Head and full detail: `docs/communities/w1-t2-lexicon-codegen-report.md`.
