const fs = require('fs')
const path = require('path')

const {DEV_RUNTIME_HOST, DEV_RUNTIME_URL} = require('../lib/guard')
const {
  PROD_RUNTIME_HOST,
  classifyRequest,
  createRuntimeGuard,
  blockedFailures,
  bundleScriptUrls,
  checkBundle,
  checkServedBundle,
} = require('../lib/runtimeGuard')

const PROD_URL = `https://${PROD_RUNTIME_HOST}`

describe('classifyRequest', () => {
  it.each([
    `${DEV_RUNTIME_URL}/app/communities`,
    `wss://${DEV_RUNTIME_HOST}/app/chat`,
    'http://localhost:19006/index.bundle?platform=web',
    'https://pds.authority-one.com/xrpc/com.atproto.server.createSession',
  ])('allows %s', url => {
    expect(classifyRequest(url)).toEqual({action: 'allow'})
  })

  it.each([
    `${PROD_URL}/app/communities`,
    `http://${DEV_RUNTIME_HOST}/app/communities`,
    `ws://${DEV_RUNTIME_HOST}/app/chat`,
    `https://${DEV_RUNTIME_HOST}.evil.example/app/communities`,
    'https://authority-one-agent-runtime-staging.e-479.workers.dev/app',
  ])('aborts %s', url => {
    const d = classifyRequest(url)
    expect(d.action).toBe('abort')
    expect(d.reason).toContain('non-Dev agent-runtime request')
  })
})

/** A fake BrowserContext that keeps the handlers install() registers. */
function fakeContext() {
  const ctx = {routes: [], sockets: []}
  ctx.route = async (match, handler) => ctx.routes.push({match, handler})
  ctx.routeWebSocket = async (match, handler) =>
    ctx.sockets.push({match, handler})
  return ctx
}

function fakeRoute(url) {
  return {
    request: () => ({url: () => url}),
    abort: jest.fn(async () => {}),
    fallback: jest.fn(async () => {}),
    fulfill: jest.fn(async () => {}),
  }
}

describe('createRuntimeGuard', () => {
  it('routes only agent-runtime hosts', async () => {
    const ctx = fakeContext()
    await createRuntimeGuard().install(ctx)
    const [{match}] = ctx.routes
    expect(match(new URL(`${PROD_URL}/x`))).toBe(true)
    expect(match(new URL(`${DEV_RUNTIME_URL}/x`))).toBe(true)
    expect(match(new URL('http://localhost:19006/'))).toBe(false)
  })

  it('aborts a prod runtime request and fails the step', async () => {
    const ctx = fakeContext()
    const guard = createRuntimeGuard()
    await guard.install(ctx)
    const route = fakeRoute(`${PROD_URL}/app/communities?token=abc`)
    await ctx.routes[0].handler(route)
    expect(route.abort).toHaveBeenCalledWith('blockedbyclient')
    expect(route.fallback).not.toHaveBeenCalled()
    const blocked = guard.take()
    expect(blocked).toHaveLength(1)
    // The query string is dropped from what is recorded.
    expect(blocked[0].url).toBe(`${PROD_URL}/app/communities`)
    const failures = blockedFailures(blocked)
    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatch(/^BLOCKED request: /)
    expect(failures[0]).not.toContain('abc')
    // take() drains: the next step starts clean.
    expect(guard.take()).toEqual([])
    expect(guard.all()).toHaveLength(1)
  })

  it('lets a Dev runtime request through and the step stays clean', async () => {
    const ctx = fakeContext()
    const guard = createRuntimeGuard()
    await guard.install(ctx)
    const route = fakeRoute(`${DEV_RUNTIME_URL}/app/communities`)
    await ctx.routes[0].handler(route)
    expect(route.fallback).toHaveBeenCalled()
    expect(route.abort).not.toHaveBeenCalled()
    expect(blockedFailures(guard.take())).toEqual([])
  })

  it('uses the allow hook for Dev requests', async () => {
    const ctx = fakeContext()
    const allow = jest.fn(async () => {})
    await createRuntimeGuard().install(ctx, {allow})
    const route = fakeRoute(`${DEV_RUNTIME_URL}/app/communities`)
    await ctx.routes[0].handler(route)
    expect(allow).toHaveBeenCalledWith(route)
    expect(route.fallback).not.toHaveBeenCalled()
  })

  it('closes a prod runtime WebSocket and records it', async () => {
    const ctx = fakeContext()
    const guard = createRuntimeGuard()
    await guard.install(ctx)
    const ws = {
      url: () => `wss://${PROD_RUNTIME_HOST}/app/chat`,
      close: jest.fn(),
      connectToServer: jest.fn(),
    }
    ctx.sockets[0].handler(ws)
    expect(ws.close).toHaveBeenCalled()
    expect(ws.connectToServer).not.toHaveBeenCalled()
    expect(guard.take()[0].kind).toBe('websocket')
  })
})

describe('checkBundle', () => {
  it('passes a bundle built for the Dev runtime', () => {
    expect(
      checkBundle([`var a="${DEV_RUNTIME_URL}"??"${PROD_URL}";`]),
    ).toEqual({ok: true})
  })

  it('refuses a bundle that only knows the prod runtime', () => {
    const res = checkBundle([`var a=undefined??"${PROD_URL}";`])
    expect(res.ok).toBe(false)
    expect(res.reason).toContain(PROD_RUNTIME_HOST)
  })

  it('refuses when there is no bundle to read', () => {
    expect(checkBundle([]).ok).toBe(false)
  })
})

describe('bundleScriptUrls', () => {
  it('keeps same-origin scripts only', () => {
    const html =
      '<script src="/index.bundle?platform=web&dev=true" defer></script>' +
      '<script src="https://cdn.example/x.js"></script>'
    expect(bundleScriptUrls(html, 'http://localhost:19006')).toEqual([
      'http://localhost:19006/index.bundle?platform=web&dev=true',
    ])
  })
})

describe('checkServedBundle (reused server fixture)', () => {
  function fakeRequest(pages) {
    return {
      get: jest.fn(async url => {
        const body = pages[url]
        return {
          ok: () => body !== undefined,
          status: () => (body === undefined ? 404 : 200),
          text: async () => body,
        }
      }),
    }
  }
  const base = 'http://localhost:19006'
  const html = '<script src="/index.bundle"></script>'

  it('refuses a server whose bundle points at prod', async () => {
    const request = fakeRequest({
      [base]: html,
      [`${base}/index.bundle`]: `x=undefined??"${PROD_URL}"`,
    })
    const res = await checkServedBundle(request, base)
    expect(res.ok).toBe(false)
    expect(res.reason).toContain('refusing to sign in')
  })

  it('passes a server whose bundle is the Dev build', async () => {
    const request = fakeRequest({
      [base]: html,
      [`${base}/index.bundle`]: `x="${DEV_RUNTIME_URL}"??"${PROD_URL}"`,
    })
    expect(await checkServedBundle(request, base)).toEqual({ok: true})
  })
})

describe('playwright.config.ts', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'playwright.config.ts'),
    'utf8',
  )
  it('never reuses an existing server', () => {
    expect(src).toMatch(/reuseExistingServer:\s*false/)
    expect(src).not.toMatch(/reuseExistingServer:\s*true/)
  })
  it('blocks service workers, which would bypass the route', () => {
    expect(src).toMatch(/serviceWorkers:\s*'block'/)
  })
})
