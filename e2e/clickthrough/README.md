# AO clickthrough - standing QA harness

A Playwright walk through the One web build (development-communities flags)
against the **Dev** runtime, `authority-one-agent-runtime-dev`. It signs in as
the devtest account, joins `ao-dev-test` through the app's join screen if
needed, and clicks through the community home, agent card, agent grant,
Members tab and composer, checking every screen as it goes.

```bash
pnpm e2e:clickthrough
```

On this PC pnpm is not on PATH; `node e2e/clickthrough/run.js` is the same
command.

## Wiring rule - every app fix task

**Any app fix task runs `pnpm e2e:clickthrough` before it goes to review**, and
its report attaches:

- the artifacts folder path, `e2e/clickthrough/artifacts/<runId>/`, and
- the contents of `e2e/clickthrough/artifacts/<runId>/REPORT.md`.

A run that SKIPPED (no devtest credential) is reported as skipped, never as
passed. The same rule is in `docs/REVIEW-CHECKLIST.md`.

## Dev only

`run.js` refuses to start (exit 2, before any network call, before a browser
or the web server is launched) unless:

- the base URL (`CLICKTHROUGH_BASE_URL`, default `http://localhost:19006`) is
  a loopback host - the local web build made with the development-communities
  flags, and
- the runtime (`EXPO_PUBLIC_AGENT_RUNTIME_URL`, default from the
  `development-communities` profile in `eas.json`) is
  `https://authority-one-agent-runtime-dev.e-479.workers.dev`.

The Playwright web server runs `expo start --web` with the
`development-communities` profile env from `eas.json` (reused if one is
already up on the base URL).

## Credentials

Elliott creates the devtest account and puts the credential on the PC:

```
# e2e/clickthrough/.env.local  (gitignored - never commit it)
DEVTEST_HANDLE=...
DEVTEST_APP_PASSWORD=...
# optional: the admin step (launch) runs only with these
DEVTEST_ADMIN_HANDLE=...
DEVTEST_ADMIN_APP_PASSWORD=...
```

Each key is read from that file first, then from the process environment.
The file is gitignored twice (`.env.*` and an explicit
`/e2e/clickthrough/.env.local` rule). Check with
`git check-ignore -v e2e/clickthrough/.env.local`.

No credential: the run **skips cleanly** - exit 0, `SKIPPED: no devtest
credential` in the console and in `REPORT.md`, no browser, no network.

The harness never prints, logs or screenshots the values: only "present" or
"absent" is printed, the login fields are masked in screenshots, Playwright
traces and videos are off (they would capture typing), and every artifact
string passes through a redactor that replaces the handles and passwords.

The devtest account needs a **display name**: the raw-handle check fails a
post author shown by handle.

## Steps

| nn | step | passes when |
|---|---|---|
| 00 | signin | the login form closes |
| 01 | join | already a member (`already-member`), or joined through the app's join screen |
| 02 | home | the community switcher is on Home |
| 03 | community-chip | the `ao-dev-test` chip opens `/c/ao-dev-test` |
| 04 | community-home | header and member badge |
| 05 | agent-card | the agent card is shown |
| 06 | grant-on | the grant switch turns on, the runtime answers `on: true` |
| 07 | grant-off | the switch turns off, the runtime answers `on: false` |
| 08 | members-tab | the Members section is shown |
| 09 | compose | the composer opens and takes text |
| 10 | post | the runtime accepts `POST /app/communities/ao-dev-test/posts` |
| 11 | post-in-feed | the new post is in the community Posts list |
| 12 | door-shapes | at least one timeline and one roster response were seen, all shape-checked |
| 13 | admin-launch | `SKIPPED` without `DEVTEST_ADMIN_*`; else the admin launches the agent (or it already is) |

Join: the app's own way in is tried first (the Join button on the community
home). While that button still opens the holding sheet (`JoinConsentEntry`),
the harness notes it in the report and joins through the join screen at
`/c/ao-dev-test/join` - the real join UI, never an API call.

An action that fails stops the flow (later steps: `not run`). A hard-check
failure fails its step and the flow goes on.

## Hard checks (every step)

- no literal `{` or `}` in visible text (the build 40 placeholder bug);
- no raw handle or DID where a display name is expected: the agent sponsor
  line, post author names, roster names;
- no "isn't available yet" anywhere;
- no red-screen, error boundary or crash text;
- no console errors: any `console.error` or uncaught exception fails the step;
- door shapes: every timeline and roster response from the Dev runtime is
  checked against the shapes inferred from the runtime-generated fixtures,
  `src/lib/communities/__fixtures__/door/door.json` (unknown key, missing
  required key or a type change fails). Regenerate those fixtures with
  `scripts/communities/generateDoorFixtures.mjs` when the door changes.

## Output

`e2e/clickthrough/artifacts/<runId>/` (gitignored):

- `<nn>-<step>.png` - full-page screenshot after each step;
- `summary.json` - step, status, reason, timestamp, screenshot path;
- `REPORT.md` - pass/fail per step, console errors, screenshot list.

## Browser

Bundled Chromium by default (`npx playwright install chromium` once). To use
an installed browser instead: `CLICKTHROUGH_BROWSER_CHANNEL=msedge` (or
`chrome`).

## Tests for the harness

`e2e/clickthrough/__tests__/` (run by jest, so by `pnpm test`):

- `guard.test.js` - the refuse-on-prod guard: a non-Dev base URL or runtime
  exits non-zero, with no fetch/http/https/net call and no child process;
- `creds.test.js` - env-file then env precedence; the no-credential path
  exits 0 with "SKIPPED: no devtest credential" and prints no secret;
- `checks.test.js` - a literal `{sponsorName}` fails, a raw handle where a
  name is expected fails, a clean fixture passes, and the door shape checks.

## Files

- `run.js` - entry: guard, credentials, Playwright
- `playwright.config.ts`, `clickthrough.pw.ts` - the flow
- `lib/guard.js`, `lib/creds.js`, `lib/checks.js`, `lib/report.js`
- `MAC-IOS-VARIANT.md` - the pre-TestFlight iOS simulator version (Mac lane)
