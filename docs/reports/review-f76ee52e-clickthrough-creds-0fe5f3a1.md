# Review f76ee52e - clickthrough credential path change (0fe5f3a1)

Review only. Nothing was committed to, pushed to, or merged into the reviewed
branch. No real credential file was read or named.

## What was reviewed

- The spec gives two branch names. `coord/fix-ao-clickthrough-review-09000-dc41e56f`
  (tip `0ba508c59`) does **not** contain the change.
  `coord/ao-clickthrough-creds-from-userp-0fe5f3a1` (tip `867dec1b4`) does. I
  reviewed `0ba508c59..867dec1b4`: commits `8802aa7e5` (code and tests) and
  `867dec1b4` (README and report).
- Files: `e2e/clickthrough/lib/creds.js`, `run.js`, `clickthrough.pw.ts`,
  `__tests__/creds.test.js`, `README.md`,
  `docs/reports/task-0fe5f3a1-ao-clickthrough-creds-userprofile.md`.

## Verdict: CLEAN

There are no BLOCKER or HIGH findings. Every item on the checklist holds:

| Check | Result | Evidence |
| --- | --- | --- |
| Per-user file `%USERPROFILE%\.ao\devtest.env` / `~/.ao/devtest.env` | OK | `creds.js:26-28` uses `path.join(os.homedir(), '.ao', 'devtest.env')` |
| `DEVTEST_ENV_FILE` override, with no fall-through to the per-user file | OK | `creds.js:34-41` |
| Process env as a key-by-key fallback | OK | `creds.js:89-99` |
| Missing credential: clean skip, "no devtest credential", exit 0 | OK | `run.js:52-68`; checked live (see below) |
| No repo path reads `.env.local` | OK | `ENV_FILE` and `CLICKTHROUGH_ENV_FILE` were removed. No reference remains in `e2e/` apart from the defensive `.gitignore:107` entry |
| No value logged or written | OK | `run.js` prints only `describe()` (presence and source). `creds.js` never writes. Artifacts are still scrubbed through `secretsOf`/`redact` |
| Tests use fake temp values only | OK | `creds.test.js:46-55` uses an mkdtemp file with `zz-fake` values. Every `loadCredentials`/`main` call either sets `DEVTEST_ENV_FILE` to a temp path or injects `readFile`. `os.homedir` is spied, and no test reads the real file |
| Refuse-non-Dev guard unchanged | OK | `lib/guard.js` and `playwright.config.ts` are unchanged in the range. The `run.js:28-39` guard block is unchanged |
| Join-first step unchanged | OK | `clickthrough.pw.ts` changes only at lines 24-26 (the `loadCredentials()` call). The leave-then-join logic and `CLICKTHROUGH_KEEP_MEMBERSHIP` are untouched |

## Findings

### BLOCKER
None.

### HIGH
None.

### MEDIUM
None.

### LOW

- **L1 - a relative `DEVTEST_ENV_FILE` can resolve differently in the parent and the child** - `e2e/clickthrough/lib/creds.js:37`, `run.js:70-87`.
  `path.resolve(override)` depends on the cwd. `run.js` resolves it against the
  caller's cwd, but the Playwright child runs with `cwd: ROOT` and calls
  `loadCredentials()` again (`clickthrough.pw.ts:24`). If someone runs
  `node e2e/clickthrough/run.js` from a subdirectory with a relative override,
  `run.js` can find the credential while the child does not, so the run skips
  inside Playwright instead of at the front door. `pnpm e2e:clickthrough`
  always runs from the root, so the normal path is not affected.
  **Fix:** in `run.js`, set `childEnv.DEVTEST_ENV_FILE = resolveCredFile(env)`
  when the override is set, or have `resolveCredFile` refuse a non-absolute
  override (the README already says it must be absolute).
- **L2 - an override pointing at a missing or unreadable file fails silently** - `e2e/clickthrough/lib/creds.js:74-80`.
  `readEnvFile` swallows every error, so a mistyped `DEVTEST_ENV_FILE`
  produces the same "absent" as having no credential. That is safe, but slow
  to diagnose.
  **Fix:** have `loadCredentials` return a `fileFound` flag and have
  `describe()` print "override file not found". Print presence only, never the
  path's contents.
- **L3 - the "never points into the repo" test is close to tautological** - `e2e/clickthrough/__tests__/creds.test.js:84-88`.
  It only checks a homedir that the test builds under `os.tmpdir()`.
  **Fix:** also assert that `resolveCredFile({})` with the real `os.homedir()`
  is outside the repo. This computes the path and reads nothing.
- **L4 (info) - `source: 'file'` does not say which file** - `creds.js:92`.
  The label does not distinguish the override from the per-user file. This is
  harmless. Optionally use `'override-file'` / `'user-file'`.

Leave `.gitignore:107` (`/e2e/clickthrough/.env.local`) in place. It is now
unused, but it stops anyone from committing a stale local file.

## What I ran

- `git log`, `git diff 0ba508c59..867dec1b4` (stat and full diff for the code
  files), `git diff --quiet` on `lib/guard.js` and `playwright.config.ts`
  (unchanged), `git ls-files e2e/clickthrough`, and `git check-ignore` on the
  artifacts dir.
- I read `creds.js`, `run.js`, the relevant part of `clickthrough.pw.ts`, and
  the full `creds.test.js`.
- **I did not run Jest (`pnpm test`).** The worktree has no `node_modules` and
  `pnpm` is not on PATH. I did not run an install because it would reach the
  package registry.
- Instead I ran a standalone node script from a temp dir outside the repo. It
  used fake values only and pointed `DEVTEST_ENV_FILE` at a temp file or a
  missing temp path. It checked the following, and every assertion passed:
  - Windows and POSIX path formatting
  - that the override wins, and that a blank override falls back to the
    per-user path
  - that the file loads with `source: 'file'`
  - that a missing file with no env gives `null`
  - that a missing file with env gives `process-env`
  - that a relative override resolves against the cwd (which is what L1 is
    about)
  - that `node e2e/clickthrough/run.js` with a missing override and only a
    fake handle exits 0, prints `devtest credential: absent` and
    `SKIPPED: no devtest credential`, and never echoes the fake handle
- The skip run wrote `e2e/clickthrough/artifacts/f76-review-skip/`, which is
  gitignored, and I removed it. The temp script dir `%TEMP%\f76-check` (fake
  values only) could not be deleted: the deny-list blocks recursive deletes
  outside the worktree.
- Two deny-list blocks happened during the review, and I did not work around
  either. One was a grep that included the word for a well-known env-file
  loader library. The other was the temp-dir delete above. Because of the
  first, I did not grep `e2e/` for that loader package. The files I did read
  use their own `parseDotEnv` and no third-party loader.
