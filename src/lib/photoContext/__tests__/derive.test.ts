import {describe, expect, it} from '@jest/globals'

import {
  derivePhotoConclusion,
  describeConclusion,
  localDayKey,
  shouldReadPhotos,
  summarizePhotos,
} from '../derive'
import {type PhotoMeta} from '../types'

describe('shouldReadPhotos (opt-in gate)', () => {
  it('reads ONLY when enabled AND permission granted', () => {
    expect(
      shouldReadPhotos({enabled: true, permissionGranted: true}),
    ).toBe(true)
  })

  it('reads nothing when off or unpermitted', () => {
    expect(shouldReadPhotos({enabled: false, permissionGranted: true})).toBe(false)
    expect(shouldReadPhotos({enabled: true, permissionGranted: false})).toBe(false)
    expect(shouldReadPhotos({enabled: false, permissionGranted: false})).toBe(false)
  })
})

describe('summarizePhotos', () => {
  it('returns zeros for an empty day', () => {
    expect(summarizePhotos([])).toEqual({count: 0, firstAt: 0, lastAt: 0})
  })

  it('computes count, time window, and a centroid from located photos', () => {
    const photos: PhotoMeta[] = [
      {at: 300, lat: 10, lng: 20},
      {at: 100},
      {at: 500, lat: 12, lng: 22},
    ]
    const s = summarizePhotos(photos)
    expect(s.count).toBe(3)
    expect(s.firstAt).toBe(100)
    expect(s.lastAt).toBe(500)
    expect(s.centroid).toEqual({lat: 11, lng: 21})
  })

  it('omits the centroid when no photo has GPS', () => {
    expect(summarizePhotos([{at: 1}, {at: 2}]).centroid).toBeUndefined()
  })
})

describe('localDayKey', () => {
  it('formats a Date as YYYY-MM-DD (local calendar day)', () => {
    // Constructed from local components, so this is TZ-independent.
    expect(localDayKey(new Date(2024, 5, 9))).toBe('2024-06-09')
    expect(localDayKey(new Date(2025, 11, 31))).toBe('2025-12-31')
  })
})

describe('derivePhotoConclusion', () => {
  it('returns null for an empty day (nothing to sync)', () => {
    expect(
      derivePhotoConclusion({photos: [], dayKey: '2024-06-09', id: 'x'}),
    ).toBeNull()
  })

  it('builds a conclusion-only photo event (no coordinates)', () => {
    const photos: PhotoMeta[] = [
      {at: 100, lat: 10, lng: 20},
      {at: 400, lat: 12, lng: 22},
    ]
    const c = derivePhotoConclusion({
      photos,
      dayKey: '2024-06-09',
      id: 'c1',
      place: 'venue',
      placeRef: 'Zoo',
    })
    expect(c).toEqual({
      id: 'c1',
      source: 'photos',
      date: '2024-06-09',
      count: 2,
      firstAt: 100,
      lastAt: 400,
      place: 'venue',
      placeRef: 'Zoo',
    })
    // No lat/lng anywhere on the conclusion.
    expect(JSON.stringify(c)).not.toContain('"lat"')
    expect(JSON.stringify(c)).not.toContain('"lng"')
  })
})

describe('describeConclusion', () => {
  it('summarizes count + place for the UI', () => {
    expect(
      describeConclusion({
        id: 'c',
        source: 'photos',
        date: '2024-06-09',
        count: 12,
        firstAt: 0,
        lastAt: 0,
        placeRef: 'Raleigh',
      }),
    ).toBe('12 photos · near Raleigh')
    expect(
      describeConclusion({
        id: 'c',
        source: 'photos',
        date: '2024-06-09',
        count: 1,
        firstAt: 0,
        lastAt: 0,
      }),
    ).toBe('1 photo')
  })
})
