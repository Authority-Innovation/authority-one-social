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

## 2026-10-28 - Communities W2-T10: combined feed adapter (task 0c775985)

- Branch `communities/w2-combined-feed`, base: build line `569b3b240` + T1, T2 and T8 merged with merge commits (`c20cdf753`, `86d248f28`, `43fb2d86e`). Code head `f25848f2d`; this log and the report are in the docs commit that follows.
- Changed: `communities` / `community|<id>` feed descriptors; `CommunitiesMergeFeedAPI` (`src/lib/api/feed/communities.ts`), which does an on-device reverse-chron merge with one fetch per community, each carrying only its own id; members-tier items mapped to a FeedViewPost view with `ao-community://<id>/<postId>`; one action guard (`src/features/communities/postActionGuard.ts`) applied in PostControls and PostFeedItem; community feeds have their own never-persisted query root with the account DID in the key, removed explicitly on account switch; community badge in PostFeedReason.
- Cache finding: `src/state/session/` does not reset query roots, but QueryProvider is keyed by DID (new QueryClient per account). Explicit removal was added on top.
- Tests: +95 (5 suites). Full suite 1479 -> 1574 passed; the same 3 environment suite failures before and after (missing compiled messages, CRLF).
- Verdict: done, draft PR, awaiting a separate reviewer.
- NOT done: no switcher UI (T11), no community home or thread (T12/T13), no members media rendering, no members likes (no runtime endpoint), no render test of the members row, no device check. No Cloudflare deploy CLI or check:bundle (deny-listed), no deploy or EAS build, no PDS writes.
- Report: `docs/communities/W2-T10-combined-feed-report.md`.
