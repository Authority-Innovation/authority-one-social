# Communities W1-T1: flags and routes - build report

Task `df17dfda`, 2026-10-28. Builder: PC builder (unattended).

- Branch: `coord/communities-w1-t1-flags-routes-f-df17dfda` (the coordination
  fabric's task branch; the spec's suggested name was `communities/w1-flags-routes`)
- Base: `569b3b240` (`fix/ao-uiscene-lifecycle`). Not `android/first-debug-build`.
- Feature commit: `322245a40`
- PR: draft. Not merged. Needs a separate reviewer.

## What changed

| File | Change |
| --- | --- |
| `src/env/common.ts` | 5 new exports appended. No existing export touched. |
| `eas.json` | 5 new keys in every build profile (7). Existing keys unchanged (the 6 old `VIDEO_POSTS_ENABLED` lines only gained a trailing comma). |
| `src/routes.ts` | `Community: '/c/:id'`, `CommunityMembers: '/c/:id/members'` appended at the end of the table. |
| `src/lib/routes/types.ts` | `Community: {id: string}`, `CommunityMembers: {id: string}` in `CommonNavigatorParams`. |
| `src/Navigation.tsx` | Both screens registered in `commonScreens` (`requireAuth: true`). `getStateFromPath` wraps `router.matchPath` in `applyCommunitiesFlag`. |
| `src/screens/Community/index.tsx` | Placeholder `CommunityScreen` / `CommunityMembersScreen`: render `null`. If the flag is off they `navigate('Home')` (covers in-app pushes, e.g. a `/c/x` link in a post). |
| `src/screens/Community/linking.ts` | `applyCommunitiesFlag([name, params], enabled = COMMUNITIES_ENABLED)`: flag off + community route -> `['Home', {}]`; everything else passes through untouched. |
| `src/screens/Community/__tests__/*` | 3 suites, 10 tests (below). |

`src/screens/Group/index.tsx` is untouched.

## Flag table

| Export (`#/env`) | Env var | Default | Parse | Set in eas.json profiles |
| --- | --- | --- | --- | --- |
| `COMMUNITIES_ENABLED` | `EXPO_PUBLIC_COMMUNITIES_ENABLED` | `false` | `'1'` or `'true'` (same as `DISABLE_AGE_ASSURANCE`) | base, development, preview, production, production-apk, testflight, testflight-android = `"false"` |
| `COMMUNITY_SWITCHER` | `EXPO_PUBLIC_COMMUNITY_SWITCHER` | `false` | `'1'` or `'true'` | all 7 = `"false"` |
| `LOCKED_COMMUNITY` | `EXPO_PUBLIC_LOCKED_COMMUNITY` | `''` | string | all 7 = `""` |
| `BRAND` | `EXPO_PUBLIC_BRAND` | `'authority-one'` | string, empty -> default | all 7 = `"authority-one"` |
| `BRAND_SKIN` | `EXPO_PUBLIC_BRAND_SKIN` | `''` | string | all 7 = `""` |

Export names follow the file's convention (no `EXPO_PUBLIC_` prefix on the
export, e.g. `DISABLE_AGE_ASSURANCE` reads `EXPO_PUBLIC_DISABLE_AGE_ASSURANCE`).
`base` had no `env` block before; one was added so that literally every
profile sets the keys (the others also set them, so nothing depends on
inheritance).

## Tests

- `flags.test.ts`: no env -> all off/empty/`authority-one`; the explicit
  eas.json values -> same; `'true'`/`'1'` parse on, `'yes'` stays off;
  eas.json sets every key to its default in every profile.
- `routes.test.ts`: `/c/abc` -> `Community {id: 'abc'}`,
  `/c/abc/members` -> `CommunityMembers {id: 'abc'}`, both build back;
  flag off -> both land on `Home`; flag on -> untouched; other paths untouched.
- `routeTable.test.ts`: snapshot of every route (name, pattern, match order)
  excluding the two new ones. The snapshot was RECORDED AT THE BASE COMMIT
  before any route edit, and still passes after - existing routes unchanged.

Full suite, `pnpm test --bail=0` (Windows, script shell bash):

| | Suites | Tests |
| --- | --- | --- |
| Base `569b3b240` | 2 failed, 126 passed, 128 total | 1 failed, 28 todo, 1421 passed, 1450 total |
| After `322245a40` | 2 failed, 129 passed, 131 total | 1 failed, 28 todo, 1431 passed, 1460 total |

The 2 failing suites are identical before and after and pre-existing:
`plugins/uiSceneLifecycle/__tests__/withUISceneLifecycle.test.js` (AppDelegate
template regex) and `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts`
(matches a literal `'\n'`). Both look like artefacts of this Windows checkout
(`core.autocrlf=true`, CRLF working tree); not investigated further, out of scope.

`pnpm typecheck`: clean. `eslint` on touched files: clean. Prettier: clean
modulo the CRLF working tree (lint-staged ran prettier at commit).

## Not run / not done (by rule)

- The Cloudflare deploy CLI and `check:bundle` were not run (both are
  deny-listed). No deploy, no EAS / TestFlight / App Store build, no API calls,
  no PDS writes.
- No `intl:extract`. Two new strings (`Community`, `Community members`
  screen titles) are left for the nightly extraction job. `intl:compile` ran
  only as the install postinstall step; its output is gitignored.
- Not tested on a device or simulator. The `getStateFromPath` wiring is
  covered through the pure `applyCommunitiesFlag` helper, not by mounting
  `Navigation.tsx`.

## Open questions

1. The screen-level guard uses `navigation.navigate('Home')`, the existing
   pattern (e.g. `src/screens/Profile/ErrorState.tsx`). On native, from a
   tab whose stack has no `Home` (e.g. Search), that action may be a no-op and
   leave the blank placeholder up. Only reachable with the flag off via an
   in-app `/c/...` link; deep links are already remapped. Acceptable for a
   placeholder, or should it use the `useGoBack` fallback?
2. eas.json `production` / `testflight` profiles were edited because the spec
   says EVERY profile; values are the defaults, so no behaviour change.
