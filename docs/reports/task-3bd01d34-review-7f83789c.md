# Review 3bd01d34 - backlog record 7f83789c (AO-CLICKTHROUGH H1 + M1)

REVIEW ONLY. Nothing was committed to the reviewed branches, pushed to them,
merged, deployed or run against Dev or prod. No credential was read.

## What was reviewed

- The spec named `coord/ao-clickthrough-harness` (tip d6acb2d6c). That tip
  does **not** contain the 7f83789c fix. The fix is on
  `origin/coord/fix-ao-clickthrough-h1-prod-host-7f83789c`, built on
  d6acb2d6c: 62d488b36 (fix), 1f9b23156 (tests), 676777c82 (docs/report).
  I reviewed that diff against d6acb2d6c (`git diff d6acb2d6c..676777c82`).
- A follow-up branch, `coord/fix-ao-clickthrough-review-09000-dc41e56f`
  (5249fc2f2, 6422c97cc, 0ba508c59), builds on 676777c82 and already fixes the
  HIGH below. I only checked it for that one fix. I did not review it in full.

Files: `e2e/clickthrough/lib/runtimeGuard.js`, `clickthrough.pw.ts`,
`playwright.config.ts`, `__tests__/runtimeGuard.test.js`, `guard-fixture/*`,
`README.md`, `package.json`. I also read `lib/guard.js`, `lib/creds.js`,
`lib/report.js`, `run.js`, `eas.json` (development profile),
`src/lib/agent-runtime/config.ts`, `src/lib/constants.ts` and
`src/screens/Community/components/CommunityHeader.tsx`.

## What I ran

- `git fetch`, `git log`, `git diff`, `git show`, `git grep` on the branches
  above.
- This worktree has no `node_modules`, and installing them needs the network,
  so **I did not run jest, Playwright, eslint or typecheck**. Instead I copied
  `lib/guard.js`, `lib/runtimeGuard.js` and `lib/creds.js` from 676777c82 to a
  throwaway scratch directory (deleted afterwards, not committed) and called
  them directly with `node`:
  - `classifyRequest`: prod host -> abort; `http:` Dev -> abort; Dev
    look-alike `...dev.e-479.workers.dev.evil.example` -> abort; upper-case Dev
    host -> allow (correct, since URL lowercases the host); Dev https -> allow;
    `https://runtime.authority-one.com` (a hypothetical custom domain) -> allow;
    PDS -> allow.
  - The bearer redaction expression `auth.replace(/^Bearers+/i, '')` on
    `'Bearer eyJ...'` gives back `'Bearer eyJ...'` unchanged, and
    `redact('error: token eyJ... rejected', secrets)` leaves the bare token in
    place. **Confirmed.**
  - `checkBundle` passes a bundle that holds the Dev host only in an unrelated
    string, and one with `http://<dev host>`.
- I did not rerun the builder's test counts (53 jest tests, 2 guard-fixture
  browser tests). They are the builder's claims and I have not verified them.

## Findings

### HIGH-1 - the captured runtime bearer's bare token is never redacted

`e2e/clickthrough/clickthrough.pw.ts:90` (62d488b36):
`secrets.push(auth, auth.replace(/^Bearers+/i, ''))`. The regex is missing
its backslash: `Bearers+` matches the literal text "Bearer" followed by one or
more `s`, not `Bearer\s+`. So for `Bearer <jwt>` the second entry is the full
header again, and the bare `<jwt>` is not on the redaction list.

- Failure scenario: a console error, a step failure message or a
  shape-check message holds the bare token. For example, an error that echoes
  the token, or a log line with `token=<jwt>`. `credsLib.redact` only replaces
  `Bearer <jwt>`, so the bare JWT goes into `REPORT.md` and the other
  artifacts. The README's PR template tells operators to paste `REPORT.md`
  into the PR. Per `src/features/aoSignature/config.ts`, this bearer is the
  devtest account's live PDS access JWT (or its AO session token). The report
  says the token "can never reach an artifact", and that is not true.
- No test covers this case. `runtimeGuard.test.js` never exercises
  `watch()`/redaction of a captured header.
- Fix: `auth.replace(/^Bearer\s+/i, '')`, plus a test that a bare token in an
  error string is redacted. This is already done on dc41e56f (5249fc2f2,
  `credsLib.authSecrets`).

### MEDIUM-1 - the `page.request` bypass is guarded only at its one current call site

`clickthrough.pw.ts` leave step (~L342-347): `page.request` does not go
through `context.route()`, so the guard depends on a hand-written
`classifyRequest` check just before the POST. `preflight` also uses
`page.request` (`runtimeGuard.js:177-194`) with no check. It only fetches
`baseURL` and same-origin script URLs, and run.js requires `baseURL` to be
loopback, so it is safe today.

- Failure scenario: the next step that adds a `page.request.get/post` to the
  runtime (for example a cleanup call) skips the guard silently. If its URL
  came from anything other than the validated `runtimeOrigin`, the bearer
  would go to a non-Dev host and nothing would fail.
- Fix: send every `page.request` call through one guarded wrapper that
  classifies, records and refuses. dc41e56f adds `guardedPost` (6422c97cc).
  Extend the same wrapper to GET.

### LOW-1 - the host match is a substring heuristic

`runtimeGuard.js:34-37`. A host counts as a runtime only if it is the prod
host or contains `agent-runtime`. A prod runtime behind a custom domain, or
`EXPO_PUBLIC_AO_SIGNATURE_RUNTIME_URL` pointed at such a domain, passes the
guard untouched. No such host exists in the repo today (checked with
`git grep`).

- Fix: also block any host that is not on an explicit allow-list (Dev
  runtime, loopback, PDS/AppView, known static origins), or block every
  `*.workers.dev` host except Dev. dc41e56f documents this as a limit; it
  does not close it.

### LOW-2 - the preflight is a loose substring check

`runtimeGuard.js:163`. `includes(DEV_RUNTIME_HOST)` passes if the Dev host
appears anywhere in the bundle, for example only in
`EXPO_PUBLIC_AO_SIGNATURE_RUNTIME_URL`, or as `http://`. The route guard still
aborts the real calls, so this costs an early, clear refusal rather than
safety.

- Fix: match the exact `https://<dev host>` URL as the
  `AGENT_RUNTIME_BASE_URL` value. dc41e56f says it does "exact-URL preflight".

### LOW-3 - blocked requests after the last step's `take()` never fail the run

`clickthrough.pw.ts`: `runtimeGuard.take()` is only drained inside `step()`.
A non-Dev runtime request aborted after the final step's 750 ms window (for
example background polling while artifacts are written) is still aborted, so
nothing leaves the machine. But it is not reported, and the run can say PASS.

- Fix: in the `finally`, before `writeArtifacts`, fail the run if
  `runtimeGuard.take()` is non-empty (or `all()` has entries no step owned).

### LOW-4 - `runtimeAuth` is one global, last writer wins

`clickthrough.pw.ts:85-92`. `watch()` runs on both the devtest page and the
admin page. Each overwrites `runtimeAuth` with the latest header it sees. The
`startsWith(runtimeOrigin)` prefix test also matches look-alike hosts, whose
`request` events still fire before the route aborts them. This is harmless
today: leave runs before admin-launch, and the leave URL is always the
validated `runtimeOrigin`. Adding the admin token to `secrets` is a benefit.
But a reordered flow would leave with the admin's token.

- Fix: capture only from the devtest page, and compare
  `new URL(req.url()).origin === runtimeOrigin`.

### Scope notes (not defects of this record)

- The guard covers agent-runtime hosts only, as the H1 finding asked. The
  `development` EAS profile points at prod PDS/AppView
  (`pds.authority-one.com`, `appview.authority-one.com`), so sign-in and any
  PDS writes from the flow still reach prod services. That is by design for
  this Dev setup, and the report states it.
- M1 (leave-then-join) looks correct. `isMember` reads the same descriptor
  that renders `communityHeader` (`CommunityHeader.tsx:59`), so after
  `openCommunity` waits for the header there is no loading race. The community
  query is not persisted (`createQueryKey('community', args)` with no
  `persistedVersion`), so a reload after leave cannot show a stale badge. The
  Dev door accepting `POST /app/communities/:id/leave` with the app bearer has
  not been verified (no live run), as the builder's report says.
- `reuseExistingServer: false` and `serviceWorkers: 'block'` (config and admin
  context) are correct. The guard is installed before the first navigation on
  both contexts.

## Verdict

**FIX FIRST.** 7f83789c on its own carries HIGH-1 (the bare PDS access JWT is
not redacted). Do not land `coord/fix-ao-clickthrough-h1-prod-host-7f83789c`
by itself. Land it through `coord/fix-ao-clickthrough-review-09000-dc41e56f`,
which fixes HIGH-1, MEDIUM-1 (POST) and LOW-2, once that branch has its own
review. Beyond those, the H1 design (route abort, step failure, no reused
server, preflight) is sound.
