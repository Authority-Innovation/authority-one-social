# W2-T11 fix pass: M1 (failed refetch keeps the last good list)

Task a4be1369. Base 98d550385.

## Change

- `src/features/communities/switcher/useMyCommunitiesQuery.ts`: the query
  function now throws on any `!res.ok` except `signed_out`, which returns `[]`.
  React Query keeps the previous data on a failed refetch, and `isSuccess` is
  no longer true for the failure, so the reset effect in `index.tsx` does not
  fire. `index.tsx` is unchanged.
- `README.md`: notes that a failed refetch keeps the last good list, as a
  deliberate change from "fail closed to empty".
- Tests added to `__tests__/CommunitySwitcher.test.tsx`:
  - select a chip, next list fails (network), refetch: chip, its `selected`
    state and the shell selection all survive; query status is `error`.
  - first load fails (http 503): only "All", selection stays "All".
  - signed out: only "All", query status `success`.

Minor findings were not touched.

## Tests run

- `pnpm test src/features/communities/switcher`: 2 suites, 18 tests, all pass.
- Same suite against the old hook: 2 of the new tests fail (refetch survival,
  first-load error status), so the tests catch the bug.
- `pnpm typecheck`: clean.
- `eslint src/features/communities/switcher`: 0 errors, 3 pre-existing
  warnings in the test's mock factories.

## Not verified

- Full `pnpm test` suite not run, only the switcher tests.
- Not run on a device or web. With the app's default `retry`, a failing fetch
  now retries before it settles to error. The person sees the same result: the
  chips stay.
- Pushed to the task branch `coord/independent-fix-pass-w2-t11-swit-a4be1369`
  only, not to `communities/w2-switcher`. The run rules allow pushing only the
  task branch, so a human needs to move the commit across.
- The spec asked for a Claude Haiku 5.5 co-author line. This run was on Opus
  5.5, so the commit says Opus 5.5 to keep the attribution accurate.
