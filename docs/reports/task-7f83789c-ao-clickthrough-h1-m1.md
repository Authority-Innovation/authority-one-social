# Task 7f83789c - AO-CLICKTHROUGH review baf106a1: H1 (HIGH) and M1 (MEDIUM)

Branch: `coord/fix-ao-clickthrough-h1-prod-host-7f83789c`, built on
`coord/ao-clickthrough-harness` at d6acb2d6c. Draft PR only. No merge, no
deploy, nothing touched prod, no credential read or logged. The head SHA is the
commit that adds this report (see `report_result` / `git log`); the code
commits before it are 62d488b36 and 1f9b23156, plus the README commit.

## H1 - the Dev guard checked an env var, not the bundle under test

Both parts asked for are done, plus a preflight.

**(a) `context.route()` that aborts non-Dev runtime calls and fails the step.**
New `e2e/clickthrough/lib/runtimeGuard.js`, `createRuntimeGuard()`:

- `install(context)` registers `context.route(url => isAgentRuntimeHost(...))`
  on every browser context the flow opens (the devtest page's context before
  the first navigation, and the admin context in `adminLaunch`). Any request
  to an agent-runtime host that is not `https://authority-one-agent-runtime-dev.e-479.workers.dev`
  is aborted with `route.abort('blockedbyclient')` before it leaves the
  machine - prod (`authority-one-agent-runtime.e-479.workers.dev`, the
  `AGENT_RUNTIME_SERVICE` fallback in `src/lib/constants.ts`), `http:` to the
  Dev host, look-alikes (`...dev.e-479.workers.dev.evil.example`), and any
  other `*agent-runtime*` host (staging, a renamed prod). WebSockets to such
  hosts are closed through `context.routeWebSocket`. Recorded URLs drop the
  query string.
- `step()` in `clickthrough.pw.ts` calls `runtimeGuard.take()` after every
  action; anything blocked fails the step (`BLOCKED request: non-Dev
  agent-runtime request to https://... aborted`) and **stops the flow**, even
  if the action itself "succeeded".
- `serviceWorkers: 'block'` in the config (and on the admin context), because
  service-worker requests skip `context.route()`.
- `page.request` (used only by the leave step) does not go through the route,
  so that call is checked with `classifyRequest` before it is made.

**(b) `reuseExistingServer: false`** in `e2e/clickthrough/playwright.config.ts`.
A server already on the port now fails the run instead of being used.

**Preflight (also asked as the alternative to (b); done as well, because
`CLICKTHROUGH_NO_SERVER=1` still runs against a server someone else started).**
New first step `preflight`: fetches the base URL's HTML, reads its same-origin
bundle script(s) and refuses to sign in unless the Dev runtime host is in the
bundle. Expo inlines `EXPO_PUBLIC_AGENT_RUNTIME_URL` at build time; the prod
host is present in every bundle as the `??` fallback, so only the Dev host's
*absence* is decisive. The route guard is the hard backstop; the preflight is
the early, clear refusal.

Scope note: the guard covers agent-runtime hosts only, as the finding asked.
It does not block the prod PDS/AppView (`pds.authority-one.com`,
`appview.authority-one.com`); a Dev build talks to those too.

## M1 - join ran once, then `already-member` counted as PASS forever

Chosen: **a leave step, on by default**, plus an opt-out flag.

- New step `leave` before `join`. If the devtest account is a member, it calls
  `POST /app/communities/ao-dev-test/leave` (the door route behind
  `communitiesClient.leave`; the app has no leave UI) with the Authorization
  header the app itself just sent the Dev runtime. That header is captured
  from the page's own requests, held in memory only, and added to the
  redaction list so it can never reach an artifact. After the call the
  community home is reloaded and must not show the member badge.
- `join` now **fails** if still a member - unless `CLICKTHROUGH_KEEP_MEMBERSHIP=1`,
  in which case leave is skipped and join may report `already-member` as
  before.
- Every report carries a note saying which mode the run used
  ("leave-then-join" or "KEEP_MEMBERSHIP - join flow may not have been
  exercised").

So: on each run that has the devtest credential, the join flow is exercised,
unless the operator sets the flag.

Assumption to confirm on the first Dev run: the Dev door accepts
`POST /app/communities/:id/leave` with the app's runtime bearer token (the app
client already targets that route; I could not call it from here).

## Tests

| suite | result |
|---|---|
| `jest e2e/clickthrough` (harness, Node) | **4 suites, 53 tests passed, 0 failed** (was 3 / 31) |
| `pnpm e2e:clickthrough:guard` (real browser, msedge, local fixture server) | **2 passed, 0 failed** |
| eslint `e2e/clickthrough` | clean |
| `tsgo` on the harness `.ts` files (strict; they are outside `tsconfig.check.json`) | clean |
| full `jest --forceExit --testTimeout=20000` | 185 suites passed, 4 failed; **2353 tests passed, 2 failed**, 28 todo |

New Jest file `__tests__/runtimeGuard.test.js` (22 tests): prod / `http:` Dev /
look-alike / staging runtime URLs are aborted, Dev / localhost / PDS allowed;
on a fake context the prod route is aborted with `blockedbyclient`, not
passed on, recorded without its query string, and turns into a step failure;
`take()` drains per step; the Dev route goes through (`fallback`, or the allow
hook); a prod WebSocket is closed; `checkBundle` refuses a prod-only bundle
and passes a Dev one; `checkServedBundle` on a fake reused server pointing at
prod refuses, on a Dev one passes; the config has `reuseExistingServer: false`
and `serviceWorkers: 'block'`.

Browser fixture `e2e/clickthrough/guard-fixture/guard.pw.ts`, a local HTTP
server standing in for "a server already on the port":

- **bundle calls the prod runtime**: preflight refuses; the in-page fetch
  rejects; Playwright reports the request failed with
  `net::ERR_BLOCKED_BY_CLIENT`; the allow hook is never reached; the step
  fails, stops the flow, and its reason is `BLOCKED request: non-Dev
  agent-runtime request to https://authority-one-agent-runtime.e-479.workers.dev ...`.
- **bundle is the Dev build**: preflight passes; the Dev request reaches the
  allow hook (fulfilled locally, so nothing leaves the machine); the page sees
  200; the step passes with no blocked requests.

The 4 full-suite failures are outside `e2e/` and environmental on this
checkout: `__tests__/lib/string.test.ts` (compiled locale catalogs missing -
the postinstall `intl:compile-if-needed` failed because `pnpm` is not on PATH,
and intl compilation is CI-only), `lexicon.test.ts` and
`noBackgroundLocationShipped.test.ts` (byte/substring checks against a CRLF
checkout, `core.autocrlf=true`), `withUISceneLifecycle.test.js` (iOS template
text). The previous report (c963c6da) had the same CRLF/template class of
failures. `tsconfig.check.json` typecheck: 82 errors, all missing
`src/locale/locales/*/messages` (same cause); none in changed files.

## Not done

- **No live Dev run.** The devtest credential is not on this PC
  (`e2e/clickthrough/.env.local` absent), and this run may not reach off the
  machine anyway. The leave call and the bundle preflight against a real
  `expo start --web` build are therefore unverified end to end. First run on
  the Mac / with the credential: `pnpm e2e:clickthrough` and check that step
  00 says "served bundle carries the Dev runtime host" and step 02 either
  leaves or skips.
- No credential appears in any output: none was present, and the new code
  only adds the captured runtime bearer to the redaction list.

## Files

- `e2e/clickthrough/lib/runtimeGuard.js` - new: route guard, preflight
- `e2e/clickthrough/clickthrough.pw.ts` - guard installed, preflight and leave steps, join fails if still a member
- `e2e/clickthrough/playwright.config.ts` - `reuseExistingServer: false`, `serviceWorkers: 'block'`
- `e2e/clickthrough/__tests__/runtimeGuard.test.js` - new
- `e2e/clickthrough/guard-fixture/` - new browser tests and their config
- `e2e/clickthrough/README.md` - guard, preflight, steps renumbered, leave/flag
- `package.json` - `e2e:clickthrough:guard`
