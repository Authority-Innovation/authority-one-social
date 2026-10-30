const {spawnSync} = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  parseDotEnv,
  loadCredentials,
  describe: describeCreds,
  secretsOf,
  redact,
} = require('../lib/creds')
const {runDir} = require('../lib/report')

const RUN = path.join(__dirname, '..', 'run.js')
const FAKE_HANDLE = 'zz-fake-devtest.example.test'
const FAKE_PASSWORD = 'zzzz-fake-pass-word-0000'

describe('parseDotEnv', () => {
  it('reads keys, quotes, export and comments', () => {
    expect(
      parseDotEnv(
        [
          '# comment',
          'DEVTEST_HANDLE=alice.test',
          'export DEVTEST_APP_PASSWORD="ab cd"',
          "OTHER='x'",
          'TRAILING=v # note',
          'not a line',
        ].join('\n'),
      ),
    ).toEqual({
      DEVTEST_HANDLE: 'alice.test',
      DEVTEST_APP_PASSWORD: 'ab cd',
      OTHER: 'x',
      TRAILING: 'v',
    })
  })
})

describe('loadCredentials', () => {
  it('prefers the env file and falls back to the process env', () => {
    const creds = loadCredentials({
      env: {DEVTEST_HANDLE: 'env-handle', DEVTEST_APP_PASSWORD: 'env-pass'},
      readFile: () => ({DEVTEST_HANDLE: 'file-handle'}),
    })
    expect(creds.devtest).toEqual({
      handle: 'file-handle',
      appPassword: 'env-pass',
      source: 'mixed',
    })
    expect(creds.admin).toBeNull()
  })

  it('is null without both values', () => {
    expect(
      loadCredentials({env: {DEVTEST_HANDLE: 'x'}, readFile: () => ({})})
        .devtest,
    ).toBeNull()
  })

  it('describe() never carries a value', () => {
    const creds = loadCredentials({
      env: {DEVTEST_HANDLE: FAKE_HANDLE, DEVTEST_APP_PASSWORD: FAKE_PASSWORD},
      readFile: () => ({}),
    })
    const shown = JSON.stringify(describeCreds(creds))
    expect(shown).not.toContain(FAKE_HANDLE)
    expect(shown).not.toContain(FAKE_PASSWORD)
    expect(redact(`x ${FAKE_PASSWORD} ${FAKE_HANDLE}`, secretsOf(creds))).toBe(
      'x [REDACTED] [REDACTED]',
    )
  })
})

describe('run.js without a credential', () => {
  const runId = `jest-skip-${process.pid}`
  const missing = path.join(
    os.tmpdir(),
    `no-such-clickthrough-env-${process.pid}`,
  )

  afterAll(() => {
    fs.rmSync(runDir(runId), {recursive: true, force: true})
  })

  it('skips cleanly: exit 0, a clear summary, no secret printed', () => {
    const res = spawnSync(process.execPath, [RUN], {
      env: {
        PATH: process.env.PATH,
        SYSTEMROOT: process.env.SYSTEMROOT,
        CLICKTHROUGH_ENV_FILE: missing,
        CLICKTHROUGH_RUN_ID: runId,
        // Half a credential: the handle alone must not be echoed.
        DEVTEST_HANDLE: FAKE_HANDLE,
      },
      encoding: 'utf8',
    })
    expect(res.status).toBe(0)
    expect(res.stdout).toContain('SKIPPED: no devtest credential')
    expect(res.stdout + res.stderr).not.toContain(FAKE_HANDLE)

    const summary = JSON.parse(
      fs.readFileSync(path.join(runDir(runId), 'summary.json'), 'utf8'),
    )
    expect(summary.result).toBe('SKIPPED: no devtest credential')
    const report = fs.readFileSync(
      path.join(runDir(runId), 'REPORT.md'),
      'utf8',
    )
    expect(report).toContain('SKIPPED: no devtest credential')
    expect(report + JSON.stringify(summary)).not.toContain(FAKE_HANDLE)
  })
})
