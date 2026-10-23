/**
 * Regression tests for the onlineManager heuristics in `#/lib/react-query`.
 *
 * Build 34 symptom: Home sat on its spinner for up to a minute after a cold
 * start. Any agent fetch failure flips onlineManager offline, which (with the
 * old networkMode 'online') pauses Home's queries. The 2 s checker then set
 * `isNetworkStateUnclear = true` whenever another request failed while the
 * health probe was in flight, and nothing ever reset it, so every later
 * successful probe was ignored until an unrelated background poll happened to
 * succeed (30-60 s later).
 */
import {AppState} from 'react-native'
import {afterEach, beforeAll, describe, expect, it, jest} from '@jest/globals'

jest.mock('@bsky.app/react-native-mmkv', () => ({
  MMKV: class MMKVMock {
    _store = new Map<string, string>()
    getString(key: string) {
      return this._store.get(key)
    }
    set(key: string, value: string) {
      this._store.set(key, value)
    }
    delete(key: string) {
      this._store.delete(key)
    }
    clearAll() {
      this._store.clear()
    }
  },
}))

type HealthReply = {ok: boolean}
type Deferred = {resolve: (r: HealthReply) => void}

const healthCalls: string[] = []
let pendingHealth: Deferred[] = []
/** When set, health probes answer immediately with this. */
let autoHealth: HealthReply | undefined

const fetchMock = jest.fn((input: unknown) => {
  healthCalls.push(String(input))
  return new Promise((resolve, reject) => {
    const settle = (r: HealthReply) => {
      if (r.ok) {
        resolve({
          status: 200,
          json: () => Promise.resolve({version: '0.4.0'}),
        })
      } else {
        reject(new TypeError('Network request failed'))
      }
    }
    if (autoHealth) {
      settle(autoHealth)
    } else {
      pendingHealth.push({resolve: settle})
    }
  })
})

let onlineManager: typeof import('@tanstack/react-query').onlineManager
let events: typeof import('#/state/events')

async function flush() {
  // Let the probe's promise chain (fetch -> json -> then) run.
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
  }
}

async function tick(ms: number) {
  await jest.advanceTimersByTimeAsync(ms)
  await flush()
}

function answerHealth(r: HealthReply) {
  const d = pendingHealth.shift()
  if (!d) throw new Error('no health probe in flight')
  d.resolve(r)
}

beforeAll(() => {
  jest.useFakeTimers()
  ;(AppState as {currentState: string}).currentState = 'active'
  globalThis.fetch = fetchMock as unknown as typeof fetch
  // Importing the module installs the listeners and the 2 s interval.
  /* eslint-disable @typescript-eslint/no-require-imports */
  require('#/lib/react-query')
  onlineManager = (
    require('@tanstack/react-query') as typeof import('@tanstack/react-query')
  ).onlineManager
  events = require('#/state/events') as typeof import('#/state/events')
  /* eslint-enable @typescript-eslint/no-require-imports */
})

afterEach(async () => {
  // Return to a clean "online and clear" baseline between tests.
  autoHealth = {ok: true}
  while (pendingHealth.length) answerHealth({ok: true})
  events.emitNetworkConfirmed()
  await tick(2500)
  autoHealth = undefined
  pendingHealth = []
  healthCalls.length = 0
})

describe('react-query onlineManager heuristics', () => {
  it('probes our PDS health endpoint, not the Bluesky AppView', async () => {
    events.emitNetworkLost()
    await tick(2000)
    expect(healthCalls).toHaveLength(1)
    expect(healthCalls[0]).toBe('https://pds.authority-one.com/xrpc/_health')
    answerHealth({ok: true})
    await flush()
    expect(onlineManager.isOnline()).toBe(true)
  })

  it('LATCH REGRESSION: network-lost during a check, then a healthy probe, comes back online', async () => {
    // 1. An agent request fails -> offline.
    events.emitNetworkLost()
    expect(onlineManager.isOnline()).toBe(false)

    // 2. The 2 s interval starts a health check.
    await tick(2000)
    expect(pendingHealth).toHaveLength(1)

    // 3. Another agent request fails while the probe is in flight.
    events.emitNetworkLost()

    // 4. The probe comes back healthy.
    answerHealth({ok: true})
    await flush()

    // Either immediately, or at worst on the next check, we must be online.
    // From here on every probe is healthy and there is no agent traffic at
    // all (the real app's next successful poll was 30-60 s away).
    autoHealth = {ok: true}
    await tick(2500)
    expect(onlineManager.isOnline()).toBe(true)

    // And it stays online: nothing is latched.
    await tick(10_000)
    expect(onlineManager.isOnline()).toBe(true)
  })

  it('comes back online on the very probe that returns healthy', async () => {
    events.emitNetworkLost()
    await tick(2000)
    events.emitNetworkLost()
    answerHealth({ok: true})
    await flush()
    expect(onlineManager.isOnline()).toBe(true)
  })

  it('stays offline while the probe keeps failing and no request succeeds', async () => {
    autoHealth = {ok: false}
    events.emitNetworkLost()
    await tick(2000)
    expect(onlineManager.isOnline()).toBe(false)
    await tick(6000)
    expect(onlineManager.isOnline()).toBe(false)
    // Probing continues while offline.
    expect(healthCalls.length).toBeGreaterThanOrEqual(3)
  })

  it('a confirmed request clears an unclear state (failed probe + successful request)', async () => {
    events.emitNetworkLost()
    await tick(2000)
    // A real request succeeds while the probe is in flight...
    events.emitNetworkConfirmed()
    expect(onlineManager.isOnline()).toBe(true)
    // ...but the probe itself fails -> "unclear": stay online, keep probing.
    answerHealth({ok: false})
    await flush()
    expect(onlineManager.isOnline()).toBe(true)
    await tick(2000)
    expect(pendingHealth).toHaveLength(1)
    // A healthy probe settles it and probing stops.
    answerHealth({ok: true})
    await flush()
    expect(onlineManager.isOnline()).toBe(true)
    const callsAfterSettle = healthCalls.length
    await tick(6000)
    expect(healthCalls.length).toBe(callsAfterSettle)
  })

  it('network-confirmed always restores online, even mid-check', async () => {
    events.emitNetworkLost()
    await tick(2000)
    events.emitNetworkLost()
    events.emitNetworkConfirmed()
    expect(onlineManager.isOnline()).toBe(true)
    answerHealth({ok: true})
    await flush()
    expect(onlineManager.isOnline()).toBe(true)
  })
})
