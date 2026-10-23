/**
 * "Proxy repro" for the build-34 Home cold-start spinner.
 *
 * A flaky proxy / captive network kills the first three requests to our PDS
 * about a second apart, then everything works. The health probe answers
 * (slowly) the whole time. Before the fix this left onlineManager latched
 * offline (a network-lost landed while the 2 s checker's probe was in flight)
 * and Home's preferences query paused forever, so Home's gate
 * (`preferences && pinnedFeedInfos`, Home.tsx) never opened and never errored.
 *
 * This drives the real Home hooks (usePreferencesQuery, usePinnedFeedsInfos),
 * the real app QueryClient defaults, the real agent fetch wrapper and the real
 * connectivity checker, on fake time.
 *
 * Note: this scenario is fixed by either networkMode 'offlineFirst' or the
 * latch fix alone (latch-only still shows paused samples, so it fails the
 * "never paused" assertion). The latch itself is pinned separately by
 * src/lib/__tests__/react-query-online.test.ts.
 */
import {type ReactNode} from 'react'
import {AppState} from 'react-native'
import {BskyAgent} from '@atproto/api'
import {afterAll, beforeAll, describe, expect, it, jest} from '@jest/globals'
import {QueryClientProvider} from '@tanstack/react-query'
import {act, renderHook} from '@testing-library/react-native'

jest.mock('@bsky.app/react-native-mmkv', () => ({
  MMKV: class MMKVMock {
    getString() {
      return undefined
    }
    set() {}
    delete() {}
    clearAll() {}
  },
}))
// feed.ts only needs list's query-key factory; the real module drags in the
// media picker / UI graph.
jest.mock('#/state/queries/list', () => ({
  RQKEY: (uri: string) => ['list', uri],
}))
jest.mock('#/state/queries/resolve-uri', () => ({
  precacheResolvedUri: jest.fn(),
}))
jest.mock('#/components/Toast', () => ({show: jest.fn()}))
// The repo-wide __mocks__/multiformats/cid stub has no CID.asCID, which the
// XRPC client's response parser (@atproto/lexicon jsonToLex) calls.
jest.mock('multiformats/cid', () => ({CID: {asCID: () => null}}))
jest.mock('jwt-decode', () => ({jwtDecode: () => ({})}))
jest.mock('#/state/birthdate')
jest.mock('#/ageAssurance/data')
jest.mock('#/ageAssurance/state', () => ({
  unsafeGetAndComputeAgeAssurance: () => ({state: {}}),
}))

let mockAgent: BskyAgent | undefined
jest.mock('#/state/session', () => ({
  useAgent: () => mockAgent,
  useSession: () => ({
    hasSession: true,
    currentAccount: {did: 'did:plc:elliott'},
  }),
}))
jest.mock('#/ageAssurance', () => ({
  useAgeAssurance: () => ({
    Access: {Full: 'full'},
    state: {access: 'full'},
    flags: {adultContentDisabled: false},
  }),
}))

const PDS = 'https://pds.authority-one.com'
const FEED_URI = 'at://did:plc:feedgen/app.bsky.feed.generator/whats-hot'
const KILLS = 3
const KILL_AFTER_MS = 50
const HEALTH_LATENCY_MS = 500

let pdsXrpcCount = 0
const log: string[] = []
let now = () => 0

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json'},
  })
}

function respond(url: string): Response {
  if (url.includes('/xrpc/app.bsky.actor.getPreferences')) {
    return json({
      preferences: [
        {
          $type: 'app.bsky.actor.defs#savedFeedsPrefV2',
          items: [
            {id: '1', type: 'timeline', value: 'following', pinned: true},
            {id: '2', type: 'feed', value: FEED_URI, pinned: true},
          ],
        },
      ],
    })
  }
  if (url.includes('/xrpc/app.bsky.feed.getFeedGenerators')) {
    return json({feeds: []})
  }
  return json({count: 0})
}

const proxyFetch = jest.fn((input: unknown, init?: RequestInit) => {
  const url =
    input instanceof Request
      ? input.url
      : input instanceof URL
        ? input.href
        : String(input)
  return new Promise<Response>((resolve, reject) => {
    const signal = init?.signal
    signal?.addEventListener('abort', () => {
      const e = new Error('Aborted')
      e.name = 'AbortError'
      reject(e)
    })
    if (url === `${PDS}/xrpc/_health`) {
      setTimeout(() => resolve(json({version: '0.4.0'})), HEALTH_LATENCY_MS)
      return
    }
    const n = ++pdsXrpcCount
    const nsid = /\/xrpc\/([^?]+)/.exec(url)?.[1]
    if (n <= KILLS) {
      setTimeout(() => {
        log.push(`${now()}ms killed #${n} ${nsid}`)
        reject(new TypeError('Network request failed'))
      }, KILL_AFTER_MS)
      return
    }
    log.push(`${now()}ms ok #${n} ${nsid}`)
    resolve(respond(url))
  })
})

let createQueryClient: typeof import('#/lib/react-query').createQueryClient
let agentFetch: typeof import('#/state/session/agent').agentFetch
let usePreferencesQuery: typeof import('#/state/queries/preferences').usePreferencesQuery
let usePinnedFeedsInfos: typeof import('#/state/queries/feed').usePinnedFeedsInfos
let onlineManager: typeof import('@tanstack/react-query').onlineManager

beforeAll(() => {
  jest.useFakeTimers()
  const t0 = Date.now()
  now = () => Date.now() - t0
  ;(AppState as {currentState: string}).currentState = 'active'
  // Both agent.ts and react-query.tsx capture/use the global fetch.
  globalThis.fetch = proxyFetch
  /* eslint-disable @typescript-eslint/no-require-imports */
  createQueryClient = (
    require('#/lib/react-query') as typeof import('#/lib/react-query')
  ).createQueryClient
  agentFetch = (
    require('#/state/session/agent') as typeof import('#/state/session/agent')
  ).agentFetch
  usePreferencesQuery = (
    require('#/state/queries/preferences') as typeof import('#/state/queries/preferences')
  ).usePreferencesQuery
  usePinnedFeedsInfos = (
    require('#/state/queries/feed') as typeof import('#/state/queries/feed')
  ).usePinnedFeedsInfos
  onlineManager = (
    require('@tanstack/react-query') as typeof import('@tanstack/react-query')
  ).onlineManager
  /* eslint-enable @typescript-eslint/no-require-imports */

  mockAgent = new BskyAgent({service: PDS, fetch: agentFetch})
  mockAgent.sessionManager.session = {
    active: true,
    did: 'did:plc:elliott',
    handle: 'elliott.authority-one.com',
    accessJwt: 'test-access-jwt',
    refreshJwt: 'test-refresh-jwt',
  }
})

afterAll(() => {
  jest.useRealTimers()
})

describe('Home cold start behind a proxy that kills the first PDS requests', () => {
  it("Home's preferences and pinned-feed queries resolve within a few seconds and never sit paused", async () => {
    const agent = mockAgent!
    const background = () =>
      agent.app.bsky.notification.getUnreadCount().catch(() => {})

    // App start: a background poll goes out first and gets killed.
    void background()
    await act(() => jest.advanceTimersByTimeAsync(KILL_AFTER_MS + 10))
    expect(onlineManager.isOnline()).toBe(false)

    // Home mounts while onlineManager believes we're offline.
    const client = createQueryClient()
    const wrapper = ({children}: {children: ReactNode}) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const {result, unmount} = renderHook(
      () => ({
        prefs: usePreferencesQuery(),
        pinned: usePinnedFeedsInfos(),
      }),
      {wrapper},
    )

    const pausedSamples: string[] = []
    const sample = (label: string) => {
      const {prefs, pinned} = result.current
      if (prefs.fetchStatus === 'paused') pausedSamples.push(`${label} prefs`)
      if (pinned.fetchStatus === 'paused') pausedSamples.push(`${label} pinned`)
    }

    // More startup traffic ~1 s apart; the third kill lands while the 2 s
    // checker's health probe is in flight (2000-2500 ms).
    const schedule: Array<[number, () => void]> = [
      [1000, () => void background()],
      [2200, () => void background()],
    ]
    const deadline = 6000
    let resolvedAt: number | undefined
    for (let t = 100; t <= deadline; t += 100) {
      await act(() => jest.advanceTimersByTimeAsync(100))
      for (const [at, fn] of schedule) {
        if (now() >= at && now() < at + 100) fn()
      }
      sample(`${now()}ms`)
      const {prefs, pinned} = result.current
      if (
        resolvedAt === undefined &&
        prefs.data &&
        pinned.data &&
        !pinned.isLoading
      ) {
        resolvedAt = now()
      }
    }

    const {prefs, pinned} = result.current
    // Home.tsx gate: `preferences && pinnedFeedInfos && !isPinnedFeedsLoading`.
    if (resolvedAt === undefined) {
      throw new Error(
        'Home never got past its gate: ' +
          JSON.stringify({
            log,
            firstPaused: pausedSamples.slice(0, 4),
            prefs: [prefs.status, prefs.fetchStatus],
            pinned: [pinned.status, pinned.fetchStatus],
            online: onlineManager.isOnline(),
          }),
      )
    }
    expect(resolvedAt).toBeLessThanOrEqual(4000)
    expect(prefs.status).toBe('success')
    expect(pinned.status).toBe('success')
    expect(pinned.data?.map(f => f.uri)).toEqual(['following'])
    expect(pausedSamples).toEqual([])
    expect(onlineManager.isOnline()).toBe(true)
    // The proxy really did kill requests.
    expect(log.filter(l => l.includes('killed'))).toHaveLength(KILLS)
    unmount()
  })
})
