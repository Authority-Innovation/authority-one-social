/**
 * Browser-side Dev guard. guard.js checks the environment run.js was given;
 * this checks what the bundle under test actually does, because a web server
 * someone else started (or one built without the development-communities env)
 * can serve a bundle that talks to the prod agent runtime whatever the
 * environment says.
 *
 * Two parts:
 * - a route on every browser context that aborts, before it leaves the
 *   machine, any request or WebSocket to an agent-runtime host that is not
 *   the Dev runtime, and records it so the step that made it fails;
 * - a preflight that reads the served bundle and refuses when the Dev runtime
 *   URL is not baked into it.
 *
 * Limits: the route matches hosts with "agent-runtime" in the name, so a
 * runtime on a custom domain would not be routed; the preflight is what
 * catches a build pointed elsewhere. And page.request (the APIRequestContext)
 * does not go through context.route() at all, so harness code that calls the
 * runtime directly must go through guardedPost().
 */

const {DEV_RUNTIME_HOST} = require('./guard')

// src/lib/constants.ts AGENT_RUNTIME_SERVICE - the fallback a bundle built
// without EXPO_PUBLIC_AGENT_RUNTIME_URL calls.
const PROD_RUNTIME_HOST = 'authority-one-agent-runtime.e-479.workers.dev'

function parseUrl(raw) {
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

/**
 * Any agent-runtime worker, Dev or not. Deliberately broad: a new runtime
 * host (staging, a renamed prod) is blocked unless it is the Dev host.
 */
function isAgentRuntimeHost(hostname) {
  const h = String(hostname || '').toLowerCase()
  return h === PROD_RUNTIME_HOST || h.includes('agent-runtime')
}

/**
 * @param {string} rawUrl
 * @returns {{action: 'allow'} | {action: 'abort', host: string, reason: string}}
 */
function classifyRequest(rawUrl) {
  const url = parseUrl(rawUrl)
  if (!url || !isAgentRuntimeHost(url.hostname)) return {action: 'allow'}
  const secure = url.protocol === 'https:' || url.protocol === 'wss:'
  if (url.hostname.toLowerCase() === DEV_RUNTIME_HOST && secure) {
    return {action: 'allow'}
  }
  return {
    action: 'abort',
    host: url.hostname,
    reason: `non-Dev agent-runtime request to ${url.protocol}//${url.hostname} aborted (only https://${DEV_RUNTIME_HOST} is allowed)`,
  }
}

/** Origin and path only: query strings can carry tokens. */
function describeUrl(rawUrl) {
  const url = parseUrl(rawUrl)
  return url ? `${url.origin}${url.pathname}` : String(rawUrl).slice(0, 200)
}

/**
 * One guard per run. `install` it on every browser context before any page
 * in that context navigates; `take` returns what was blocked since the last
 * call, so each step sees only its own.
 */
function createRuntimeGuard() {
  const all = []
  let pending = []

  function record(rawUrl, decision, kind) {
    const b = {kind, url: describeUrl(rawUrl), reason: decision.reason}
    all.push(b)
    pending.push(b)
  }

  /**
   * @param {import('@playwright/test').BrowserContext} context
   * @param {{allow?: (route: any) => Promise<void>}} [opts] what to do with an
   *   allowed Dev request. Defaults to falling through to the network; the
   *   guard's own tests fulfil it locally instead.
   */
  async function install(context, {allow = route => route.fallback()} = {}) {
    const matches = url => isAgentRuntimeHost(url.hostname)
    await context.route(matches, async route => {
      const rawUrl = route.request().url()
      const decision = classifyRequest(rawUrl)
      if (decision.action === 'abort') {
        record(rawUrl, decision, 'request')
        await route.abort('blockedbyclient')
        return
      }
      await allow(route)
    })
    if (typeof context.routeWebSocket === 'function') {
      await context.routeWebSocket(matches, ws => {
        const decision = classifyRequest(ws.url())
        if (decision.action === 'abort') {
          record(ws.url(), decision, 'websocket')
          void ws.close({
            code: 1008,
            reason: 'blocked by clickthrough Dev guard',
          })
          return
        }
        ws.connectToServer()
      })
    }
  }

  /**
   * page.request bypasses context.route(), so a direct runtime call is
   * checked here instead: a non-Dev agent-runtime URL is recorded (the step
   * fails) and refused before anything is sent.
   *
   * @param {{post: (url: string, opts?: any) => Promise<any>}} request
   */
  async function guardedPost(request, rawUrl, opts) {
    const decision = classifyRequest(rawUrl)
    if (decision.action === 'abort') {
      record(rawUrl, decision, 'api request')
      throw new Error(decision.reason)
    }
    return request.post(rawUrl, opts)
  }

  return {
    install,
    guardedPost,
    take() {
      const out = pending
      pending = []
      return out
    },
    all() {
      return [...all]
    },
  }
}

/** Step failure lines for blocked requests. Empty means the step is clean. */
function blockedFailures(blocked) {
  return blocked.map(b => `BLOCKED ${b.kind}: ${b.reason} (${b.url})`)
}

/**
 * Same-origin script URLs in the served HTML. Expo web serves one bundle
 * script; anything off-origin is not the build under test.
 */
function bundleScriptUrls(html, baseURL) {
  const base = new URL(baseURL)
  const out = []
  const re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi
  let m
  while ((m = re.exec(String(html)))) {
    const url = parseUrl(new URL(m[1], base).href)
    if (url && url.origin === base.origin) out.push(url.href)
  }
  return out
}

// The Dev runtime URL as a bundle carries it: the whole origin (scheme
// included, slashes possibly JSON-escaped), not followed by more host
// characters. A bare mention of the host, or a look-alike such as
// "<dev host>.evil.example", does not count.
const DEV_RUNTIME_IN_BUNDLE = new RegExp(
  String.raw`https:(?://|\\/\\/)` +
    DEV_RUNTIME_HOST.replace(/[.]/g, String.raw`\.`) +
    '(?![A-Za-z0-9.-])',
)

/**
 * Whether the served bundle was built for the Dev runtime. Expo inlines
 * EXPO_PUBLIC_AGENT_RUNTIME_URL at build time, so a Dev build contains the Dev
 * runtime URL. The prod host is in every bundle (the AGENT_RUNTIME_SERVICE
 * fallback), so its presence alone proves nothing; the Dev URL's absence
 * does.
 *
 * @param {string[]} sources the bundle script bodies
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
function checkBundle(sources) {
  if (!sources.length) {
    return {
      ok: false,
      reason:
        'the served page has no same-origin bundle script; cannot tell which runtime it calls',
    }
  }
  if (sources.some(s => DEV_RUNTIME_IN_BUNDLE.test(String(s)))) {
    return {ok: true}
  }
  const prod = sources.some(s => String(s).includes(PROD_RUNTIME_HOST))
  return {
    ok: false,
    reason: `the served bundle does not contain the Dev runtime URL https://${DEV_RUNTIME_HOST}${prod ? ` but does contain ${PROD_RUNTIME_HOST}` : ''}; it was not built with the development-communities env - refusing to sign in`,
  }
}

/**
 * Reads the bundle the server at `baseURL` is serving and checks it.
 * `request` is a Playwright APIRequestContext (page.request).
 */
async function checkServedBundle(request, baseURL) {
  const page = await request.get(baseURL)
  if (!page.ok()) {
    return {ok: false, reason: `GET ${baseURL} answered ${page.status()}`}
  }
  const urls = bundleScriptUrls(await page.text(), baseURL)
  const sources = []
  for (const url of urls) {
    const res = await request.get(url, {timeout: 10 * 60 * 1000})
    if (!res.ok()) {
      return {
        ok: false,
        reason: `bundle ${describeUrl(url)} answered ${res.status()}`,
      }
    }
    sources.push(await res.text())
  }
  return checkBundle(sources)
}

module.exports = {
  PROD_RUNTIME_HOST,
  isAgentRuntimeHost,
  classifyRequest,
  createRuntimeGuard,
  blockedFailures,
  bundleScriptUrls,
  checkBundle,
  checkServedBundle,
}
