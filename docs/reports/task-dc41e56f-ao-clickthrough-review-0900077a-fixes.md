# Task dc41e56f - AO-CLICKTHROUGH review 0900077a: F1 and F2

Branch `coord/fix-ao-clickthrough-review-09000-dc41e56f`, built on
`coord/fix-ao-clickthrough-h1-prod-host-7f83789c` (head 676777c8). No merge,
no deploy, no prod, no credential read, printed or logged.

## F1 - token redaction regex (fixed)

`clickthrough.pw.ts:90` stripped the scheme with `/^Bearers+/i` (no
backslash), so the bare runtime JWT never went on the redaction list; only
the whole `Bearer <jwt>` string did. An error that quoted the bare token
would have reached the report unredacted.

Fix: the header-to-secrets step moved into `lib/creds.js` as
`authSecrets(auth)`, using `/^Bearer\s+/i`, and returns both the whole
header and the bare token. `clickthrough.pw.ts` calls it. Moving it into the
lib is what makes it testable from Jest.

Tests (`__tests__/creds.test.js`, `authSecrets`): header and bare token both
returned (also with a lower-case `bearer` and a tab); **a bare JWT inside an
error string is redacted** to `[REDACTED]`; a missing header gives nothing.

## F2 (info) - the cheap parts, done

- **Custom-domain runtime**: the route matches hosts containing
  `agent-runtime`, so a runtime on a custom domain would not be routed. Not
  changed in code; the README now says so and says that the served-bundle
  preflight is what covers a build pointed anywhere other than Dev.
- **`page.request` bypasses `context.route()`**: documented in the README.
  The leave step's hand check is now a guard method,
  `runtimeGuard.guardedPost(request, url, opts)`: a non-Dev agent-runtime URL
  (prod, plain `http:` to the Dev host, look-alikes) is recorded as
  `BLOCKED api request: ...` so the step fails, and refused before
  `request.post` is called. Dev URLs go through unchanged. The leave step
  uses it.
- **Preflight substring**: `checkBundle` no longer accepts any mention of the
  Dev host. It needs the exact Dev runtime URL: `https://` (or JSON-escaped
  `https:\/\/`) plus the Dev host with literal dots, not followed by more host
  characters. A bare mention (for example in a comment), a
  `<dev host>.evil.example` suffix, an `x<dev host>` prefix, or a host with the
  dots replaced are all refused.

Tests:
- `__tests__/runtimeGuard.test.js`: `guardedPost` refuses a prod
  `page.request` POST (not sent, step failure recorded, query string not in
  the failure), refuses `http:` to the Dev host, and sends a Dev one with
  nothing recorded. `checkBundle` passes the exact Dev URL in 3 forms (plain,
  with a path, JSON-escaped slashes) and refuses the 4 near-misses above.
- `guard-fixture/guard.pw.ts` (real browser): new test, `page.request` POST to
  the prod runtime through `guardedPost`. Nothing reaches the
  APIRequestContext, and the step fails with `BLOCKED api request`. No request
  leaves the machine.

## Test results (run on the PC, 2026-10-30)

| suite | result |
|---|---|
| `jest e2e/clickthrough` (harness unit tests, `NODE_ENV=test`) | **4 suites, 66 tests passed, 0 failed** (was 4 / 53 at 676777c8) |
| `pnpm e2e:clickthrough:guard` (playwright, msedge, local fixture server) | **3 passed, 0 failed** (the 2 existing ones plus the new `page.request` one) |
| eslint `e2e/clickthrough` | clean |
| `tsgo --strict` on `clickthrough.pw.ts` and `guard-fixture/guard.pw.ts` | clean |

The existing guard tests are unchanged and still green. The only Jest suites
touched are the clickthrough ones. I did not run the full app `jest`; nothing
outside `e2e/clickthrough` changed.

Environment note: this worktree had no `node_modules` and `pnpm` is not on
PATH here, so I ran the binaries from `node_modules/.bin` through a directory
junction to the 7f83789c worktree's `node_modules` (same lockfile). The
junction is gitignored and not committed.

## Not done

- **Live Dev run**: not run. It needs the devtest credential
  (`e2e/clickthrough/.env.local`), which is not on the PC. Without it,
  `pnpm e2e:clickthrough` exits with `SKIPPED: no devtest credential`. The
  first run with the credential exercises `guardedPost` on the real leave
  call.
- Custom-domain runtime hosts are still not matched by the route (documented
  only, as the review asked).
