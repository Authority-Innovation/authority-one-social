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

const mockBoot = {
  load: jest.fn<() => Promise<void>>(),
  web: jest.fn<() => Promise<boolean>>(),
  refresh: jest.fn<() => Promise<string>>(),
}
jest.mock('../controller', () => ({
  aoClient: () => ({}),
  completeWebSignIn: () => mockBoot.web(),
}))
jest.mock('../store', () => ({
  getAOState: () => ({record: {sid: 's', token: 't', did: 'did:plc:x'}}),
  loadAOSession: () => mockBoot.load(),
  patchAORecordIf: jest.fn(),
  sessionRef: (r: unknown) => r,
  setAORecord: jest.fn(),
}))
jest.mock('../session', () => ({
  refreshDecision: () => 'refresh',
  refreshAOSession: () => mockBoot.refresh(),
  syncAOSession: () => Promise.resolve(),
  REFRESH_BACKOFF_MS: 1000,
}))

import {AOSignatureLifecycle} from '../index'

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
  onChange = null
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_t, h) => {
    onChange = h as (s: string) => void
    return {remove: jest.fn()}
  })
  mockBoot.load.mockReset().mockResolvedValue()
  mockBoot.web.mockReset().mockResolvedValue(false)
  mockBoot.refresh.mockReset().mockResolvedValue('refreshed')
})

describe('lifecycle wiring', () => {
  it('a foreground during boot does not tick; boot ticks once; later foregrounds tick', async () => {
    const web = deferred<boolean>()
    mockBoot.web.mockReturnValue(web.promise)
    render(<AOSignatureLifecycle />)
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
    render(<AOSignatureLifecycle />)
    await act(async () => {})
    expect(mockBoot.refresh).not.toHaveBeenCalled()
    await act(() => {
      onChange?.('active')
      return Promise.resolve()
    })
    expect(mockBoot.refresh).toHaveBeenCalledTimes(1)
  })

  it('overlapping foregrounds share one tick', async () => {
    render(<AOSignatureLifecycle />)
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
})
