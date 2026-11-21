import {beforeEach, describe, expect, it} from '@jest/globals'

import {type OpenDwell} from '#/lib/contextEngine/types'
import {
  clearOpenDwell,
  loadOpenDwell,
  loadPrefs,
  saveOpenDwell,
  savePrefs,
} from '../store'

// In-memory AsyncStorage (prefix `mock` so jest's factory may reference it).
const mockStore = new Map<string, string>()
const DID = 'did:plc:testaccount'
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

beforeEach(() => {
  mockStore.clear()
})

describe('background prefs round-trip', () => {
  it('persists and reloads backgroundEnabled (defaults false)', async () => {
    expect((await loadPrefs(DID)).backgroundEnabled).toBe(false)
    await savePrefs(DID, {enabled: false, backgroundEnabled: true})
    expect((await loadPrefs(DID)).backgroundEnabled).toBe(true)
  })

  it('coerces a missing backgroundEnabled to false', async () => {
    await savePrefs(DID, {enabled: true})
    expect((await loadPrefs(DID)).backgroundEnabled).toBe(false)
  })
})

describe('open-dwell persistence', () => {
  const dwell: OpenDwell = {
    place: 'venue',
    placeRef: 'Bar',
    confidence: 0.6,
    startAt: 1_000,
  }

  it('returns null when nothing is stored', async () => {
    expect(await loadOpenDwell(DID)).toBeNull()
  })

  it('round-trips a saved open dwell', async () => {
    await saveOpenDwell(DID, dwell)
    expect(await loadOpenDwell(DID)).toEqual(dwell)
  })

  it('clears the open dwell', async () => {
    await saveOpenDwell(DID, dwell)
    await clearOpenDwell(DID)
    expect(await loadOpenDwell(DID)).toBeNull()
  })

  it('returns null for a malformed stored value', async () => {
    mockStore.set(`@authorityOne/contextEngine/openDwell:${DID}`, '{"place":123}')
    expect(await loadOpenDwell(DID)).toBeNull()
  })
})
