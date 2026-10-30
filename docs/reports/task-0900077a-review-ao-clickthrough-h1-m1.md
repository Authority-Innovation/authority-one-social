# Task 0900077a - independent review of AO-CLICKTHROUGH H1/M1 fix (head 676777c8)

Reviewed: `coord/fix-ao-clickthrough-h1-prod-host-7f83789c` at `676777c82`
(3 commits on `coord/ao-clickthrough-harness` `d6acb2d6c`: `62d488b36`,
`1f9b23156`, `676777c82`). Review only. Nothing was merged, deployed or run
against Dev or prod, and no credential was read or used.

## Verdict

**Can land on `coord/ao-clickthrough-harness`, with one small fix first or
straight after (F1).** H1 and M1 are fixed. F1 is a one-character bug in the
redaction of the runtime bearer token. It does not affect H1 or M1, but it does
break part of check (d).

## Findings

### F1 (medium) - the bare runtime bearer token is never added to `secrets`

`e2e/clickthrough/clickthrough.pw.ts:90`

```ts
secrets.push(auth, auth.replace(/^Bearers+/i, ''))
```

The regex is missing a backslash: `Bearers+` means "Bearer" followed by one or
more `s`, not `Bearer\s+`. So for `Bearer eyJ...` the second value is the
whole header again, and the bare JWT is never registered as a secret:

```
> 'Bearer eyJabc.def'.replace(/^Bearers+/i, '')   -> "Bearer eyJabc.def"
> 'Bearer eyJabc.def'.replace(/^Bearer\s+/i, '')  -> "eyJabc.def"
```

The full `Bearer <jwt>` string is still redacted. But the bare token is not
redacted where it shows up without the prefix: a console error, a page error
stack, a response body quoted in a failure reason, or the
`REPORT.md` / `results.json` artifacts. That token is the devtest PDS
accessJwt (session credential). Fix: `/^Bearer\s+/i`. Ideally also add a Jest
case, though the line is inline in the spec and not exported.

### F2 (low, informational) - what the guard does and does not cover

- `isAgentRuntimeHost` matches by hostname substring `agent-runtime`. It
  catches the prod fallback, staging-style names and case variants (verified
  below). It would not catch a non-Dev runtime behind a custom domain. The
  served-bundle preflight covers that case for builds: it refuses a bundle
  without the Dev host, and nothing in `src/` hard-codes the Dev host (only
  `eas.json`, tests and e2e files do), so the substring check is meaningful.
- `page.request` / `context.request` (APIRequestContext) do not go through
  `context.route()`. The spec knows this: the only runtime call it makes that
  way (leave) checks `classifyRequest` by hand first. Keep it that way for any
  new direct calls.
- The preflight is a substring check, so a non-Dev bundle that mentions the
  Dev host anywhere (for example `http://<dev host>`) would pass it. The
  runtime guard still aborts the actual call (verified below), so this only
  removes one of the two layers.
- Sign-in goes to whatever PDS the bundle was built with. That is outside this
  task's scope (runtime host), so it is noted only.

## Checks

### (a) Runtime guard aborts every non-Dev agent-runtime request on every context, and fails the step - PASS

- `runtimeGuard.install` is called on the devtest page's context
  (`clickthrough.pw.ts:298`) and on the admin context (`:274`) before any page
  in it navigates. Both use `serviceWorkers: 'block'`, which is also set in the
  config, so SW requests cannot bypass the route.
- HTTP requests are aborted with `blockedbyclient`. WebSockets are closed with
  1008 through `routeWebSocket` (Playwright 1.64.1 has it). Only
  `https:`/`wss:` to the exact Dev host is allowed.
- `step()` takes the blocked list after every step, adds the entries to the
  failures, sets `actionFailed`, and throws `StopFlow`, so the step fails and
  the flow stops. Failure text is URL origin and path only, with no query
  string.

### (b) `reuseExistingServer` - PASS (false, and the bundle is verified before sign-in anyway)

`e2e/clickthrough/playwright.config.ts` sets `reuseExistingServer: false`.
`preflight` is the first step in the flow, before `signin`, and it runs whether
or not `CLICKTHROUGH_NO_SERVER` is set. A failed preflight stops the flow.

**New test: `e2e/clickthrough/guard-fixture/reusedServer.guard.pw.ts`** (runs
with `pnpm e2e:clickthrough:guard`). It is independent of the builder's
`guard.pw.ts`:

1. *real config refuses a server already on the port*: it starts a local
   server on a port, then runs the **real**
   `e2e/clickthrough/playwright.config.ts` as a child Playwright process with
   `CLICKTHROUGH_BASE_URL` pointing at it and no credential. It asserts a
   non-zero exit and `http://localhost:<port> is already used`.
2. *non-Dev reused server*: the served bundle calls the prod host, an
   upper-case prod host, a `-staging` agent-runtime host, `http://` Dev, and
   `wss://` prod. Two browser contexts (as devtest and admin have), plus a
   second page in each. The test asserts that the preflight refuses, every
   fetch errors, the socket closes with 1008, each step fails with 10 BLOCKED
   entries (2 of them websocket), and nothing leaked.
3. *Dev reused server*: preflight `{ok: true}`, the Dev https call is
   allowed and the step passes.

No request leaves the machine. A local catch-all route is installed on each
context **before** the guard, so the guard's handler runs first, and anything
it lets through (its real default, `route.fallback()`) is fulfilled locally.
For a non-Dev URL, reaching the catch-all counts as a leak and fails the test.
Unlike the builder's test, which fulfils allowed requests from a custom
`allow` hook, this test exercises the guard's production default path.

**Mutation check** (applied by hand, then reverted with `git checkout`): with
`classifyRequest` forced to `allow` and `reuseExistingServer: true`, the
builder's prod test in `guard.pw.ts` and my tests 1 and 2 fail (3 failed,
2 passed: the two Dev-path tests). So the tests do detect a broken guard and a reused server.
With the guard disabled, requests were still fulfilled locally by the test
hooks, so nothing went off the machine.

Not covered: the Dev-host WebSocket allow path. The guard calls
`ws.connectToServer()`, which would really connect, so I did not run it.

### (c) M1 - join is exercised on every run that has the credential - PASS

The new `leave` step runs after `signin`:

- not a member: `skipped`, and join runs the full flow.
- a member: POST `/app/communities/ao-dev-test/leave` with the app's own Dev
  runtime auth, after a `classifyRequest` check. The step fails if the member
  badge is still shown, and `StopFlow` keeps join from running against stale
  state.
- `join` now **fails** with `still a member after the leave step` instead of
  passing as `already-member`.

`already-member` is only possible with an explicit
`CLICKTHROUGH_KEEP_MEMBERSHIP=1`, and the run notes say so.

Not verified live: there is no credential on this machine, and the task
forbids touching Dev. The `/leave` route's existence and response shape on the
Dev runtime are taken from the builder's report.

### (d) No credential in any output or log - PARTIAL (see F1)

- `run.js` prints `describe(creds)` only, which is presence and source.
- The config turns off trace, video and screenshot. Step screenshots mask the
  username and password inputs.
- Every failure reason, console error and page error goes through
  `redact(..., secrets)`, and `writeArtifacts` redacts the whole JSON.
- `runtimeAuth` is held in memory only and is never logged. The full
  `Bearer ...` header is redacted, but the bare token is not (F1).
- My test sets no credential, and its child process gets blank `DEVTEST_*`
  and a nonexistent `CLICKTHROUGH_ENV_FILE`. There is no
  `e2e/clickthrough/.env.local` in this worktree.

## What I ran

`pnpm` is not on PATH on this machine, so I called the tools directly.
`node_modules` is a directory junction (gitignored, uncommitted) to the
`7f83789c` builder worktree's `node_modules`. Nothing in that worktree was
modified.

| Command | Result |
| --- | --- |
| `node node_modules/jest/bin/jest.js e2e/clickthrough` | **4 suites, 53 passed, 0 failed** |
| `node node_modules/@playwright/test/cli.js test -c e2e/clickthrough/guard-fixture/playwright.config.ts` (msedge), before my test | **2 passed, 0 failed** |
| same, with my `reusedServer.guard.pw.ts` | **5 passed, 0 failed** |
| same, with mutations (guard allow-all and `reuseExistingServer: true`) | 3 failed, 2 passed (expected), reverted |
| `node node_modules/eslint/bin/eslint.js e2e/clickthrough/guard-fixture/reusedServer.guard.pw.ts` | clean |

I did not run the full app Jest suite, `pnpm typecheck`, or a live
`pnpm e2e:clickthrough`: no credential, and Dev is off-limits for this task.
After each run I checked that no stray `expo` process was left behind.

## Files

- `e2e/clickthrough/guard-fixture/reusedServer.guard.pw.ts` - new test
- `docs/reports/task-0900077a-review-ao-clickthrough-h1-m1.md` - this report
