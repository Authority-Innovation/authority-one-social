import {beforeEach, describe, expect, it} from '@jest/globals'

import {type ContextEvent} from '#/lib/contextEngine/types'
import {
  adoptLegacyContextData,
  appendEvent,
  DEFAULT_PREFS,
  loadEvents,
  loadOpenDwell,
  loadPrefs,
  saveOpenDwell,
  savePrefs,
} from '../store'

// SOC-01: Context Engine data must be partitioned per account (DID), never shared
// across accounts on the same device.

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

const DID_A = 'did:plc:testaccounta'
const DID_B = 'did:plc:testaccountb'

beforeEach(() => {
  mockStore.clear()
})

function ev(id: string, at: number): ContextEvent {
  return {
    id,
    at,
    place: 'venue',
    placeRef: 'Test Venue',
    attention: {durationMin: 5},
    confidence: 0.6,
    sources: ['location'],
  }
}

describe('SOC-01 context store is per-account', () => {
  it('prefs saved for account A are not visible to account B', async () => {
    await savePrefs(DID_A, {
      enabled: true,
      home: {lat: 1, lng: 2, label: 'Home'},
    })
    expect((await loadPrefs(DID_A)).enabled).toBe(true)
    expect(await loadPrefs(DID_B)).toEqual(DEFAULT_PREFS)
  })

  it('events and the open dwell are partitioned by account', async () => {
    await appendEvent(DID_A, ev('a1', 1))
    await saveOpenDwell(DID_A, {place: 'venue', confidence: 0.5, startAt: 1})
    expect((await loadEvents(DID_A)).map(e => e.id)).toEqual(['a1'])
    expect(await loadEvents(DID_B)).toEqual([])
    expect(await loadOpenDwell(DID_B)).toBeNull()
  })

  it('with no signed-in account nothing is read or written', async () => {
    await savePrefs(DID_A, {enabled: true})
    await savePrefs(undefined, {enabled: true})
    await appendEvent(undefined, ev('x', 1))
    expect(await loadPrefs(undefined)).toEqual(DEFAULT_PREFS)
    expect(await loadEvents(undefined)).toEqual([])
    // Only account A's prefs key exists.
    expect(mockStore.size).toBe(1)
  })

  it('legacy device-wide data is adopted once by the first account, then removed', async () => {
    mockStore.set(
      '@authorityOne/contextEngine/prefs',
      JSON.stringify({enabled: true}),
    )
    mockStore.set(
      '@authorityOne/contextEngine/events',
      JSON.stringify([ev('legacy', 1)]),
    )
    await adoptLegacyContextData(DID_A)
    expect((await loadPrefs(DID_A)).enabled).toBe(true)
    expect((await loadEvents(DID_A)).map(e => e.id)).toEqual(['legacy'])
    expect(mockStore.has('@authorityOne/contextEngine/prefs')).toBe(false)
    expect(mockStore.has('@authorityOne/contextEngine/events')).toBe(false)

    // A second account adopting later gets nothing.
    await adoptLegacyContextData(DID_B)
    expect(await loadPrefs(DID_B)).toEqual(DEFAULT_PREFS)
    expect(await loadEvents(DID_B)).toEqual([])
  })

  it('legacy data never overwrites data the account already has', async () => {
    await savePrefs(DID_A, {enabled: false})
    mockStore.set(
      '@authorityOne/contextEngine/prefs',
      JSON.stringify({enabled: true}),
    )
    await adoptLegacyContextData(DID_A)
    expect((await loadPrefs(DID_A)).enabled).toBe(false)
    expect(mockStore.has('@authorityOne/contextEngine/prefs')).toBe(false)
  })
})
