# Autonomous log

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
