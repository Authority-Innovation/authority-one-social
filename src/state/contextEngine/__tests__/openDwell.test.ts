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
    expect((await loadPrefs()).backgroundEnabled).toBe(false)
    await savePrefs({enabled: false, backgroundEnabled: true})
    expect((await loadPrefs()).backgroundEnabled).toBe(true)
  })

  it('coerces a missing backgroundEnabled to false', async () => {
    await savePrefs({enabled: true})
    expect((await loadPrefs()).backgroundEnabled).toBe(false)
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
    expect(await loadOpenDwell()).toBeNull()
  })

  it('round-trips a saved open dwell', async () => {
    await saveOpenDwell(dwell)
    expect(await loadOpenDwell()).toEqual(dwell)
  })

  it('clears the open dwell', async () => {
    await saveOpenDwell(dwell)
    await clearOpenDwell()
    expect(await loadOpenDwell()).toBeNull()
  })

  it('returns null for a malformed stored value', async () => {
    mockStore.set('@authorityOne/contextEngine/openDwell', '{"place":123}')
    expect(await loadOpenDwell()).toBeNull()
  })
})
