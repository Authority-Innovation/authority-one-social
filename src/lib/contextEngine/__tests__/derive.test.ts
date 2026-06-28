import {describe, expect, it} from '@jest/globals'

import {
  buildContextEvent,
  derivePlace,
  dwellMinutes,
  geocodeVenueName,
  haversineMeters,
  isBareStreetName,
  matchAnchor,
  matchLabeledPlace,
  needsPoiLookup,
  placeChanged,
  shouldCapture,
} from '../derive'
import {type ContextPrefs, type LabeledPlace} from '../types'

const RALEIGH = {lat: 35.7796, lng: -78.6382}

describe('haversineMeters', () => {
  it('is 0 for identical points and ~111m per 0.001° latitude', () => {
    expect(haversineMeters(RALEIGH, RALEIGH)).toBe(0)
    const d = haversineMeters(RALEIGH, {
      lat: RALEIGH.lat + 0.001,
      lng: RALEIGH.lng,
    })
    expect(d).toBeGreaterThan(100)
    expect(d).toBeLessThan(125)
  })
})

describe('matchAnchor', () => {
  const prefs: ContextPrefs = {
    enabled: true,
    home: {lat: RALEIGH.lat, lng: RALEIGH.lng, label: 'Home'},
    work: {lat: 35.7986, lng: -78.6442, label: 'Work'},
  }
  it('matches a sample within the anchor radius', () => {
    expect(
      matchAnchor({lat: RALEIGH.lat + 0.0005, lng: RALEIGH.lng}, prefs),
    ).toBe('home')
  })
  it('returns undefined when far from any anchor', () => {
    expect(matchAnchor({lat: 36.5, lng: -79.5}, prefs)).toBeUndefined()
  })
})

describe('derivePlace', () => {
  const homePrefs: ContextPrefs = {
    enabled: true,
    home: {lat: RALEIGH.lat, lng: RALEIGH.lng, label: 'Home'},
  }

  it('prefers a user-set anchor (high confidence)', () => {
    expect(derivePlace({coords: RALEIGH, prefs: homePrefs})).toEqual({
      place: 'home',
      placeRef: 'Home',
      confidence: 0.9,
    })
  })

  it('derives a venue from a named POI distinct from the street', () => {
    const res = derivePlace({
      coords: {lat: 36, lng: -79},
      geocode: {
        name: 'Lenovo Center',
        street: '1400 Edwards Mill Rd',
        city: 'Raleigh',
      },
      prefs: {enabled: true},
    })
    expect(res.place).toBe('venue')
    expect(res.placeRef).toBe('Lenovo Center')
  })

  it("derives 'out' from a city when there's no distinct POI", () => {
    const res = derivePlace({
      coords: {lat: 36, lng: -79},
      geocode: {name: '100 Main St', street: '100 Main St', city: 'Durham'},
      prefs: {enabled: true},
    })
    expect(res.place).toBe('out')
    expect(res.placeRef).toBe('Durham')
  })

  it("is 'unknown' with no geocode", () => {
    expect(
      derivePlace({coords: {lat: 36, lng: -79}, prefs: {enabled: true}}),
    ).toEqual({place: 'unknown', confidence: 0.2})
  })

  it("does NOT treat a bare street number as a venue (the 'Venue · 3471' bug)", () => {
    const res = derivePlace({
      coords: {lat: 36, lng: -79},
      geocode: {name: '3471', street: 'Goodwin Rd', city: 'Matamata'},
      prefs: {enabled: true},
    })
    // Bare number rejected -> falls through to the city.
    expect(res).toEqual({place: 'out', placeRef: 'Matamata', confidence: 0.4})
  })

  it('uses a NAMED POI from the proxy over a bare-number geocode', () => {
    const res = derivePlace({
      coords: {lat: 36, lng: -79},
      geocode: {name: '3471', street: 'Goodwin Rd', city: 'Matamata'},
      prefs: {enabled: true},
      poi: {name: 'Wairere Falls Track'},
    })
    expect(res.place).toBe('venue')
    expect(res.placeRef).toBe('Wairere Falls Track')
  })

  it('prefers a user-LABELED place over POI/geocode/anchor', () => {
    const places: LabeledPlace[] = [
      {id: 'p1', name: 'Sports Practice', lat: 36, lon: -79, radiusM: 150},
    ]
    const res = derivePlace({
      coords: {lat: 36, lng: -79},
      geocode: {name: 'Some Gym', street: 'Field Rd', city: 'Matamata'},
      prefs: {enabled: true, places},
      poi: {name: 'A POI'},
    })
    expect(res).toEqual({
      place: 'named',
      placeRef: 'Sports Practice',
      confidence: 0.95,
    })
  })
})

describe('isBareStreetName', () => {
  it('flags bare numbers and number ranges, not real names', () => {
    expect(isBareStreetName('3471')).toBe(true)
    expect(isBareStreetName('49a')).toBe(true)
    expect(isBareStreetName('49-51')).toBe(true)
    expect(isBareStreetName('  ')).toBe(true)
    expect(isBareStreetName(undefined)).toBe(true)
    expect(isBareStreetName('Wairere Falls')).toBe(false)
    expect(isBareStreetName('Lenovo Center')).toBe(false)
  })
})

describe('geocodeVenueName', () => {
  it('returns a real name distinct from the street, else undefined', () => {
    expect(
      geocodeVenueName({name: 'Lenovo Center', street: '1400 Edwards Mill Rd'}),
    ).toBe('Lenovo Center')
    expect(
      geocodeVenueName({name: '3471', street: 'Goodwin Rd'}),
    ).toBeUndefined()
    expect(
      geocodeVenueName({name: 'Main St', street: 'Main St'}),
    ).toBeUndefined()
  })
})

describe('matchLabeledPlace', () => {
  const places: LabeledPlace[] = [
    {id: 'a', name: 'School', lat: 35.7796, lon: -78.6382, radiusM: 150},
    {id: 'b', name: 'Home', lat: 35.79, lon: -78.64, radiusM: 100},
  ]
  it('matches within the geofence and picks the nearest', () => {
    expect(matchLabeledPlace({lat: 35.7797, lng: -78.6382}, places)?.name).toBe(
      'School',
    )
  })
  it('returns undefined when outside all geofences or no places', () => {
    expect(matchLabeledPlace({lat: 36.5, lng: -79.5}, places)).toBeUndefined()
    expect(matchLabeledPlace({lat: 36, lng: -79}, [])).toBeUndefined()
    expect(matchLabeledPlace({lat: 36, lng: -79}, undefined)).toBeUndefined()
  })
})

describe('needsPoiLookup', () => {
  const coords = {lat: 36, lng: -79}
  it('true only when no labeled/anchor/named-venue would resolve', () => {
    // Bare-number geocode, no labels/anchors -> POI could help.
    expect(
      needsPoiLookup({
        coords,
        geocode: {name: '3471', street: 'Goodwin Rd'},
        prefs: {enabled: true},
      }),
    ).toBe(true)
    // Already a named venue -> skip the lookup.
    expect(
      needsPoiLookup({
        coords,
        geocode: {name: 'Lenovo Center', street: '1400 Edwards Mill Rd'},
        prefs: {enabled: true},
      }),
    ).toBe(false)
    // A labeled place matches -> skip the lookup.
    expect(
      needsPoiLookup({
        coords,
        geocode: {name: '3471', street: 'Goodwin Rd'},
        prefs: {
          enabled: true,
          places: [
            {id: 'p', name: 'Trailhead', lat: 36, lon: -79, radiusM: 150},
          ],
        },
      }),
    ).toBe(false)
  })
})

describe('dwellMinutes', () => {
  it('rounds to whole minutes and never goes negative', () => {
    expect(dwellMinutes(0, 90_000)).toBe(2) // 1.5 min -> 2
    expect(dwellMinutes(1000, 0)).toBe(0)
  })
})

describe('placeChanged', () => {
  it('true on first sample and when place or ref differs', () => {
    expect(placeChanged(null, {place: 'home'})).toBe(true)
    expect(
      placeChanged(
        {place: 'venue', placeRef: 'A'},
        {place: 'venue', placeRef: 'B'},
      ),
    ).toBe(true)
    expect(
      placeChanged(
        {place: 'home', placeRef: 'Home'},
        {place: 'home', placeRef: 'Home'},
      ),
    ).toBe(false)
  })
})

describe('buildContextEvent', () => {
  it('builds a conclusion-only event with sources=[location]', () => {
    expect(
      buildContextEvent({
        id: 'e1',
        at: 5,
        place: 'venue',
        placeRef: 'Bar',
        confidence: 0.6,
        durationMin: 12,
      }),
    ).toEqual({
      id: 'e1',
      at: 5,
      place: 'venue',
      placeRef: 'Bar',
      attention: {durationMin: 12},
      confidence: 0.6,
      sources: ['location'],
    })
  })
})

describe('shouldCapture (opt-in gate)', () => {
  it('captures ONLY when enabled AND permission granted', () => {
    expect(shouldCapture({enabled: true, permissionGranted: true})).toBe(true)
    expect(shouldCapture({enabled: false, permissionGranted: true})).toBe(false)
    expect(shouldCapture({enabled: true, permissionGranted: false})).toBe(false)
    expect(shouldCapture({enabled: false, permissionGranted: false})).toBe(
      false,
    )
  })
})
