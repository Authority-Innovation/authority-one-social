# AO-CLICKTHROUGH run - communities/integration 1cc4c02e (build 41 code included)

- **Harness head:** `1cc4c02e1` (communities/integration), checked out unedited
- **App under test:** same commit
- **Command:** `node e2e/clickthrough/run.js` (= `pnpm e2e:clickthrough`; pnpm is not on PATH on this PC)
- **Exit code:** 0
- **Credential status:** `no devtest credential` (harness reported `devtest credential: absent; admin: absent`)
- **Run id:** `2026-10-30T12-09-43-472Z`
- **Artifacts:** `e2e/clickthrough/artifacts/2026-10-30T12-09-43-472Z/` (REPORT.md, summary.json; no screenshots - no browser was opened)
- **Artifact branch:** `coord/clickthrough-run-1cc4c02e`

## Checks

| check | result |
|---|---|
| sign-in | SKIP (no devtest credential) |
| join ao-dev-test (or already-member) | SKIP (no devtest credential) |
| community chip | SKIP (no devtest credential) |
| ao-dev-test home | SKIP (no devtest credential) |
| agent card (no literal braces; sponsor display name not raw handle) | SKIP (no devtest credential) |
| grant switch on and off | SKIP (no devtest credential) |
| Members tab | SKIP (no devtest credential) |
| compose | SKIP (no devtest credential) |
| post | SKIP (no devtest credential) |
| see the post | SKIP (no devtest credential) |
| admin launch | SKIP (no admin credentials) |
| console errors | SKIP (no browser opened) |
| no crash | SKIP (no browser opened) |
| no "isn't available yet" | SKIP (no browser opened) |
| shapes match the door | SKIP (no door responses seen) |

## Detail

The Dev guard passed (base `http://localhost:19006`, runtime
`https://authority-one-agent-runtime-dev.e-479.workers.dev`). The harness then
found no devtest credential in `DEVTEST_ENV_FILE`, the per-user file or the
process environment, wrote its artifacts and exited 0 with
`SKIPPED: no devtest credential`. Per the harness, nothing was opened and no
network call was made. This is a clean skip, not a pass.

## Could not run

- The whole UI flow (steps 00-15): no devtest credential on this PC. The
  credential file was not read, named, copied or tested by the builder - only
  the harness looked.
- Dependencies were not installed (`node_modules` absent in this worktree):
  the harness's skip path uses only Node built-ins, so the install was not
  needed. A run with a credential will need `npm`/`pnpm install` plus
  `npx playwright install chromium` (or `CLICKTHROUGH_BROWSER_CHANNEL=msedge`).
- The run id carries the harness clock's UTC date (2026-10-30T12:09Z).
