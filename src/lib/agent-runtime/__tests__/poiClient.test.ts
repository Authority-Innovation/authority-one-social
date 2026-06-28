import {afterEach, describe, expect, it, jest} from '@jest/globals'

import {getSupabaseAccessToken} from '../authToken'
import {
  fetchNearbyPoi,
  normalizeNearbyPlace,
  pickNearestNamed,
} from '../poiClient'

jest.mock('../authToken', () => ({getSupabaseAccessToken: jest.fn()}))

const mockToken = jest.mocked(getSupabaseAccessToken)
const realFetch = global.fetch
afterEach(() => {
  global.fetch = realFetch
  mockToken.mockReset()
})

function okJson(body: unknown) {
  return jest.fn(() =>
    Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(body)}),
  ) as unknown as typeof fetch
}

describe('normalizeNearbyPlace (pure)', () => {
  it('tolerates name/title/label and distance aliases; drops nameless rows', () => {
    expect(
      normalizeNearbyPlace({title: 'Falls', dist: 12, type: 'waterfall'}),
    ).toEqual({
      name: 'Falls',
      category: 'waterfall',
      distanceM: 12,
      source: undefined,
    })
    expect(normalizeNearbyPlace({distanceM: 5})).toBeNull()
    expect(normalizeNearbyPlace(null)).toBeNull()
  })
})

describe('pickNearestNamed (pure)', () => {
  it('picks the nearest named place; tolerates bare array and {places}', () => {
    const fromObj = pickNearestNamed({
      places: [
        {name: 'Far', distanceM: 500},
        {name: 'Near', distanceM: 30},
      ],
    })
    expect(fromObj?.name).toBe('Near')
    const fromArr = pickNearestNamed([{name: 'Only'}])
    expect(fromArr?.name).toBe('Only')
  })
  it('returns null when there are no named places', () => {
    expect(pickNearestNamed({places: []})).toBeNull()
    expect(pickNearestNamed({})).toBeNull()
  })
})

describe('fetchNearbyPoi', () => {
  const coords = {lat: 36, lng: -79}

  it('returns null (no fetch) when signed out', async () => {
    mockToken.mockResolvedValue(null)
    const spy = okJson({places: [{name: 'X'}]})
    global.fetch = spy
    expect(await fetchNearbyPoi(coords, 150)).toBeNull()
    expect((spy as unknown as jest.Mock).mock.calls).toHaveLength(0)
  })

  it('GETs the proxy with lat/lon/radius and returns the nearest named place', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = okJson({
      places: [
        {name: 'Wairere Falls Track', distanceM: 40, category: 'trail'},
        {name: 'Car park', distanceM: 90},
      ],
    })
    const out = await fetchNearbyPoi(coords, 150)
    const call = (global.fetch as unknown as jest.Mock).mock.calls[0]
    expect(String(call[0])).toContain('/app/poi/nearby')
    expect(String(call[0])).toContain('lat=36')
    expect(String(call[0])).toContain('radius=150')
    expect(out?.name).toBe('Wairere Falls Track')
  })

  it('returns null on non-ok (degrades, e.g. proxy not deployed)', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() =>
      Promise.resolve({ok: false, status: 404}),
    ) as unknown as typeof fetch
    expect(await fetchNearbyPoi(coords, 150)).toBeNull()
  })

  it('never throws on network error', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() => Promise.reject(new Error('offline')))
    expect(await fetchNearbyPoi(coords, 150)).toBeNull()
  })
})
