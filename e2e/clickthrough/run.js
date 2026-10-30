#!/usr/bin/env node
/**
 * `pnpm e2e:clickthrough` - the one entry point.
 *
 * 1. Dev guard (no network): refuses a non-Dev runtime or a non-local base URL.
 * 2. Credentials: .env.local, else the process env. None -> a clean SKIP,
 *    exit 0, with artifacts saying "no devtest credential".
 * 3. Runs the Playwright flow with the development-communities profile env.
 */
const {spawnSync} = require('child_process')
const fs = require('fs')
const path = require('path')

const {checkTargets, targetsFromEnv} = require('./lib/guard')
const {loadCredentials, describe} = require('./lib/creds')
const {newRunId, runDir, writeArtifacts} = require('./lib/report')

const ROOT = path.join(__dirname, '..', '..')
const PROFILE = 'development-communities'

function profileEnv() {
  const eas = JSON.parse(fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8'))
  return (eas.build && eas.build[PROFILE] && eas.build[PROFILE].env) || {}
}

function main(env = process.env) {
  const profile = profileEnv()
  const targets = targetsFromEnv({
    ...env,
    EXPO_PUBLIC_AGENT_RUNTIME_URL:
      env.EXPO_PUBLIC_AGENT_RUNTIME_URL ||
      profile.EXPO_PUBLIC_AGENT_RUNTIME_URL,
  })
  const guard = checkTargets(targets)
  if (!guard.ok) {
    console.error(`[clickthrough] REFUSED: ${guard.reason}`)
    return 2
  }

  const runId = env.CLICKTHROUGH_RUN_ID || newRunId()
  // CLICKTHROUGH_ENV_FILE exists for the harness's own tests.
  const creds = loadCredentials({env, envFile: env.CLICKTHROUGH_ENV_FILE})
  const seen = describe(creds)
  console.log(`[clickthrough] run ${runId}`)
  console.log(
    `[clickthrough] base ${guard.baseURL}, runtime ${guard.runtimeURL}`,
  )
  console.log(
    `[clickthrough] devtest credential: ${seen.devtest}; admin: ${seen.admin}`,
  )

  if (!creds.devtest) {
    const dir = writeArtifacts({
      runId,
      result: 'SKIPPED: no devtest credential',
      steps: [],
      consoleErrors: [],
      notes: [
        'No DEVTEST_HANDLE / DEVTEST_APP_PASSWORD in e2e/clickthrough/.env.local or the process environment.',
        'Nothing was opened and no network call was made.',
      ],
    })
    console.log('[clickthrough] SKIPPED: no devtest credential')
    console.log(
      `[clickthrough] report: ${path.relative(ROOT, path.join(dir, 'REPORT.md'))}`,
    )
    return 0
  }

  const childEnv = {
    ...env,
    ...profile,
    EXPO_PUBLIC_AGENT_RUNTIME_URL: guard.runtimeURL,
    CLICKTHROUGH_BASE_URL: guard.baseURL,
    CLICKTHROUGH_RUNTIME_URL: guard.runtimeURL,
    CLICKTHROUGH_RUN_ID: runId,
    CI: '1',
  }
  const res = spawnSync(
    process.execPath,
    [
      path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js'),
      'test',
      '-c',
      path.join(__dirname, 'playwright.config.ts'),
    ],
    {cwd: ROOT, env: childEnv, stdio: 'inherit'},
  )
  const report = path.join(runDir(runId), 'REPORT.md')
  console.log(
    `[clickthrough] report: ${fs.existsSync(report) ? path.relative(ROOT, report) : '(not written)'}`,
  )
  return res.status === null ? 1 : res.status
}

if (require.main === module) {
  process.exitCode = main()
}

module.exports = {main}
