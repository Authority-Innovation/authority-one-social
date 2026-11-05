# RUN - communities app, round 488: tsc, jest, ESLint and Prettier

- Task: `cc3262d8` (independent, normal priority, report only)
- Date: 2026-11-05
- Head under test: `5a54c68b4` (`fix/communities-r474`, head of the r487 build)
- Base for comparison: `9321e9003`
- Task branch: `coord/independent-priority-normal-run-cc3262d8`

## Verdict: NOT READY

Two failures come from r487 itself, both in the A1 jest block it added to `CommunityScreen.test.tsx`. Neither is in the A1 app code.

1. **`tsc -p tsconfig.communities.json` fails with one error (TS2345, line 1012).** The `it.each([...] as const)` table does not type-check against jest's types. Because `pnpm test` runs this `tsc` first, `pnpm test` fails before jest starts.
2. **One jest test fails:** `the door omits viewer_is_admin > a joined member gets the member home`. The test's list entry has id `garden`, but the screen is opened on id `btb`. So `readCommunityHome` correctly finds that the caller has not joined `btb`, and shows the wall and Join button. The test data is wrong, not the fix.

I changed no code. Dispatch ruled that fixing these belongs to a new round (question `a9f38ce1`, answer below).

DRAFT: base comparison pending.
