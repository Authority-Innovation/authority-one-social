/**
 * SOC-01: switching accounts must not carry the previous account's Context Engine
 * opt-in, place history or open dwell over to the new account.
 */
import {Fragment} from 'react'
import {beforeEach, describe, expect, it, jest} from '@jest/globals'
import {act, renderHook, waitFor} from '@testing-library/react-native'

const mockStore = new Map<string, string>()
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (k: string) =>
      Promise.resolve(mockStore.has(k) ? mockStore.get(k)! : null),
    setItem: (k: string, v: string) => {
      mockStore.set(k, v)
      return Promise.resolve()
    },
    removeItem: (k: string) => {
      mockStore.delete(k)
      return Promise.resolve()
    },
  },
}))

let mockDid: string | undefined
jest.mock('#/state/session', () => ({
  useSession: () => ({
    hasSession: !!mockDid,
    currentAccount: mockDid ? {did: mockDid} : undefined,
  }),
}))

jest.mock('#/lib/agent-runtime', () => ({
  deleteContextEvent: jest.fn(() => Promise.resolve()),
  fetchNearbyPoi: jest.fn(() => Promise.resolve(null)),
  fetchRecentContext: jest.fn(() => Promise.resolve([])),
  postContextEvents: jest.fn(() => Promise.resolve()),
}))

jest.mock('#/lib/appState', () => ({getCurrentState: () => 'active'}))

jest.mock('expo-location', () => ({
  Accuracy: {Balanced: 3},
  getForegroundPermissionsAsync: jest.fn(() =>
    Promise.resolve({granted: true}),
  ),
  requestForegroundPermissionsAsync: jest.fn(() =>
    Promise.resolve({granted: true}),
  ),
  // Never resolves: the capture loop starts but never produces a sample.
  getCurrentPositionAsync: jest.fn(() => new Promise(() => {})),
  reverseGeocodeAsync: jest.fn(() => Promise.resolve([])),
}))

jest.mock('../backgroundLocation', () => ({
  backgroundLocationSupported: () => false,
  getBackgroundPermissionGranted: () => Promise.resolve(false),
  requestBackgroundPermission: () => Promise.resolve(false),
  startBackgroundUpdates: () => Promise.resolve(false),
  stopBackgroundUpdates: () => Promise.resolve(),
}))

import {
  ContextEngineProvider,
  useContextEngine,
} from '../ContextEngineProvider'

// Mirrors App.native.tsx / App.web.tsx: the provider must live inside the subtree
// keyed by the current account DID (placement asserted in SOC-01.providerPlacement).
function Wrapper({children}: {children: React.ReactNode}) {
  return (
    <Fragment key={mockDid}>
      <ContextEngineProvider>{children}</ContextEngineProvider>
    </Fragment>
  )
}

const DID_A = 'did:plc:testaccounta'
const DID_B = 'did:plc:testaccountb'

const legacyEvent = {
  id: 'evt-a',
  at: 1,
  place: 'venue',
  placeRef: 'Test Venue',
  attention: {durationMin: 30},
  confidence: 0.6,
  sources: ['location'],
}

beforeEach(() => {
  mockStore.clear()
  // Data written by a build that used device-wide keys, while account A was active.
  mockStore.set(
    '@authorityOne/contextEngine/prefs',
    JSON.stringify({enabled: true, home: {lat: 1, lng: 2, label: 'Home'}}),
  )
  mockStore.set(
    '@authorityOne/contextEngine/events',
    JSON.stringify([legacyEvent]),
  )
})

describe('SOC-01 Context Engine across an account switch', () => {
  it('account B sees an empty log with capture off; account A keeps its data', async () => {
    mockDid = DID_A
    const {result, rerender} = renderHook(() => useContextEngine(), {
      wrapper: Wrapper,
    })
    await waitFor(() => expect(result.current.events).toHaveLength(1))
    await waitFor(() => expect(result.current.active).toBe(true))

    mockDid = DID_B
    await act(async () => {
      rerender({})
    })
    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
    })
    expect(result.current.events).toEqual([])
    expect(result.current.prefs.enabled).toBe(false)
    expect(result.current.prefs.home).toBeUndefined()
    expect(result.current.active).toBe(false)

    // Partitioned, not wiped: switching back restores A's own data.
    mockDid = DID_A
    await act(async () => {
      rerender({})
    })
    await waitFor(() => expect(result.current.events).toHaveLength(1))
    expect(result.current.prefs.enabled).toBe(true)
  })

  it('signed out: nothing is loaded and capture is off', async () => {
    mockDid = undefined
    const {result} = renderHook(() => useContextEngine(), {
      wrapper: Wrapper,
    })
    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
    })
    expect(result.current.events).toEqual([])
    expect(result.current.active).toBe(false)
  })
})
