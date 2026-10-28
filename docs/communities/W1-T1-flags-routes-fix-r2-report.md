# W1-T1 flags/routes fix pass (review r2, major 1)

Task `4c14906b`. Base 345180401. Branch `coord/fix-w1-t1-flags-routes-flag-off-4c14906b`.

## Change

- `src/lib/routes/router.ts`: `Router` takes an optional `{resolve}` option.
  `matchPath` passes every result through it, so no caller can skip it.
- `src/routes.ts`: the route table is unchanged. The router is now built with
  `resolve: match => applyCommunitiesFlag(match)`. With the flag off, every
  `router.matchPath` caller gets `['Home', {}]` for `/c/:id` and
  `/c/:id/members`. This covers Link.tsx, Navigation.tsx push handling,
  useNotificationHandler, view/com/util/Link, feed.ts and LeftNav.
- `src/Navigation.tsx`: removed the separate wrap in `getStateFromPath`, which
  is now redundant.
- `src/screens/Community/linking.ts` and `index.tsx`: corrected the comments.
  The gate lives in matchPath. The screen-level fallback stays as a second line
  for navigation by route name (`navigate('Community', ...)`), which does not go
  through matchPath.
- `src/screens/Community/__tests__/routes.test.ts`: flag off,
  `router.matchPath('/c/abc')`, `/c/abc/members` and `/c/abc?x=1` resolve to
  Home. Flag on (fresh module registry with
  `EXPO_PUBLIC_COMMUNITIES_ENABLED=true`), they resolve to `Community` and
  `CommunityMembers` with `{id: 'abc'}`. Other routes are unaffected.

Minors 2 to 6 were not touched.

## Tests

`pnpm` is not on PATH here, and the worktree had no `node_modules`. I ran the
same commands as the package scripts through `node`, against a `node_modules`
junction to another worktree with an identical `pnpm-lock.yaml`.

- Community tests: 3 suites, 10/10 pass (snapshot 1/1).
- Full jest: 128/131 suites pass. Tests: 1397 pass, 1 fail, 28 todo. The
  failures are environmental and unrelated to routes:
  - `__tests__/lib/string.test.ts`: the compiled `locales/en/messages` file is
    missing. `intl:compile` is CI-only.
  - `plugins/uiSceneLifecycle/.../withUISceneLifecycle.test.js` and
    `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts`:
    CRLF line endings in this Windows checkout break `\n`-anchored string
    matches.
- Typecheck (tsgo, tsconfig.check.json): 82 errors, all TS2307 for the
  uncompiled `locales/*/messages`. No other errors.
- ESLint on the changed files: clean.

## Not verified

- I did not run the app. I did not exercise push notification or desktop nav
  paths at runtime. They are covered only by the shared `matchPath` gate.
- I did not re-run the three failing suites on the base commit. The causes
  above do not involve any file in this change.
- The spec named `coord/communities-w1-t1-flags-routes-f-df17dfda` as the
  push target. Per the run rules, I pushed only this task's own branch.
