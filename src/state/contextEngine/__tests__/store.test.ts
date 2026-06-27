import {beforeEach, describe, expect, it} from '@jest/globals'

import {type ContextEvent} from '#/lib/contextEngine/types'
import {
  appendEvent,
  clearEvents,
  DEFAULT_PREFS,
  deleteEvent,
  loadEvents,
  loadPrefs,
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

function ev(id: string, at: number): ContextEvent {
  return {
    id,
    at,
    place: 'venue',
    placeRef: 'Bar',
    attention: {durationMin: 5},
    confidence: 0.6,
    sources: ['location'],
  }
}

describe('prefs', () => {
  it('defaults to OFF when nothing is stored', async () => {
    expect(await loadPrefs()).toEqual(DEFAULT_PREFS)
    expect((await loadPrefs()).enabled).toBe(false)
  })

  it('round-trips enabled + anchors', async () => {
    await savePrefs({
      enabled: true,
      home: {lat: 1, lng: 2, label: 'Home'},
    })
    expect(await loadPrefs()).toEqual({
      enabled: true,
      backgroundEnabled: false,
      home: {lat: 1, lng: 2, label: 'Home'},
      work: undefined,
    })
  })
})

describe('events', () => {
  it('appends newest-first and lists them', async () => {
    await appendEvent(ev('a', 1))
    const after = await appendEvent(ev('b', 2))
    expect(after.map(e => e.id)).toEqual(['b', 'a'])
    expect((await loadEvents()).map(e => e.id)).toEqual(['b', 'a'])
  })

  it('deletes a single entry by id', async () => {
    await appendEvent(ev('a', 1))
    await appendEvent(ev('b', 2))
    const after = await deleteEvent('a')
    expect(after.map(e => e.id)).toEqual(['b'])
  })

  it('clears all entries', async () => {
    await appendEvent(ev('a', 1))
    await clearEvents()
    expect(await loadEvents()).toEqual([])
  })

  it('returns [] when nothing is stored', async () => {
    expect(await loadEvents()).toEqual([])
  })
})
