# Review baf106a1 - AO-CLICKTHROUGH harness at d6acb2d6c

Review only. Head `d6acb2d6c` on `coord/ao-clickthrough-harness`, diff
reviewed against `f561fcffd` (communities/integration): 19 files, all of
`e2e/clickthrough/`, plus `.gitignore`, `package.json`, `eslint.config.mjs`,
lockfile, docs.

## Verdict

**Can land on communities/integration once H1 is fixed** (a small change in
the spec/config). Everything else asked about holds: the guard refuses
non-Dev targets before any network or browser, credentials load file-first
then process env, the no-credential path is a clean SKIP with exit 0,
artifacts are gitignored, no credential is printed, the Join step runs first,
the hard checks are all there, and the Mac iOS variant is a note only.
H1 matters because it is the one way the "Dev only" promise can quietly
break. It should be fixed before the first run with credentials.

**Dev run: not possible from here.** This environment has no devtest
credential (the skip path confirmed it), and the run rules forbid network
calls off this machine. No browser was launched and no Dev or prod endpoint
was contacted.

## What I ran

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile --offline` (pnpm 11.5.2 from the local store) | packages installed; the `postinstall` (`intl:compile-if-needed`) failed because `pnpm` is not on the cmd PATH. This does not matter for the harness |
| `NODE_ENV=test node node_modules/jest/bin/jest.js e2e/clickthrough` | **3 suites, 31 tests passed, 0 failed** (checks 1, creds 1, guard 1). `pnpm test` itself could not run here: its deps check re-runs install, which hits the same postinstall failure. So I ran jest directly, and did not run the `tsc` prefix or the full suite |
| `DEVTEST_HANDLE= DEVTEST_APP_PASSWORD= CLICKTHROUGH_RUN_ID=baf106a1-skip node e2e/clickthrough/run.js` | prints `SKIPPED: no devtest credential`, **exit 0**, writes REPORT.md/summary.json "No steps ran" |
| `CLICKTHROUGH_BASE_URL=https://bsky.app node e2e/clickthrough/run.js` | `REFUSED ... not the local Dev web build`, exit 2 |
| `EXPO_PUBLIC_AGENT_RUNTIME_URL=https://authority-one-agent-runtime.e-479.workers.dev node e2e/clickthrough/run.js` (prod host) | `REFUSED ... not the Dev runtime`, exit 2 |
| `CLICKTHROUGH_BASE_URL=http://localhost.evil.com:19006 node e2e/clickthrough/run.js` | REFUSED, exit 2 |
| `git check-ignore -v e2e/clickthrough/artifacts/x.png` | ignored by `.gitignore:108` |
| `git check-ignore` on the credential file path | **not run**: the builder deny-list blocks any command naming that file. I checked it statically instead: `.gitignore:103` `.env.*` and `.gitignore:107` `/e2e/clickthrough/.env.local`. No `!` rule re-includes it (the only negations are lines 9-15, 42, 93, 94), and there is no nested `.gitignore` under `e2e/` |
| `git ls-files e2e/clickthrough`, `git log --all -- 'e2e/clickthrough/.env*'`, grep of the diff for password assignments | no credential file was ever committed; only `...` placeholders and `$VAR` references |
| `git status` after the runs | clean (the artifacts are ignored) |

## Findings

### BLOCKER

None.

### HIGH

**H1 - The Dev guard checks an env var, not what the bundle under test actually calls. A reused web server can send Join, grant and post requests to the prod runtime, and the harness would not see it.**
`e2e/clickthrough/playwright.config.ts:34` (`reuseExistingServer: true`), `e2e/clickthrough/clickthrough.pw.ts:77`, `:221-223`, `:375`.
- Failure scenario: a web server is already up on `localhost:19006`, started without the development-communities env. For example, `expo start --web --port 19006` with no `EXPO_PUBLIC_AGENT_RUNTIME_URL`. In that case the bundle falls back to `AGENT_RUNTIME_SERVICE = https://authority-one-agent-runtime.e-479.workers.dev` (prod, `src/lib/constants.ts:30-31`), or to whatever a root `.env` set. `run.js` passes the guard anyway, because it only reads the URL from its own env or from eas.json. Playwright then reuses that server. The `join` step clicks Agree, which sends a membership write to **prod**, and the grant toggle and post follow it. Every runtime watcher filters on the Dev origin, so the prod traffic is invisible. The run just fails later on timeouts, after the prod writes have already landed.
- Fix: in `watch()`, add a `page.context().route('**/*', ...)` that aborts any request to a non-Dev agent-runtime host (anything `*.workers.dev` other than `DEV_RUNTIME_HOST`, or `AGENT_RUNTIME_SERVICE` itself) and fails the step. Also set `reuseExistingServer: false`, or check the reused bundle's runtime before `signin`.

### MEDIUM

**M1 - Join-first is only tested on the first run ever.** `clickthrough.pw.ts:291`.
- Failure scenario: after the first successful run, the devtest account stays a member, because nothing leaves the community. Every later run records `join` as `already-member`, and that counts as a pass (`:442-444` only fails on `fail` or `not run`). The Join button, the holding sheet and the consent flow then go untested indefinitely, while the report still says PASS.
- Fix: add a final `leave` step (or an admin-side removal), or flag `already-member` in REPORT.md as "join not exercised" and do not report the run as a full PASS.

**M2 - The guard only covers the agent runtime. Sign-in and any PDS or appview traffic go to `pds.authority-one.com` / `appview.authority-one.com` from the profile.** `run.js:70-73`, `lib/guard.js:26-56`, `eas.json:55-60`.
- Failure scenario: if those hosts are production (the profile has no Dev PDS), each run signs in to the production PDS. Any record writes that come with a community post would land there too. The README says "Dev only", which overstates it.
- Fix: say in the README that "Dev" means the Dev runtime on the shared PDS and appview, or add those hosts to the guard and route allowlist once a Dev PDS exists.

**M3 - Any `console.error` fails the step, and the harness runs against an Expo *dev* server.** `lib/checks.js:95-97`, `clickthrough.pw.ts:56-65`.
- Failure scenario: React dev-mode warnings and the browser's "Failed to load resource" (any 4xx/5xx, e.g. a 401 before the session is ready) are console errors. The first live run is likely to FAIL on noise rather than on real defects.
- Fix: keep the check strict, but add a small reviewed allowlist (each entry with a comment), or capture the noise from a first live run and decide then. The check works as designed; flagged so the first FAIL is read correctly.

### LOW

- **L1 - `redact` runs on the JSON-encoded text** (`lib/report.js:33`). A secret containing `"` or `\` is escaped in that text and is not matched. App passwords (`xxxx-xxxx-...`) and handles are safe today. Fix: redact the raw strings before `JSON.stringify`.
- **L2 - The door-shape response handler is async** (`clickthrough.pw.ts:75-89`). A body that resolves after the 750 ms wait is pushed into the *next* step's `pendingShape`, so the failure is attributed to the wrong step, or lost after the last step. Fix: tag each entry with `currentStep` at response time, the way console errors are.
- **L3 - `parseDotEnv`, quoted value with an inline comment** (`lib/creds.js:28-37`). `KEY="abc" # note` keeps the quotes in the value, and sign-in fails confusingly. Fix: strip the comment first, then remove the quotes.
- **L4 - Handles appear in full-page screenshots** (`clickthrough.pw.ts:147-155`). Only the login inputs are masked. `secretsOf` treats handles as values the artifacts must not carry, so the screenshots break that rule (handles are not secret, but the code says they are). Fix: either drop handles from `secretsOf`'s stated intent, or mask the known name slots.
- **L5 - `HANDLE_RE` flags display names shaped like domains** (`lib/checks.js:55-56`), for example `Jane.Doe` or `Acme.io`, as raw handles. This is acceptable on the Dev fixture accounts. Mention it in the README.
- **L6 - Child processes inherit `DEVTEST_*`** (`run.js:70-71`). If the credential came from the process env, the Expo web server inherits it too. It is not `EXPO_PUBLIC_*`, so it is not inlined into the bundle. Fix (optional): drop `DEVTEST_*` from the env passed to the `webServer`.
- **L7 - Mac note** (`MAC-IOS-VARIANT.md:60-66`). Passing the password to Maestro with `-e` puts it in argv, where the process list shows it. `--debug-output` can record `inputText` values in the artifacts. It is a note only, but the Mac lane should copy the rule "no credential in artifacts". Fix: say so in the note, and do not use `--debug-output` for the password step.

## Checklist against the spec

- Refuse-on-non-Dev guard: present. It runs before credentials, browser and server, and refuses with exit 2 (verified). Gap: H1.
- Credential loading: `e2e/clickthrough/.env.local` first, then the process env, per key (`lib/creds.js:54-89`). Covered by tests.
- Clean skip: `SKIPPED: no devtest credential`, exit 0, no network (verified). The spec also has `test.skip` as a second guard.
- Credential file gitignored: yes, two rules (checked statically; `check-ignore` on that path was blocked by the deny-list). Artifacts are ignored (verified).
- No credential logged, printed, screenshotted or committed: `describe()` prints presence and source only. Errors and console text are redacted. Login inputs are masked. Trace, video and screenshot-on-fail are off. Nothing is committed. Minor exceptions: L1, L4, L7.
- Join first: yes, the step right after sign-in, and it goes through the app's Join button. Gap: M1.
- Hard checks: braces, raw handle (only in the name slots; all three testIDs exist in `src`), "isn't available yet", crash text plus `pageerror`, console errors. Covered by `checks.test.js`.
- Mac iOS variant: note only. No `ios/` flow and no script wiring.
