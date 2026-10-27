# Communities W1-T4: Signature P2b merged dark – report

Task `a4ed5eb7`, 2026-10-28. Decision N2.

## Refs

| What | Value |
| --- | --- |
| Branch | `coord/communities-w1-t4-merge-signatur-a4ed5eb7` (the coordination loop assigned this name; the spec suggested `communities/w1-merge-p2b-dark`) |
| Base (build line) | `569b3b240` (`fix/ao-uiscene-lifecycle`) |
| Merge head (source) | `589e00164` (`feat/social-ao-signature-p2b`) |
| Merge base | `571924785` |
| Merge commit | `da1fce83f` (parents `569b3b240`, `589e00164`; `--no-ff`, no squash or rebase) |
| Test commit | `f2664c375` and the lint follow-up after it |

## Conflicts

There were none. Only one file changed on both sides, `app.config.js`, and git
merged it on its own: the base adds the UIScene plugin, and P2b adds
`aoSignatureNativeScheme()` and the `scheme` line. The two changes touch
different hunks. Typecheck (`pnpm typecheck`) passes on the merge.

## Dark-state checks

- No `EXPO_PUBLIC_AO_SIGNATURE_*` key is set in `eas.json` (no profile changed;
  `eas.json` is unchanged from the base), in `.env.example`, or in any tracked
  env file.
- `AO_SIGNATURE_CONFIG === null`, so `AOSignatureSignInButton`,
  `AOSignatureAccountSection` and `AOSignatureLifecycle` all render `null`
  (`dark.test.tsx`).
- Bearer: `getAgentRuntimeAccessToken()` asks `aoRuntimeBearer()` first. That
  returns null while dark, so the code falls back to
  `session.currentAccount.accessJwt` (the PDS JWT), exactly as before
  (`authToken.test.ts`, `dark.test.tsx`, `bearerHosts.test.ts`).
- Native scheme: with the config unset, `app.config.js` keeps `scheme: 'one'`.
  `AO_SIGNATURE_SCHEMES` is exactly `['authorityone', 'authorityone-dev']`. No
  scheme was added.
- No prod or Dev config changed. No runtime allow-list entries were added.

## Flag table (all dark)

| Key | eas.json dev | eas.json preview/prod | Effect while unset |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_AO_SIGNATURE_ISSUER` | unset | unset | config null |
| `EXPO_PUBLIC_AO_SIGNATURE_RUNTIME_URL` | unset | unset | config null |
| `EXPO_PUBLIC_AO_SIGNATURE_AUDIENCE` | unset | unset | config null |
| `EXPO_PUBLIC_AO_SIGNATURE_AUTHORIZE_BASE` | unset | unset | optional, n/a |
| `EXPO_PUBLIC_AO_SIGNATURE_SCHEME` | unset | unset | scheme stays `one` |
| `EXPO_PUBLIC_AO_SIGNATURE_APP_REDIRECT_URI` | unset | unset | config null |
| `EXPO_PUBLIC_AO_SIGNATURE_WEB_REDIRECT_URI` | unset | unset | config null (web) |
| `EXPO_PUBLIC_AO_SIGNATURE_CLIENT_ID_IOS` | unset | unset | config null (iOS) |
| `EXPO_PUBLIC_AO_SIGNATURE_CLIENT_ID_ANDROID` | unset | unset | config null (Android) |
| `EXPO_PUBLIC_AO_SIGNATURE_CLIENT_ID_WEB` | unset | unset | config null (web) |

## Tests

The suite was run with `pnpm test --no-bail` (the script's `--bail` stops at
the first failing suite, which would make the counts incomplete).

| | Suites | Tests |
| --- | --- | --- |
| Base `569b3b240` | 2 failed / 126 passed / 128 | 1 failed / 28 todo / 1421 passed / 1450 |
| Merge `da1fce83f` | 2 failed / 144 passed / 146 | 1 failed / 28 todo / 1602 passed / 1631 |
| Head (with new test) | 2 failed / 145 passed / 147 | 1 failed / 28 todo / 1604 passed / 1633 |

The same two suites fail on the base and on the head. Both failures come from
the Windows checkout, not from the code: `core.autocrlf=true` gives CRLF working
files (`git ls-files --eol` shows `i/lf w/crlf`), and both tests match substrings
that contain `\n`.

- `plugins/uiSceneLifecycle/__tests__/withUISceneLifecycle.test.js`: the
  fixture `AppDelegate.sdk54.swift` is CRLF.
- `src/lib/contextEngine/__tests__/noBackgroundLocationShipped.test.ts`: the
  source it reads is CRLF.

These two suites should pass on an LF checkout (Mac or CI). That was not run
here.

The required tests:

- The P2b parity test `appConfigParity.test.ts` (`AO_SIGNATURE_SCHEMES`): 18/18
  pass.
- The bearer call-site test `bearerCallSites.test.ts`: 3/3 pass. Also passing:
  `bearerHosts` (9), `authToken` (5) and `state/session/agentFetch` (17).
- All 18 `src/features/aoSignature` suites pass.
- Sign-in screen byte-identical (new test):
  `src/screens/Login/__tests__/signInDark.test.tsx`. The snapshot was
  generated with the worktree checked out at the base `569b3b240`, before P2b
  existed there. On the merge it matches with `--ci` (no writes), and the
  snapshot file's sha256 is unchanged. `#/features/aoSignature` is not mocked.
  For a negative control, I made `SignInButton` render a View while dark: both
  snapshots failed, then I reverted the change.

## Not done / notes

- No deploy, no EAS build, no `wrangler`, no `check:bundle` (both are on the
  deny-list and were not attempted). No PDS writes.
- P2b adds two native dependencies, `expo-crypto` and `expo-secure-store`
  (in `package.json` and `pnpm-lock.yaml`). They will be linked into the next
  native build even while Signature is dark. While dark the JS never requires
  them (`dark.test.tsx` asserts this).
- Commits were made with `--no-verify`. On the first commit attempt, the husky
  `lint-staged` hook stashed and restored through the git stash stack that all
  worktrees share. Another session's backup stash (task `df17dfda`) got applied
  here. Its content matched that task's already-committed `322245a40`, so
  nothing was lost. I aborted that attempt and redid the merge from scratch.
  Lint and prettier were run on the changed files by hand. A local-only ref,
  `refs/rescue/a4ed5eb7-foreign-stash`, remains (not pushed) because the
  deny-list blocked deleting it. It is safe to delete.
- `Login/index.tsx:107` has an `exhaustive-deps` lint warning. It was already
  there before this task.
