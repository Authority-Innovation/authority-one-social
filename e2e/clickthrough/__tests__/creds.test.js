const {spawnSync} = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  parseDotEnv,
  loadCredentials,
  describe: describeCreds,
  secretsOf,
  authSecrets,
  redact,
  userCredFile,
  resolveCredFile,
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

// Every test here points DEVTEST_ENV_FILE at a temp file or a missing temp
// path, or injects readFile/homedir, so the real per-user file is never read.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clickthrough-creds-'))
const missingFile = path.join(tmp, 'no-such-devtest.env')
const fakeFile = path.join(tmp, 'fake-devtest.env')
fs.writeFileSync(
  fakeFile,
  `DEVTEST_HANDLE=${FAKE_HANDLE}\nDEVTEST_APP_PASSWORD=${FAKE_PASSWORD}\n`,
)
afterAll(() => {
  fs.rmSync(tmp, {recursive: true, force: true})
})

describe('credential file location', () => {
  it('the per-user file is <homedir>/.ao/devtest.env via os.homedir()', () => {
    const spy = jest.spyOn(os, 'homedir').mockReturnValue('/fake-home/u')
    try {
      expect(userCredFile()).toBe(path.join('/fake-home/u', '.ao', 'devtest.env'))
      expect(spy).toHaveBeenCalled()
      expect(resolveCredFile({})).toBe(
        path.join('/fake-home/u', '.ao', 'devtest.env'),
      )
    } finally {
      spy.mockRestore()
    }
  })

  it('formats the path for Windows and POSIX', () => {
    expect(
      userCredFile({homedir: 'C:\\Users\\someone', pathImpl: path.win32}),
    ).toBe('C:\\Users\\someone\\.ao\\devtest.env')
    expect(userCredFile({homedir: '/home/someone', pathImpl: path.posix})).toBe(
      '/home/someone/.ao/devtest.env',
    )
  })

  it('DEVTEST_ENV_FILE overrides the per-user file', () => {
    expect(resolveCredFile({DEVTEST_ENV_FILE: fakeFile})).toBe(fakeFile)
  })

  it('never points into the repo', () => {
    const repo = path.join(__dirname, '..', '..', '..')
    const file = resolveCredFile({}, {homedir: path.join(tmp, 'home')})
    expect(path.relative(repo, file).startsWith('..')).toBe(true)
  })
})

describe('loadCredentials', () => {
  it('loads the DEVTEST_ENV_FILE file', () => {
    const creds = loadCredentials({env: {DEVTEST_ENV_FILE: fakeFile}})
    expect(creds.devtest).toEqual({
      handle: FAKE_HANDLE,
      appPassword: FAKE_PASSWORD,
      source: 'file',
    })
  })

  it('reads the per-user file when there is no override', () => {
    const readFile = jest.fn(() => ({}))
    loadCredentials({env: {}, homedir: '/fake-home/u', readFile})
    expect(readFile).toHaveBeenCalledWith(
      path.join('/fake-home/u', '.ao', 'devtest.env'),
    )
  })

  it('falls back to the process env when the file is absent', () => {
    const creds = loadCredentials({
      env: {
        DEVTEST_ENV_FILE: missingFile,
        DEVTEST_HANDLE: 'env-handle',
        DEVTEST_APP_PASSWORD: 'env-pass',
      },
    })
    expect(creds.devtest).toEqual({
      handle: 'env-handle',
      appPassword: 'env-pass',
      source: 'process-env',
    })
  })

  it('is null with no file and no env', () => {
    expect(
      loadCredentials({env: {DEVTEST_ENV_FILE: missingFile}}).devtest,
    ).toBeNull()
  })

  it('prefers the file and falls back to the process env key by key', () => {
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

describe('authSecrets', () => {
  // A made-up JWT-shaped value; not a real token.
  const FAKE_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.c2lnbmF0dXJl'

  it('yields the whole header and the bare token', () => {
    expect(authSecrets(`Bearer ${FAKE_JWT}`)).toEqual([
      `Bearer ${FAKE_JWT}`,
      FAKE_JWT,
    ])
    expect(authSecrets(`bearer	${FAKE_JWT}`)).toContain(FAKE_JWT)
  })

  it('redacts a bare JWT quoted in an error string', () => {
    const secrets = authSecrets(`Bearer ${FAKE_JWT}`)
    const err = `Error: invalid token ${FAKE_JWT} for /app/communities`
    const out = redact(err, secrets)
    expect(out).not.toContain(FAKE_JWT)
    expect(out).toBe('Error: invalid token [REDACTED] for /app/communities')
  })

  it('returns nothing for a missing header', () => {
    expect(authSecrets(undefined)).toEqual([])
  })
})

describe('run.js without a credential', () => {
  const runId = `jest-skip-${process.pid}`
  const runIdInProc = `jest-skip-inproc-${process.pid}`
  const missing = missingFile

  afterAll(() => {
    fs.rmSync(runDir(runId), {recursive: true, force: true})
    fs.rmSync(runDir(runIdInProc), {recursive: true, force: true})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('no file and no env: skips with no network call and no browser', () => {
    const http = require('http')
    const https = require('https')
    const netMod = require('net')
    const cp = require('child_process')
    const realFetch = global.fetch
    global.fetch = jest.fn()
    const spies = [
      jest.spyOn(http, 'request'),
      jest.spyOn(https, 'request'),
      jest.spyOn(netMod, 'connect'),
      jest.spyOn(cp, 'spawnSync'),
      jest.spyOn(cp, 'spawn'),
    ]
    const log = jest.spyOn(console, 'log').mockImplementation(() => {})
    try {
      jest.isolateModules(() => {
        const {main} = require('../run')
        expect(
          main({DEVTEST_ENV_FILE: missing, CLICKTHROUGH_RUN_ID: runIdInProc}),
        ).toBe(0)
      })
      expect(global.fetch).not.toHaveBeenCalled()
    } finally {
      global.fetch = realFetch
    }
    for (const s of spies) expect(s).not.toHaveBeenCalled()
    const out = log.mock.calls.flat().join('\n')
    expect(out).toContain('devtest credential: absent')
    expect(out).toContain('SKIPPED: no devtest credential')
    const summary = JSON.parse(
      fs.readFileSync(path.join(runDir(runIdInProc), 'summary.json'), 'utf8'),
    )
    expect(summary.result).toBe('SKIPPED: no devtest credential')
  })

  it('a loaded credential is never printed', () => {
    const cp = require('child_process')
    const spawn = jest.spyOn(cp, 'spawnSync').mockReturnValue({status: 0})
    const log = jest.spyOn(console, 'log').mockImplementation(() => {})
    const err = jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.isolateModules(() => {
      const {main} = require('../run')
      expect(
        main({DEVTEST_ENV_FILE: fakeFile, CLICKTHROUGH_RUN_ID: runIdInProc}),
      ).toBe(0)
    })
    expect(spawn).toHaveBeenCalledTimes(1)
    const out = [...log.mock.calls, ...err.mock.calls].flat().join('\n')
    expect(out).toContain('devtest credential: present (file)')
    expect(out).not.toContain(FAKE_HANDLE)
    expect(out).not.toContain(FAKE_PASSWORD)
  })

  it('skips cleanly: exit 0, a clear summary, no secret printed', () => {
    const res = spawnSync(process.execPath, [RUN], {
      env: {
        PATH: process.env.PATH,
        SYSTEMROOT: process.env.SYSTEMROOT,
        DEVTEST_ENV_FILE: missing,
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
