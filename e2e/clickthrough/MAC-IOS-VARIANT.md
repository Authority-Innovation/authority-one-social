# Mac lane - pre-TestFlight iOS simulator clickthrough

**Note only. Not built here.** The Mac lane builds this later. It mirrors the
web harness in this folder (same steps, same hard checks, same Dev-only rule)
on an iOS simulator, before a build goes to TestFlight.

Tool: **Maestro** (preferred; the repo already runs Maestro flows from
`__e2e__/`). XCUITest is the fallback if a step can't be expressed in Maestro.

## Simulator setup

```bash
# Xcode + a current iOS runtime
xcode-select -p
xcrun simctl list runtimes

# A dedicated simulator for the clickthrough
xcrun simctl create "AO Clickthrough" "iPhone 16" \
  "$(xcrun simctl list runtimes | awk '/iOS/ {print $NF}' | tail -1)"
xcrun simctl boot "AO Clickthrough"
open -a Simulator

# Maestro
curl -fsSL "https://get.maestro.mobile.dev" | bash
maestro --version
```

Build the app for the simulator with the **development-communities** profile
(`ios.simulator: true`, runtime `authority-one-agent-runtime-dev`):

```bash
eas build --profile development-communities --platform ios --local
# or, without EAS:
EXPO_PUBLIC_COMMUNITIES_ENABLED=true EXPO_PUBLIC_COMMUNITY_SWITCHER=true \
EXPO_PUBLIC_AGENT_RUNTIME_URL=https://authority-one-agent-runtime-dev.e-479.workers.dev \
  pnpm ios

xcrun simctl install booted path/to/One.app
```

Bundle id: `com.authorityone.app` (brands/authority-one/brand.json).

## Dev-only guard

The flow runner script refuses to start unless the installed build's runtime
URL is the Dev host. Read it from the build's env (e.g. the
`EXPO_PUBLIC_AGENT_RUNTIME_URL` the build was made with, recorded next to the
`.app`) and exit non-zero before `maestro test` if it is not
`https://authority-one-agent-runtime-dev.e-479.workers.dev`.

## Credentials

Same keys as the web harness: `DEVTEST_HANDLE`, `DEVTEST_APP_PASSWORD`, and
optionally `DEVTEST_ADMIN_HANDLE` / `DEVTEST_ADMIN_APP_PASSWORD`, provisioned
on the Mac by Elliott in a gitignored env file (or the shell environment),
passed to Maestro as `-e` variables. No values in this doc, in flows, in
screenshots or in logs. No credential: skip cleanly with "no devtest
credential", exit 0.

```bash
maestro test e2e/clickthrough/ios/clickthrough.yaml \
  -e DEVTEST_HANDLE="$DEVTEST_HANDLE" \
  -e DEVTEST_APP_PASSWORD="$DEVTEST_APP_PASSWORD" \
  --format junit --output e2e/clickthrough/artifacts/$RUN_ID/junit.xml \
  --debug-output e2e/clickthrough/artifacts/$RUN_ID/maestro
```

Turn off Maestro's per-command screenshots on the login steps (or mask them)
so the typed password is never captured.

## Steps (mirror the web harness)

Use the same testIDs; on iOS they are accessibility identifiers, so Maestro
selects them with `id:`.

| nn | step | Maestro |
|---|---|---|
| 00 | signin | `tapOn: {id: signInButton}`, `inputText` into `loginUsernameInput` / `loginPasswordInput`, `tapOn: {id: loginNextButton}` |
| 01 | join | `openLink: one://c/ao-dev-test`; if `communityMemberBadge` visible -> already-member; else Join button, then the join screen (`one://c/ao-dev-test/join`): consent checkbox, `communityJoinAgreeButton`, `communityJoinSuccess`, `communityJoinGoButton` |
| 02 | home | Home tab, `assertVisible: {id: communitySwitcher}` |
| 03 | community-chip | `tapOn: {id: communityChip-ao-dev-test}` |
| 04 | community-home | `communityHeader`, `communityMemberBadge` |
| 05 | agent-card | `communityAgentCard` |
| 06/07 | grant-on / grant-off | tap the switch in `communityAgentGrantRow` twice, asserting its checked state |
| 08 | members-tab | `communityTab-members`, `communityMembersSection` |
| 09/10 | compose / post | `communityComposerEntry`, `composerTextInput`, `composerPublishBtn` |
| 11 | post-in-feed | `communityTab-posts`, `assertVisible` the post text |
| 13 | admin-launch | only with `DEVTEST_ADMIN_*`, else SKIPPED: `communityAgentLaunchButton` -> `communityAgentLaunched` |

`takeScreenshot: e2e/clickthrough/artifacts/<runId>/<nn>-<step>` after each
step.

## Hard checks (each step)

Maestro can't read all on-screen text in one call, so each step runs:

- `assertNotVisible: {text: ".*[{}].*"}` - no literal braces;
- `assertNotVisible: {text: ".*isn.t available yet.*"}`;
- `assertNotVisible: {text: ".*(Something went wrong|TypeError|Render Error).*"}`
  - also no RN red box (`assertNotVisible: {id: "RedBox"}` in dev builds);
- raw handles: `copyTextFrom: {id: communityAgentSponsor}` (and
  `communityPostAuthorName`, `communityRosterName`), then a `runScript` step
  that applies `findRawHandle` from `lib/checks.js` to `maestro.copiedText`;
- console errors: collect the simulator log during the run and fail on any
  JS error line:

  ```bash
  xcrun simctl spawn booted log stream --level error \
    --predicate 'process == "One"' > artifacts/$RUN_ID/device.log &
  ```

- door shapes: run the app through a local recording proxy (e.g. mitmproxy
  with the simulator's proxy set) and apply `checkShape` / `doorShapes` from
  `lib/checks.js` to the captured `/app/communities/*/timeline` and
  `/posts/*/roster` responses after the run.

## Output

Write the same `summary.json` and `REPORT.md` as the web harness
(`lib/report.js` can be reused from a small Node wrapper around
`maestro test`), into `e2e/clickthrough/artifacts/<runId>/`.

## Wiring

Before a build goes to TestFlight: the iOS clickthrough passes on the
simulator, and the TestFlight task's report attaches the artifacts path and
REPORT.md - the same rule as `pnpm e2e:clickthrough` for app fix tasks.
