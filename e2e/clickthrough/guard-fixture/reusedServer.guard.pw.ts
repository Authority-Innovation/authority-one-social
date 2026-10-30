/**
 * Independent review test (task 0900077a): a server already on the port, the
 * real clickthrough config, and the runtime guard across more than one
 * browser context.
 *
 * Nothing leaves the machine. A catch-all route is installed on each context
 * BEFORE the guard, so the guard's handler runs first; anything the guard lets
 * through (`route.fallback()`, its real default) lands in the catch-all and
 * is fulfilled locally. A non-Dev request that reached the catch-all would be
 * a guard leak and fails the test.
 *
 * Run with `pnpm e2e:clickthrough:guard` (matches /guard\.pw\.ts$/).
 */
import {spawn} from 'node:child_process'
import http from 'node:http'
import {type AddressInfo} from 'node:net'
import path from 'node:path'

import {
  type BrowserContext,
  expect,
  type Page,
  test,
} from '@playwright/test'

import {DEV_RUNTIME_HOST, DEV_RUNTIME_URL} from '../lib/guard'
import * as runtimeGuardLib from '../lib/runtimeGuard'

const ROOT = path.join(__dirname, '..', '..', '..')
const PROD = `https://${runtimeGuardLib.PROD_RUNTIME_HOST}`

/**
 * Serves `/` and `/index.bundle`, like an Expo web server on the port. Bound
 * on both loopbacks: Playwright probes `localhost`, which on Windows can
 * resolve to ::1, and an IPv4-only server there is not seen as "on the port".
 */
async function portServer(bundle: string) {
  const handler: http.RequestListener = (req, res) => {
    if (req.url === '/index.bundle') {
      res.writeHead(200, {'content-type': 'application/javascript'})
      res.end(bundle)
      return
    }
    res.writeHead(200, {'content-type': 'text/html'})
    res.end(
      '<!doctype html><html><body><script src="/index.bundle"></script></body></html>',
    )
  }
  const v4 = http.createServer(handler)
  await new Promise<void>(r => v4.listen(0, '127.0.0.1', r))
  const {port} = v4.address() as AddressInfo
  const v6 = http.createServer(handler)
  await new Promise<void>(r => v6.listen(port, '::1', r))
  const close = (s: http.Server) => new Promise<void>(r => s.close(() => r()))
  return {
    port,
    baseURL: `http://localhost:${port}`,
    close: () => Promise.all([close(v4), close(v6)]).then(() => {}),
  }
}

/**
 * A bundle that fires each URL and records how each one ended. The URLs are
 * base64 so their hosts are not plain text in the bundle: the preflight is a
 * substring check, and a literal `http://<dev host>` would satisfy it.
 */
function bundleCalling(fetches: string[], sockets: string[] = []) {
  const enc = (v: string[]) => Buffer.from(JSON.stringify(v)).toString('base64')
  return `
    window.__out = {};
    var total = ${fetches.length + sockets.length};
    var n = 0;
    function done(k, v) { window.__out[k] = v; n++; if (n === total) window.__done = true; }
    JSON.parse(atob('${enc(fetches)}')).forEach(function (u) {
      fetch(u).then(function (r) { done(u, 'ok ' + r.status) },
                    function (e) { done(u, 'error ' + e.name) });
    });
    JSON.parse(atob('${enc(sockets)}')).forEach(function (u) {
      var ws = new WebSocket(u);
      ws.onopen = function () { done(u, 'open') };
      ws.onclose = function (e) { if (!(u in window.__out)) done(u, 'close ' + e.code) };
    });
  `
}

type Leak = {url: string}
type FixtureWindow = {__done?: boolean; __out: Record<string, string>}

/** The safety net, then the guard on top of it (last route wins). */
async function guarded(
  context: BrowserContext,
  guard: ReturnType<typeof runtimeGuardLib.createRuntimeGuard>,
  leaks: Leak[],
) {
  await context.route(
    url => !['localhost', '127.0.0.1'].includes(url.hostname),
    async route => {
      leaks.push({url: route.request().url()})
      await route.fulfill({json: {}})
    },
  )
  await context.routeWebSocket(
    url => !['localhost', '127.0.0.1'].includes(url.hostname),
    ws => {
      leaks.push({url: ws.url()})
      void ws.close({code: 4000, reason: 'safety net'})
    },
  )
  await guard.install(context)
}

/** The step contract from clickthrough.pw.ts step(). */
function stepOutcome(
  guard: ReturnType<typeof runtimeGuardLib.createRuntimeGuard>,
) {
  const blocked = runtimeGuardLib.blockedFailures(guard.take())
  return {status: blocked.length ? 'fail' : 'pass', blocked}
}

async function load(page: Page, baseURL: string) {
  await page.goto(baseURL)
  await page.waitForFunction(() => (window as unknown as FixtureWindow).__done === true)
  return page.evaluate(() => (window as unknown as FixtureWindow).__out)
}

test('real config refuses a server already on the port (reuseExistingServer:false)', async () => {
  const server = await portServer(bundleCalling([`${PROD}/app/communities`]))
  try {
    // Async: the fixture server lives in this process and must keep
    // answering while the child Playwright probes it.
    const res = await new Promise<{status: number | null; out: string}>(
      resolve => {
        const child = spawn(
          process.execPath,
          [
            'node_modules/@playwright/test/cli.js',
            'test',
            '-c',
            'e2e/clickthrough/playwright.config.ts',
          ],
          {
            cwd: ROOT,
            env: {
              ...process.env,
              CLICKTHROUGH_BASE_URL: server.baseURL,
              CLICKTHROUGH_NO_SERVER: '',
              // No credential reaches the spec even if it got that far.
              CLICKTHROUGH_ENV_FILE: path.join(__dirname, 'does-not-exist.env'),
              DEVTEST_HANDLE: '',
              DEVTEST_APP_PASSWORD: '',
              DEVTEST_ADMIN_HANDLE: '',
              DEVTEST_ADMIN_APP_PASSWORD: '',
            },
          },
        )
        let out = ''
        child.stdout.on('data', d => (out += d))
        child.stderr.on('data', d => (out += d))
        const timer = setTimeout(() => child.kill(), 50_000)
        child.on('close', status => {
          clearTimeout(timer)
          resolve({status, out})
        })
      },
    )
    expect(res.status).not.toBe(0)
    expect(res.out).toContain(`${server.baseURL} is already used`)
  } finally {
    await server.close()
  }
})

test('non-Dev reused server: every context aborts every non-Dev runtime call and the step fails', async ({
  browser,
}) => {
  const fetches = [
    `${PROD}/app/communities`,
    'https://AUTHORITY-ONE-AGENT-RUNTIME.E-479.workers.dev/app/agents',
    'https://authority-one-agent-runtime-staging.e-479.workers.dev/app/chat',
    `http://${DEV_RUNTIME_HOST}/app/communities`,
  ]
  const sockets = [`wss://${runtimeGuardLib.PROD_RUNTIME_HOST}/app/live`]
  const server = await portServer(bundleCalling(fetches, sockets))
  const guard = runtimeGuardLib.createRuntimeGuard()
  const leaks: Leak[] = []
  // Two contexts, as the clickthrough has (devtest page and admin).
  const main = await browser.newContext({serviceWorkers: 'block'})
  const admin = await browser.newContext({serviceWorkers: 'block'})
  try {
    await guarded(main, guard, leaks)
    await guarded(admin, guard, leaks)

    const pre = await runtimeGuardLib.checkServedBundle(
      main.request,
      server.baseURL,
    )
    expect(pre.ok).toBe(false)

    for (const ctx of [main, admin]) {
      const page = await ctx.newPage()
      const out = await load(page, server.baseURL)
      for (const u of fetches) expect(out[u]).toMatch(/^error /)
      for (const u of sockets) expect(out[u]).toMatch(/^close 1008$/)
      // A second page in the same context is covered too.
      const popup = await ctx.newPage()
      const out2 = await load(popup, server.baseURL)
      for (const u of fetches) expect(out2[u]).toMatch(/^error /)
      const step = stepOutcome(guard)
      expect(step.status).toBe('fail')
      // 2 pages x (4 fetches + 1 socket).
      expect(step.blocked).toHaveLength(10)
      expect(step.blocked.filter(b => b.startsWith('BLOCKED websocket'))).toHaveLength(2)
    }
    expect(leaks).toEqual([])
  } finally {
    await main.close()
    await admin.close()
    await server.close()
  }
})

test('Dev reused server: preflight passes, Dev call passes the guard, step passes', async ({
  browser,
}) => {
  const server = await portServer(
    // Like a real Dev build: the prod fallback is in the bundle too.
    // A Dev build inlines EXPO_PUBLIC_AGENT_RUNTIME_URL; the prod fallback
    // is in the bundle too.
    `var RUNTIME = ${JSON.stringify(DEV_RUNTIME_URL)};\n` +
      `var FALLBACK = ${JSON.stringify(PROD)};\n` +
      bundleCalling([`${DEV_RUNTIME_URL}/app/communities`]),
  )
  const guard = runtimeGuardLib.createRuntimeGuard()
  const leaks: Leak[] = []
  const ctx = await browser.newContext({serviceWorkers: 'block'})
  try {
    await guarded(ctx, guard, leaks)
    const pre = await runtimeGuardLib.checkServedBundle(
      ctx.request,
      server.baseURL,
    )
    expect(pre).toEqual({ok: true})
    const out = await load(await ctx.newPage(), server.baseURL)
    expect(out[`${DEV_RUNTIME_URL}/app/communities`]).toBe('ok 200')
    expect(stepOutcome(guard)).toEqual({status: 'pass', blocked: []})
    // It fell through the guard (route.fallback) to the local safety net.
    expect(leaks.map(l => new URL(l.url).origin)).toEqual([DEV_RUNTIME_URL])
  } finally {
    await ctx.close()
    await server.close()
  }
})
