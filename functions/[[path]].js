/**
 * Cloudflare Pages catch-all Function: SPA fallback for the "One" web app.
 *
 * WHY A FUNCTION AND NOT _redirects: Pages rejects both rules the previous
 * `cloudflare/_redirects` relied on — a 404-status rule is not a valid
 * redirect status, and `/* /index.html 200` is discarded as an infinite loop
 * (the target normalizes back to `/`, which matches `/*` again). Wrangler
 * parses that file to ZERO valid rules. Deep links only ever worked through
 * Pages' AUTOMATIC SPA fallback, which is disabled the moment a top-level
 * 404.html exists — so shipping 404.html (the 2026-07-19 cache-poison fix)
 * silently 404'd every client-side route (/game/<id>, /notifications, …).
 *
 * This Function restores both properties at once:
 *   - unmatched non-asset paths serve the app shell with 200 + no-cache, so
 *     react-navigation deep links and refreshes work;
 *   - a MISSING /static/* asset stays a loud 404 with no-store — never the
 *     HTML shell — so a request racing a deploy can never cache HTML at a
 *     hashed bundle URL under the year-long immutable _headers rule (the
 *     original splash-screen-hang incident).
 *
 * Static assets that EXIST are passed through untouched (env.ASSETS applies
 * cloudflare/_headers, verified: /static/* keeps its immutable Cache-Control).
 */
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access --
   plain-JS Cloudflare Pages Function outside the TS project; `env`/Response
   are typed by the Workers runtime, not our tsconfig. */
export async function onRequest({request, env}) {
  const asset = await env.ASSETS.fetch(request)
  if (asset.status !== 404) return asset

  const url = new URL(request.url)
  if (url.pathname.startsWith('/static/')) {
    const headers = new Headers(asset.headers)
    headers.set('cache-control', 'no-store')
    return new Response(asset.body, {status: 404, headers})
  }

  const shell = await env.ASSETS.fetch(new URL('/', url.origin))
  const headers = new Headers(shell.headers)
  headers.set('cache-control', 'no-cache')
  return new Response(shell.body, {status: 200, headers})
}
