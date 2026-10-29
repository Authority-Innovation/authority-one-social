# Task 48009588 - flags test allows exactly the development-communities profile

Branch: `coord/dev-profile-fix-flags-test-allow-48009588` (base `eed8c1a23`)

## Change

Fix commit: `7006ffdfe148ae872aa4fdf12940f13d253f09b2`

```
 src/screens/Community/__tests__/flags.test.ts | 13 ++++++++++++-
 1 file changed, 12 insertions(+), 1 deletion(-)
```

- New constant `COMMUNITIES_PROFILE = 'development-communities'`, the only
  profile allowed to have `EXPO_PUBLIC_COMMUNITIES_ENABLED: 'true'`.
- New test `has the development-communities profile with Communities on`
  checks by name that this profile exists and has the flag on.
- The existing every-profile test now expects `'true'` for that one profile
  and `'false'` for every other profile, so the test fails if any other
  profile turns the flag on.
- `EXPO_PUBLIC_COMMUNITY_SWITCHER: 'false'`, `EXPO_PUBLIC_LOCKED_COMMUNITY: ''`,
  `EXPO_PUBLIC_BRAND: 'authority-one'` and `EXPO_PUBLIC_BRAND_SKIN: ''` are
  still checked for every profile, including development-communities.
- `eas.json` is unchanged. No other assertion was changed.

## Test result

`pnpm test src/screens/Community/__tests__/flags.test.ts`:
1 suite passed, **5/5 tests passed** (3 env-flag tests, 2 eas.json tests).
Only this file was run, not the full suite.

## Environment notes

- `pnpm` is not on PATH on this machine. I used corepack's pnpm 11.5.2
  through a temporary shim in `/tmp/pnpmshim`, with
  `--config.script-shell` set to Git bash, because the `test` script uses
  POSIX `NODE_ENV=test` syntax that cmd cannot run.
- pnpm's automatic install ran postinstall (`lingui compile`, which writes
  ignored files) and rewrote `package.json` with only line-ending changes.
  I reverted `package.json`; it is not in any commit.
- The pre-commit hook (lint-staged: eslint and prettier) ran and passed.
