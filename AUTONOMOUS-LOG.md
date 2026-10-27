# Autonomous build log

## 2026-10-28 - Communities W1-T1 flags + routes (task df17dfda)

- Branch `coord/communities-w1-t1-flags-routes-f-df17dfda`, base `569b3b240`, feature head `322245a40`.
- Changed: 5 dark env flags in `src/env/common.ts` (all off/empty, `BRAND` = `authority-one`); same keys set to defaults in all 7 `eas.json` profiles; `Community` `/c/:id` and `CommunityMembers` `/c/:id/members` in routes, types and `commonScreens`; placeholder `src/screens/Community` that renders nothing; flag off -> `/c/...` deep links land on Home.
- Tests: +10 (3 suites). Full suite 1421 -> 1431 passed; the same 2 pre-existing suite failures before and after (Windows CRLF artefacts).
- Verdict: done, draft PR, awaiting a separate reviewer.
- NOT done: no real community screen, no API, no intl extraction, no device test, no Cloudflare deploy CLI or check:bundle (deny-listed), no deploy or EAS build.
- Report: `docs/communities/W1-T1-flags-routes-report.md`.

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

## 2026-10-28 - Communities W2-T9: join and consent screen (task cfbd6f15)

- **Branch:** `communities/w2-join-consent`. Base `569b3b240` with T1 (`345180401`) and T8 (`d52f1bd82`) merged in with merge commits (`5ffec5997`, `41a6c2e55`).
- **Code head:** `fcbab086e`. The report and this log are in a follow-up commit.
- **What changed:**
  - New `src/screens/Community/JoinConsent.tsx` (mockup (d)) and `consent.ts` (logic).
  - New route `CommunityJoin` `/c/:id/join`, dark behind `EXPO_PUBLIC_COMMUNITIES_ENABLED`.
  - `join(id, consentVersion)` runs only after the box is ticked and the button is pressed. The version comes from the config, falling back to `'1'`.
  - `setAgentGrant(id, true)` runs only after a successful join, and only when the toggle is on.
  - The `invite` param is never read.
- **Tests:** +17.
  - Before: 1495 passed, 1 failed, 28 todo (132 suites).
  - After: 1512 passed, 1 failed, 28 todo (133 suites).
  - The same 2 suites fail on base, both from the environment (CRLF, AppDelegate template).
  - Typecheck and lint are clean.
- **Verdict:** ready for a separate review. The PR is a draft.
- **Not done:**
  - No community home or feed.
  - No device run and no intl extraction.
  - No Cloudflare deploy CLI or check:bundle (deny-listed), and no deploy.
  - The config fields for sponsor, agent name, rules and links are assumed. See the open questions.
- **Details:** `docs/communities/W2-T9-join-consent-report.md`
