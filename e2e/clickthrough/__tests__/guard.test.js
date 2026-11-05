const {spawnSync} = require('child_process')
const path = require('path')

const {checkTargets, DEV_RUNTIME_URL} = require('../lib/guard')

const RUN = path.join(__dirname, '..', 'run.js')

describe('checkTargets', () => {
  it('allows the local web build against the Dev runtime', () => {
    expect(
      checkTargets({
        baseURL: 'http://localhost:19006',
        runtimeURL: DEV_RUNTIME_URL,
      }),
    ).toEqual({
      ok: true,
      baseURL: 'http://localhost:19006',
      runtimeURL: DEV_RUNTIME_URL,
    })
  })

  it.each([
    ['https://one.authority-one.com', DEV_RUNTIME_URL],
    ['https://localhost.evil.example', DEV_RUNTIME_URL],
    ['not a url', DEV_RUNTIME_URL],
  ])('refuses base URL %s', (baseURL, runtimeURL) => {
    const res = checkTargets({baseURL, runtimeURL})
    expect(res.ok).toBe(false)
  })

  it.each([
    'https://authority-one-agent-runtime.e-479.workers.dev',
    'http://authority-one-agent-runtime-dev.e-479.workers.dev',
    'https://authority-one-agent-runtime-dev.e-479.workers.dev.evil.example',
    '',
  ])('refuses runtime %s', runtimeURL => {
    const res = checkTargets({baseURL: 'http://localhost:19006', runtimeURL})
    expect(res.ok).toBe(false)
  })
})

describe('run.js refuse-on-prod', () => {
  const net = {
    fetch: global.fetch,
  }

  afterEach(() => {
    global.fetch = net.fetch
    jest.restoreAllMocks()
  })

  it('a non-Dev base URL exits non-zero without a network call or a browser', () => {
    const http = require('http')
    const https = require('https')
    const netMod = require('net')
    const cp = require('child_process')
    global.fetch = jest.fn()
    const spies = [
      jest.spyOn(http, 'request'),
      jest.spyOn(https, 'request'),
      jest.spyOn(netMod, 'connect'),
      jest.spyOn(cp, 'spawnSync'),
      jest.spyOn(cp, 'spawn'),
    ]
    jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.isolateModules(() => {
      const {main} = require('../run')
      expect(
        main({CLICKTHROUGH_BASE_URL: 'https://one.authority-one.com'}),
      ).toBe(2)
    })
    expect(global.fetch).not.toHaveBeenCalled()
    for (const s of spies) expect(s).not.toHaveBeenCalled()
  })

  it('a prod runtime exits non-zero', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const {main} = require('../run')
    expect(
      main({
        EXPO_PUBLIC_AGENT_RUNTIME_URL:
          'https://authority-one-agent-runtime.e-479.workers.dev',
      }),
    ).toBe(2)
  })

  it('the script itself exits non-zero on a prod base URL', () => {
    const res = spawnSync(process.execPath, [RUN], {
      env: {
        PATH: process.env.PATH,
        SYSTEMROOT: process.env.SYSTEMROOT,
        CLICKTHROUGH_BASE_URL: 'https://one.authority-one.com',
      },
      encoding: 'utf8',
    })
    expect(res.status).toBe(2)
    expect(res.stderr).toContain('REFUSED')
  })
})
