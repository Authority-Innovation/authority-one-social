/**
 * A fetch that answers /live calls with the runtime's recorded replies
 * (live.json), in the order a test queues them, and records every request.
 * Paths with nothing queued answer 500, so an unexpected call fails loudly.
 */
import {reply} from './runtimeLive'

export type SentRequest = {
  path: string
  url: string
  method: string
  headers: Record<string, string>
  body: Record<string, unknown> | undefined
  raw: string | undefined
}

type Answer = string | {status: number; body: unknown} | Error

/** Route key: the path with the sid replaced by `:sid`. */
const routeOf = (path: string) => path.replace(/ls_[0-9A-Z]{26}/, ':sid')

export function createRuntimeFetch() {
  const queues = new Map<string, Answer[]>()
  const sent: SentRequest[] = []
  const fetch = (url: string, init: RequestInit = {}) => {
    const u = new URL(url)
    const raw = typeof init.body === 'string' ? init.body : undefined
    sent.push({
      path: u.pathname,
      url,
      method: String(init.method ?? 'GET'),
      headers: {...(init.headers as Record<string, string>)},
      body:
        raw === undefined
          ? undefined
          : (JSON.parse(raw) as Record<string, unknown>),
      raw,
    })
    const q = queues.get(routeOf(u.pathname)) ?? []
    const next = q.shift()
    if (next instanceof Error) return Promise.reject(next)
    const r =
      next === undefined
        ? {status: 500, body: {error: 'nothing queued'}}
        : typeof next === 'string'
          ? reply(next)
          : next
    const text = JSON.stringify(r.body)
    return Promise.resolve({
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: () => Promise.resolve(text),
    } as Response)
  }
  return {
    fetch,
    sent,
    /** Queue answers for a route, e.g. on('/live/sessions/:sid/token', 'tokenCamera'). */
    on(route: string, ...answers: Answer[]) {
      queues.set(route, [...(queues.get(route) ?? []), ...answers])
    },
    to: (route: string) => sent.filter(s => routeOf(s.path) === route),
  }
}
