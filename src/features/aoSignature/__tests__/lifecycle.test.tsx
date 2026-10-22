import {StrictMode} from 'react'
import {AppState} from 'react-native'
import {beforeEach, describe, expect, it, jest} from '@jest/globals'
import {act, render} from '@testing-library/react-native'

// The ARMED lifecycle's wiring: boot → one tick; foreground ticks only after
// boot (even a failed one); never two ticks in flight.
jest.mock('../config', () => ({
  isAOSignatureArmed: () => true,
  AO_SIGNATURE_CONFIG: {platform: 'ios', runtimeUrl: 'https://runtime.test'},
}))
jest.mock('../components/AccountSection', () => ({}))
jest.mock('../components/Shell', () => ({}))
jest.mock('../components/SignInButton', () => ({}))
jest.mock('../hooks', () => ({persistedPdsPort: {}}))
const mockWarn = jest.fn()
jest.mock('#/logger', () => ({
  logger: {warn: (...a: unknown[]) => mockWarn(...a)},
}))

const mockBoot = {
  load: jest.fn<() => Promise<void>>(),
  web: jest.fn<() => Promise<boolean>>(),
  refresh: jest.fn<() => Promise<string>>(),
  sync: jest.fn<() => Promise<void>>(),
  record: {sid: 's', token: 't', did: 'did:plc:x'} as {
    sid: string
    token: string
    did: string
  } | null,
}
jest.mock('../controller', () => ({
  aoClient: () => ({}),
  completeWebSignIn: () => mockBoot.web(),
}))
jest.mock('../store', () => ({
  getAOState: () => ({record: mockBoot.record}),
  loadAOSession: () => mockBoot.load(),
  patchAORecordIf: jest.fn(),
  sessionRef: (r: unknown) => r,
  setAORecord: jest.fn(),
}))
jest.mock('../session', () => ({
  // The real policy's backoff rule: inside the backoff window, no refresh.
  refreshDecision: (_r: unknown, now: number, backoffUntil: number) =>
    now < backoffUntil ? 'none' : 'refresh',
  refreshAOSession: () => mockBoot.refresh(),
  syncAOSession: () => mockBoot.sync(),
  REFRESH_BACKOFF_MS: 15 * 60 * 1000,
}))

import {AOSignatureError} from '../errors'
import {AOSignatureLifecycle} from '../index'
import {_resetAOLifecycleForTests, safeErrorSummary} from '../lifecycle'

/** Always under a real <StrictMode> (double-invoked mount effects). */
function mount() {
  return render(
    <StrictMode>
      <AOSignatureLifecycle />
    </StrictMode>,
  )
}

let onChange: ((s: string) => void) | null = null
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return {promise, resolve, reject}
}

beforeEach(() => {
  _resetAOLifecycleForTests()
  mockWarn.mockReset()
  onChange = null
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_t, h) => {
    onChange = h as (s: string) => void
    return {remove: jest.fn()}
  })
  mockBoot.load.mockReset().mockResolvedValue()
  mockBoot.web.mockReset().mockResolvedValue(false)
  mockBoot.refresh.mockReset().mockResolvedValue('refreshed')
  mockBoot.sync.mockReset().mockResolvedValue()
  mockBoot.record = {sid: 's', token: 't', did: 'did:plc:x'}
})

describe('lifecycle wiring', () => {
  it('StrictMode (double effect) and a remount still boot ONCE', async () => {
    const first = mount()
    await act(async () => {})
    first.unmount()
    mount()
    await act(async () => {})
    expect(mockBoot.load).toHaveBeenCalledTimes(1)
    expect(mockBoot.web).toHaveBeenCalledTimes(1)
    expect(mockBoot.refresh).toHaveBeenCalledTimes(1)
  })

  it('a failed boot is logged with its kind only — never a token', async () => {
    mockBoot.load.mockRejectedValue(new Error('aos1.SECRET.TOKEN'))
    mount()
    await act(async () => {})
    expect(mockWarn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(mockWarn.mock.calls)).not.toContain('aos1.')
  })

  it('a foreground during boot does not tick; boot ticks once; later foregrounds tick', async () => {
    const web = deferred<boolean>()
    mockBoot.web.mockReturnValue(web.promise)
    mount()
    await act(async () => {})
    act(() => onChange?.('active'))
    expect(mockBoot.refresh).not.toHaveBeenCalled()
    await act(() => {
      web.resolve(false)
      return Promise.resolve()
    })
    expect(mockBoot.refresh).toHaveBeenCalledTimes(1)
    await act(() => {
      onChange?.('active')
      return Promise.resolve()
    })
    expect(mockBoot.refresh).toHaveBeenCalledTimes(2)
  })

  it('a FAILED boot still lets foreground ticks run (booted in finally)', async () => {
    mockBoot.load.mockRejectedValue(new Error('keychain'))
    mount()
    await act(async () => {})
    expect(mockBoot.refresh).not.toHaveBeenCalled()
    await act(() => {
      onChange?.('active')
      return Promise.resolve()
    })
    expect(mockBoot.refresh).toHaveBeenCalledTimes(1)
  })

  it('overlapping foregrounds share one tick', async () => {
    mount()
    await act(async () => {})
    expect(mockBoot.refresh).toHaveBeenCalledTimes(1)
    const slow = deferred<string>()
    mockBoot.refresh.mockReturnValue(slow.promise)
    act(() => {
      onChange?.('active')
      onChange?.('active')
      onChange?.('active')
    })
    expect(mockBoot.refresh).toHaveBeenCalledTimes(2)
    await act(() => {
      slow.resolve('refreshed')
      return Promise.resolve()
    })
    expect(mockBoot.refresh).toHaveBeenCalledTimes(2)
  })

  it("A's refresh backoff and last sync never delay B after an account switch", async () => {
    mockBoot.refresh.mockResolvedValue('backoff')
    mount()
    await act(async () => {})
    expect(mockBoot.refresh).toHaveBeenCalledTimes(1) // boot: A backs off
    expect(mockBoot.sync).toHaveBeenCalledTimes(1) // boot: A synced
    await act(() => {
      onChange?.('active')
      return Promise.resolve()
    })
    expect(mockBoot.refresh).toHaveBeenCalledTimes(1) // A still in backoff

    mockBoot.record = {sid: 'sid-b', token: 'tb', did: 'did:plc:b'}
    mockBoot.refresh.mockResolvedValue('refreshed')
    await act(() => {
      onChange?.('active')
      return Promise.resolve()
    })
    expect(mockBoot.refresh).toHaveBeenCalledTimes(2) // B's tick refreshes
    expect(mockBoot.sync).toHaveBeenCalledTimes(2) // and B's first sync runs
  })
})

describe('boot-error log lines', () => {
  it.each([
    ['a long string', 'x'.repeat(200)],
    ['a token-like code', 'aos1.eyJkaWQiOiJkaWQ6cGxjOngifQ.deadbeef'],
    ['an email', 'owner@example.com'],
    ['a URL', 'https://evil.test/?t=1'],
  ])('a hostile server code (%s) is logged as "other"', (_n, code) => {
    const line = safeErrorSummary(new AOSignatureError('refused', 401, code))
    expect(line).toBe('refused:401:other')
    expect(line).not.toContain(code)
  })

  it('short identifiers pass; a hostile error name is clamped too', () => {
    expect(
      safeErrorSummary(new AOSignatureError('refused', 409, 'already-bound')),
    ).toBe('refused:409:already-bound')
    expect(safeErrorSummary(new AOSignatureError('transport'))).toBe(
      'transport:0:',
    )
    const e = new Error('x')
    e.name = 'aos1.secret.token'
    expect(safeErrorSummary(e)).toBe('other')
  })

  it('end to end: a boot failure with a hostile code logs no part of it', async () => {
    const hostile = 'aos1.SECRET.TOKEN owner@example.com'
    mockBoot.load.mockRejectedValue(
      new AOSignatureError('refused', 500, hostile),
    )
    mount()
    await act(async () => {})
    const logged = JSON.stringify(mockWarn.mock.calls)
    expect(logged).toContain('refused:500:other')
    expect(logged).not.toContain('aos1.')
    expect(logged).not.toContain('@example.com')
  })
})
