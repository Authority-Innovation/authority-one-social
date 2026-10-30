/**
 * The runtime guard in a real browser, against a local fixture server that
 * stands in for "a server already on the port". Nothing leaves the machine:
 * the prod request is aborted by the guard, and the Dev request is fulfilled
 * locally through the guard's allow hook.
 *
 * Run with `pnpm e2e:clickthrough:guard`. Not part of `pnpm test` (Jest): it
 * needs a browser (CLICKTHROUGH_BROWSER_CHANNEL, default msedge).
 */
import http from 'node:http'
import {type AddressInfo} from 'node:net'

import {expect, type Page, test} from '@playwright/test'

import {DEV_RUNTIME_URL} from '../lib/guard'
import * as runtimeGuardLib from '../lib/runtimeGuard'

const PROD_RUNTIME_URL = `https://${runtimeGuardLib.PROD_RUNTIME_HOST}`

/** A server that serves a page and a bundle calling `runtimeExpr`. */
async function fixtureServer(runtimeExpr: string) {
  const bundle = `
    var RUNTIME = ${runtimeExpr};
    window.__result = 'pending';
    fetch(RUNTIME + '/app/communities').then(
      function (r) { window.__result = 'ok ' + r.status },
      function (e) { window.__result = 'error ' + e.name },
    );
  `
  const server = http.createServer((req, res) => {
    if (req.url === '/index.bundle') {
      res.writeHead(200, {'content-type': 'application/javascript'})
      res.end(bundle)
      return
    }
    res.writeHead(200, {'content-type': 'text/html'})
    res.end(
      '<!doctype html><html><body><script src="/index.bundle"></script></body></html>',
    )
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  const {port} = server.address() as AddressInfo
  return {
    baseURL: `http://localhost:${port}`,
    close: () => new Promise<void>(r => server.close(() => r())),
  }
}

/**
 * The step contract from clickthrough.pw.ts: the action, then anything the
 * guard blocked fails the step and stops the flow.
 */
async function runStep(
  guard: ReturnType<typeof runtimeGuardLib.createRuntimeGuard>,
  action: () => Promise<void>,
) {
  let status: 'pass' | 'fail' = 'pass'
  const reasons: string[] = []
  try {
    await action()
  } catch (e) {
    status = 'fail'
    reasons.push(String((e as Error).message))
  }
  const blocked = runtimeGuardLib.blockedFailures(guard.take())
  if (blocked.length) status = 'fail'
  return {status, reasons: [...reasons, ...blocked], stops: status === 'fail'}
}

type FixtureWindow = {__result: string}

async function loadAndSettle(page: Page, baseURL: string) {
  await page.goto(baseURL)
  await page.waitForFunction(
    () => (window as unknown as FixtureWindow).__result !== 'pending',
  )
  return page.evaluate(() => (window as unknown as FixtureWindow).__result)
}

test('reused server pointing at prod: preflight refuses, request aborted, step fails', async ({
  page,
}) => {
  const server = await fixtureServer(
    `undefined ?? ${JSON.stringify(PROD_RUNTIME_URL)}`,
  )
  try {
    const guard = runtimeGuardLib.createRuntimeGuard()
    const reached: string[] = []
    await guard.install(page.context(), {
      // Only Dev requests reach this hook; fulfil locally so nothing leaves.
      allow: async route => {
        reached.push(route.request().url())
        await route.fulfill({json: {}})
      },
    })
    const failed: string[] = []
    page.on('requestfailed', r => {
      if (r.url().startsWith(PROD_RUNTIME_URL)) {
        failed.push(r.failure()?.errorText || '')
      }
    })

    const preflight = await runtimeGuardLib.checkServedBundle(
      page.request,
      server.baseURL,
    )
    expect(preflight.ok).toBe(false)

    let pageResult = ''
    const step = await runStep(guard, async () => {
      pageResult = await loadAndSettle(page, server.baseURL)
    })
    expect(pageResult).toMatch(/^error /)
    expect(failed).toEqual([expect.stringContaining('ERR_BLOCKED_BY_CLIENT')])
    expect(reached).toEqual([])
    expect(step.status).toBe('fail')
    expect(step.stops).toBe(true)
    expect(step.reasons.join('\n')).toContain(
      `BLOCKED request: non-Dev agent-runtime request to https://${runtimeGuardLib.PROD_RUNTIME_HOST}`,
    )
  } finally {
    await server.close()
  }
})

test('server serving the Dev build: preflight passes, request allowed, step passes', async ({
  page,
}) => {
  const server = await fixtureServer(
    `${JSON.stringify(DEV_RUNTIME_URL)} ?? ${JSON.stringify(PROD_RUNTIME_URL)}`,
  )
  try {
    const guard = runtimeGuardLib.createRuntimeGuard()
    const reached: string[] = []
    await guard.install(page.context(), {
      allow: async route => {
        reached.push(new URL(route.request().url()).origin)
        await route.fulfill({json: {}})
      },
    })

    const preflight = await runtimeGuardLib.checkServedBundle(
      page.request,
      server.baseURL,
    )
    expect(preflight).toEqual({ok: true})

    let pageResult = ''
    const step = await runStep(guard, async () => {
      pageResult = await loadAndSettle(page, server.baseURL)
    })
    expect(pageResult).toBe('ok 200')
    expect(reached).toEqual([DEV_RUNTIME_URL])
    expect(step).toEqual({status: 'pass', reasons: [], stops: false})
    expect(guard.all()).toEqual([])
  } finally {
    await server.close()
  }
})

test('page.request to a non-Dev runtime: guardedPost refuses before sending, step fails', async ({
  page,
}) => {
  const guard = runtimeGuardLib.createRuntimeGuard()
  await guard.install(page.context())
  // Count anything that reaches the APIRequestContext; guardedPost must stop
  // the call before it does.
  let sent = 0
  const request = {
    post: (url: string, opts?: Parameters<typeof page.request.post>[1]) => {
      sent++
      return page.request.post(url, opts)
    },
  }
  const step = await runStep(guard, async () => {
    await guard.guardedPost(
      request,
      `${PROD_RUNTIME_URL}/app/communities/ao-dev-test/leave`,
      {headers: {Authorization: 'Bearer not-a-real-token'}},
    )
  })
  expect(sent).toBe(0)
  expect(step.status).toBe('fail')
  expect(step.stops).toBe(true)
  expect(step.reasons.join('\n')).toContain(
    `BLOCKED api request: non-Dev agent-runtime request to https://${runtimeGuardLib.PROD_RUNTIME_HOST}`,
  )
})
