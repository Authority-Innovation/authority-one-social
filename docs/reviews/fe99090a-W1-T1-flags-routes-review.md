# Review: df17dfda "Communities W1-T1: flags + routes (fork)"

Review task `fe99090a`, 2026-10-31, Opus, REVIEW ONLY (nothing committed to,
merged into or pushed to any other branch).

## What was reviewed

- `main` tip `571924785` does NOT contain W1-T1. There is no Communities code
  on main at all.
- W1-T1 branch: `origin/coord/communities-w1-t1-flags-routes-f-df17dfda`
  (tip `345180401`). Its own commits are `322245a40` (code) and `345180401`
  (report + log). It is based on `569b3b240`, so it carries 7 non-main
  commits (UIScene lifecycle, network/react-query, contextEngine, build
  34-36 bumps).
- The follow-up fix branch `origin/coord/fix-w1-t1-flags-routes-flag-off-4c14906b`
  (`7c624fa68` + `18845070d`), which moves the flag-off gate into
  `router.matchPath`. That fix is already in `origin/communities/integration`
  (whose `src/routes.ts:126` has `resolve: match => applyCommunitiesFlag(match)`).
- Bus task body / earlier bus result for df17dfda: this builder has no tool to
  read bus records, so I used the builder's committed report
  (`docs/communities/W1-T1-flags-routes-report.md`) and the r2 fix-pass
  branch as the record. That is an assumption.

## Verdict

**FIX FIRST** for the W1-T1 branch on its own. Do not merge it to main as-is.
The fix it needs (HIGH-1) already exists on the r2 branch and in
`communities/integration`. Land W1-T1 + `7c624fa68` together, through the
integration branch, after the unrelated base commits are reviewed.

## Findings

### BLOCKER

None. Every flag defaults off in code and is set explicitly to "off" in every
eas.json profile. A build that doesn't set them behaves like main, apart from
the `/c/...` resolution covered under HIGH-1.

### HIGH-1 - flag-off gate skips in-app links, push notifications and feed links (fixed in r2, not on this branch)

- `src/Navigation.tsx:971` (W1-T1) applies `applyCommunitiesFlag` only in
  `LINKING.getStateFromPath`. Other places call `router.matchPath` directly
  and skip the gate: `src/components/Link.tsx:193`,
  `src/view/com/util/Link.tsx:434`, `src/lib/hooks/useNotificationHandler.ts:296`,
  `src/Navigation.tsx:1119`, `src/view/shell/desktop/LeftNav.tsx:332,469`.
- Failure scenario: with the flag off (every shipped profile), someone taps a
  `https://.../c/abc` link in a post on native while in the Search tab.
  `Link.tsx` resolves it to `Community` and pushes the placeholder.
  The fallback then calls `navigation.navigate('Home')`, but `Home` is
  registered only in the HomeTab stack (`Navigation.tsx:810`). React
  Navigation 7 doesn't reach into another tab's nested child (`Link.tsx`
  has its own comment about this). So the navigate does nothing, and the user
  is left on a blank screen that renders `null`.
- Fix: cherry-pick `7c624fa68`, which moves the gate into `Router.matchPath`
  through a `resolve` hook in `src/routes.ts`.

### HIGH-2 - branch base drags 7 unrelated commits onto main

- `git log main..origin/coord/communities-w1-t1-flags-routes-f-df17dfda`
  shows 9 commits. Only 2 are W1-T1. The other 7 change iOS lifecycle
  (`plugins/uiSceneLifecycle/*`), `src/state/session/agent.ts`,
  `src/lib/react-query.tsx`, contextEngine, and build numbers.
- Failure scenario: merging this branch to main ships UIScene/network
  changes that this review did not cover and that W1-T1 doesn't depend on.
- Fix: land through `communities/integration` after those base commits are
  reviewed on their own, or rebase `322245a40` (+ `7c624fa68`) onto main.

### MEDIUM-1 - screen-level fallback is a no-op outside the Home tab

- `src/screens/Community/index.tsx:35-40`: `navigation.navigate('Home')`
  from a non-Home tab stack (Search/Notifications/Messages/MyProfile) doesn't
  reach HomeTab > Home. After r2, this guard only matters for
  `navigate('Community', ...)` by route name. No current caller does that
  with the flag off, but a later W2 caller would hit the blank screen.
- The builder raised this as open question 1. It's still open in r2.
- Fix: use `navigation.dispatch(StackActions.replace(...))`, or reuse the
  `useGoBack` fallback (`src/lib/hooks/useGoBack.ts`). Alternatively, render
  a NotFound-style view instead of `null`.

### LOW-1 - `routes.ts` now imports from `#/screens` (r2)

- r2 `src/routes.ts:2` imports `#/screens/Community/linking` (which pulls in
  `#/env`) into the router module, which is low-level. It works and nothing
  creates an import cycle today, but it reverses the layering.
- Fix: move `applyCommunitiesFlag` to `src/lib/routes/` or `src/features/communities/`.

### LOW-2 - flag-off deep links land on Home with no explanation

- `/c/abc` used to resolve to NotFound. Now it silently lands on Home.
  That was intentional (spec), so this is only noted. A shared community link
  opened on a flag-off build gives the user no hint about what happened.
- Fix: none required. Optionally show a toast later.

### LOW-3 - legacy i18n idiom in new titles

- `src/Navigation.tsx` W1-T1 hunk uses `title(msg\`Community\`)`. This matches
  the surrounding file, so it's acceptable. CLAUDE.md prefers `l\`...\``, but
  that would mean refactoring the whole `commonScreens` block.

### Checked and fine

- `src/env/common.ts` flag parsing (`'1'`/`'true'`) matches the existing
  `DISABLE_AGE_ASSURANCE` style. It uses direct `process.env.EXPO_PUBLIC_*`
  access, so babel inlining works.
- eas.json: all 7 profiles, including `base`, set the 5 keys to defaults.
  Other keys are unchanged.
- `/c/:id` and `/c/:id/members` don't collide with any existing route. The
  route-table snapshot (recorded at base) proves that existing routes keep
  their order and patterns.
- `requireAuth: true` on both screens.

## What I ran

On a detached checkout of `345180401` (W1-T1 tip), in this worktree:

- `pnpm install --frozen-lockfile --prefer-offline`. pnpm came through
  corepack, with a local `pnpm.cmd` shim so postinstall could find it.
- `pnpm test src/screens/Community`: 3 suites, 10 tests, 1 snapshot, all PASS.
- `pnpm typecheck` (tsgo): clean, no errors.

On `origin/coord/fix-w1-t1-flags-routes-flag-off-4c14906b` (r2):
`pnpm test src/screens/Community`: 3 suites, 10 tests, all PASS.

Not run: the full jest suite, lint, any device/simulator run, and any test
on `communities/integration`. The checkout was aborted by a CRLF-only
`package.json` change from install. I reverted that change and did not commit it.
