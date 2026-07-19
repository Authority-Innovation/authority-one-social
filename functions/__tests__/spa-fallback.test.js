/**
 * The Pages catch-all Function (functions/[[path]].js) is the SPA fallback
 * AND the cache-poison guard — these tests pin both behaviors with a fake
 * env.ASSETS (the real routing was also verified against `wrangler pages
 * dev`; see the function's docblock for why _redirects cannot do this job).
 */
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await --
   plain-JS test of a plain-JS Pages Function outside the TS project. */
import {onRequest} from '../[[path]].js'

const SHELL = '<html><body>app shell</body></html>'
const NOT_FOUND = 'Not found.'

function makeEnv({assets = {}} = {}) {
  return {
    ASSETS: {
      fetch: async input => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
        )
        const hit = assets[url.pathname]
        if (hit) {
          return new Response(hit.body, {status: 200, headers: hit.headers})
        }
        return new Response(NOT_FOUND, {
          status: 404,
          headers: {'content-type': 'text/html'},
        })
      },
    },
  }
}

const BASE_ASSETS = {
  '/': {body: SHELL, headers: {'cache-control': 'no-cache'}},
  '/static/js/app.js': {
    body: 'console.log(1)',
    headers: {
      'content-type': 'application/javascript',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  },
}

describe('Pages SPA fallback function', () => {
  it('passes existing assets through untouched (immutable header intact)', async () => {
    const res = await onRequest({
      request: new Request('https://app.example.com/static/js/app.js'),
      env: makeEnv({assets: BASE_ASSETS}),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('immutable')
    expect(await res.text()).toBe('console.log(1)')
  })

  it('serves the app shell with 200 + no-cache for a deep link', async () => {
    const res = await onRequest({
      request: new Request('https://app.example.com/game/abc123?t=tok&name=E'),
      env: makeEnv({assets: BASE_ASSETS}),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-cache')
    expect(await res.text()).toBe(SHELL)
  })

  it('keeps a missing /static/* asset a LOUD 404 with no-store (never the shell)', async () => {
    const res = await onRequest({
      request: new Request('https://app.example.com/static/js/missing.hash.js'),
      env: makeEnv({assets: BASE_ASSETS}),
    })
    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await res.text()
    expect(body).not.toContain('app shell')
  })
})
