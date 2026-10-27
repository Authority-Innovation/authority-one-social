import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals'

import {isNetworkError} from '#/lib/strings/errors'
import {Logger} from '#/logger'
import {getEntries} from '#/logger/logDump'
import {listenNetworkConfirmed, listenNetworkLost} from '#/state/events'

jest.mock('jwt-decode', () => ({jwtDecode: () => ({})}))
jest.mock('../../birthdate')
jest.mock('../../../ageAssurance/data')
jest.mock('../../../ageAssurance/state', () => ({
  unsafeGetAndComputeAgeAssurance: () => ({state: {}}),
}))

type FetchImpl = (input: unknown, init?: RequestInit) => Promise<unknown>
let fetchImpl: FetchImpl
const fetchSpy = jest.fn((input: unknown, init?: RequestInit) =>
  fetchImpl(input, init),
)

/** A fetch that never answers, but rejects like a real one when aborted. */
const hangingFetch: FetchImpl = (_input, init) =>
  new Promise((_resolve, reject) => {
    const signal = init?.signal
    const abort = () => {
      const err = new Error('Aborted')
      err.name = 'AbortError'
      reject(err)
    }
    if (signal?.aborted) abort()
    signal?.addEventListener('abort', abort)
  })

let agentFetch: typeof import('../agent').agentFetch
let AgentRequestTimeoutError: typeof import('../agent').AgentRequestTimeoutError
let AGENT_REQUEST_TIMEOUT_MS: number
let isConnectivityError: typeof import('../agent').isConnectivityError

const PDS = 'https://pds.authority-one.com'
const lost = jest.fn()
const confirmed = jest.fn()

beforeAll(() => {
  // agent.ts captures globalThis.fetch at module load.
  globalThis.fetch = fetchSpy as unknown as typeof fetch
  /* eslint-disable @typescript-eslint/no-require-imports */
  const mod = require('../agent') as typeof import('../agent')
  /* eslint-enable @typescript-eslint/no-require-imports */
  agentFetch = mod.agentFetch
  AgentRequestTimeoutError = mod.AgentRequestTimeoutError
  AGENT_REQUEST_TIMEOUT_MS = mod.AGENT_REQUEST_TIMEOUT_MS
  isConnectivityError = mod.isConnectivityError
  listenNetworkLost(lost)
  listenNetworkConfirmed(confirmed)
})

beforeEach(() => {
  jest.useFakeTimers()
  lost.mockClear()
  confirmed.mockClear()
  fetchSpy.mockClear()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('agentFetch', () => {
  it('times out after 15 s, without emitting network-lost, and clears its timer', async () => {
    expect(AGENT_REQUEST_TIMEOUT_MS).toBe(15_000)
    fetchImpl = hangingFetch
    const p = agentFetch(`${PDS}/xrpc/app.bsky.actor.getPreferences`)
    const settled = p.then(
      () => 'resolved',
      (e: unknown) => e,
    )
    await jest.advanceTimersByTimeAsync(14_999)
    let state: unknown = 'pending'
    void settled.then(v => (state = v))
    await Promise.resolve()
    expect(state).toBe('pending')

    await jest.advanceTimersByTimeAsync(1)
    const err = await settled
    expect(err).toBeInstanceOf(AgentRequestTimeoutError)
    expect((err as Error).name).toBe('AgentRequestTimeoutError')
    expect(lost).not.toHaveBeenCalled()
    expect(confirmed).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
    // The UI treats it as a connectivity problem ("check your connection").
    expect(isNetworkError(err)).toBe(true)
  })

  it('a caller-initiated abort rejects with the abort error and does not emit network-lost', async () => {
    fetchImpl = hangingFetch
    const caller = new AbortController()
    const p = agentFetch(`${PDS}/xrpc/app.bsky.feed.getTimeline`, {
      signal: caller.signal,
    })
    caller.abort()
    await expect(p).rejects.toMatchObject({name: 'AbortError'})
    expect(lost).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
  })

  it('an already-aborted caller signal aborts immediately', async () => {
    fetchImpl = hangingFetch
    const caller = new AbortController()
    caller.abort()
    await expect(
      agentFetch(`${PDS}/xrpc/app.bsky.feed.getTimeline`, {
        signal: caller.signal,
      }),
    ).rejects.toMatchObject({name: 'AbortError'})
    expect(lost).not.toHaveBeenCalled()
  })

  it('a real connectivity error (RN "Network request failed") emits network-lost', async () => {
    fetchImpl = () => Promise.reject(new TypeError('Network request failed'))
    await expect(
      agentFetch(`${PDS}/xrpc/app.bsky.actor.getPreferences`),
    ).rejects.toThrow('Network request failed')
    expect(lost).toHaveBeenCalledTimes(1)
    expect(confirmed).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
  })

  it('a non-connectivity throw does not emit network-lost', async () => {
    fetchImpl = () => Promise.reject(new TypeError("Cannot read 'x' of null"))
    await expect(
      agentFetch(`${PDS}/xrpc/app.bsky.actor.getPreferences`),
    ).rejects.toThrow()
    expect(lost).not.toHaveBeenCalled()
  })

  it('any HTTP response (even 500) confirms the network', async () => {
    fetchImpl = () => Promise.resolve(new Response('{}', {status: 500}))
    const res = await agentFetch(`${PDS}/xrpc/app.bsky.actor.getPreferences`)
    expect(res.status).toBe(500)
    expect(confirmed).toHaveBeenCalledTimes(1)
    expect(lost).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
  })

  it('passes a composed signal to the underlying fetch', async () => {
    fetchImpl = () => Promise.resolve(new Response('{}', {status: 200}))
    await agentFetch(`${PDS}/xrpc/app.bsky.actor.getPreferences`, {
      method: 'GET',
    })
    const init = fetchSpy.mock.calls[0][1] as RequestInit
    expect(init.signal).toBeDefined()
    expect(init.method).toBe('GET')
  })

  it('large-transfer calls (uploadBlob) are exempt from the timeout', async () => {
    fetchImpl = hangingFetch
    const caller = new AbortController()
    const p = agentFetch(`${PDS}/xrpc/com.atproto.repo.uploadBlob`, {
      method: 'POST',
      signal: caller.signal,
    })
    let state = 'pending'
    p.catch(() => {}).finally(() => (state = 'settled'))
    await jest.advanceTimersByTimeAsync(60_000)
    expect(state).toBe('pending')
    caller.abort()
    await expect(p).rejects.toMatchObject({name: 'AbortError'})
  })

  it('logs nsid/ms/status but never the URL query or tokens', async () => {
    fetchImpl = () => Promise.resolve(new Response('{}', {status: 200}))
    await agentFetch(
      `${PDS}/xrpc/app.bsky.feed.getFeed?feed=at%3A%2F%2Fsecret&cursor=SECRETCURSOR`,
      {headers: {authorization: 'Bearer SECRETTOKEN'}},
    )
    fetchImpl = () => Promise.reject(new TypeError('Network request failed'))
    await agentFetch(
      `${PDS}/xrpc/app.bsky.feed.getFeed?cursor=SECRETCURSOR`,
    ).catch(() => {})
    const entries = getEntries().filter(
      e => e.context === Logger.Context.Network,
    )
    const ok = entries.find(e => e.message === 'agent request')
    expect(ok?.metadata).toMatchObject({
      nsid: 'app.bsky.feed.getFeed',
      host: 'pds.authority-one.com',
      method: 'GET',
      status: 200,
    })
    expect(typeof ok?.metadata.ms).toBe('number')
    const failed = entries.find(e => e.message === 'agent request failed')
    expect(failed?.metadata).toMatchObject({
      nsid: 'app.bsky.feed.getFeed',
      error: 'TypeError',
      connectivity: true,
    })
    const dump = JSON.stringify(entries)
    expect(dump).not.toContain('SECRET')
    expect(dump).not.toContain('Bearer')
    expect(dump).not.toContain('cursor=')
  })
})

describe('isConnectivityError', () => {
  it.each([
    ['Network request failed'],
    ['Network request timed out'],
    ['Failed to fetch'],
    ['NetworkError when attempting to fetch resource.'],
    ['Load failed'],
    ['The Internet connection appears to be offline.'],
    ['The network connection was lost.'],
  ])('true for TypeError(%p)', msg => {
    expect(isConnectivityError(new TypeError(msg))).toBe(true)
  })

  it('false for aborts, our timeout, and unrelated errors', () => {
    const abort = new Error('Network request failed')
    abort.name = 'AbortError'
    expect(isConnectivityError(abort)).toBe(false)
    expect(
      isConnectivityError(new AgentRequestTimeoutError('x.y.z', 15000)),
    ).toBe(false)
    expect(isConnectivityError(new TypeError('x is undefined'))).toBe(false)
    expect(isConnectivityError('Network request failed')).toBe(false)
    expect(isConnectivityError(undefined)).toBe(false)
  })
})
