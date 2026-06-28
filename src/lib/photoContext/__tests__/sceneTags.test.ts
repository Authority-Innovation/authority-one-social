import {describe, expect, it} from '@jest/globals'

import {fusePlaceAndScene, normalizeSceneTags} from '../sceneTags'

describe('normalizeSceneTags', () => {
  it('maps synonyms, keeps known tags, dedupes, drops unknown', () => {
    expect(
      normalizeSceneTags(['Woods', 'trail', 'waterfall', 'forest', 'banana']),
    ).toEqual(['forest', 'trail', 'water'])
  })
  it('returns [] for non-arrays / empty', () => {
    expect(normalizeSceneTags(undefined)).toEqual([])
    expect(normalizeSceneTags('forest')).toEqual([])
    expect(normalizeSceneTags([])).toEqual([])
  })
})

describe('fusePlaceAndScene', () => {
  it('fuses trail/forest at an outdoor place into hiking', () => {
    expect(
      fusePlaceAndScene({
        place: 'venue',
        placeRef: 'Wairere Falls Track',
        tags: ['forest', 'trail'],
      }),
    ).toBe('hiking')
  })
  it('infers eating from food regardless of place', () => {
    expect(fusePlaceAndScene({place: 'unknown', tags: ['food']})).toBe('eating')
  })
  it('infers from a trail placeRef even when place is generic', () => {
    expect(
      fusePlaceAndScene({
        place: 'out',
        placeRef: 'Wairere Falls track',
        tags: ['rocks'],
      }),
    ).toBe('hiking')
  })
  it('returns undefined when nothing combines', () => {
    expect(fusePlaceAndScene({place: 'home', tags: []})).toBeUndefined()
    expect(fusePlaceAndScene({place: 'home', tags: ['indoor']})).toBeUndefined()
  })
})
