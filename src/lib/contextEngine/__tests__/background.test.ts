import {describe, expect, it} from '@jest/globals'

import {
  advanceDwell,
  closeDwell,
  isInTransit,
  shouldCaptureBackground,
} from '../derive'
import {type OpenDwell} from '../types'

const idFor = (at: number) => `id-${at}`

// ~33 m and ~222 m north of the anchor (dwellRadius default is 75 m).
const ANCHOR = {lat: 35.7796, lng: -78.6382}
const WITHIN = {lat: ANCHOR.lat + 0.0003, lng: ANCHOR.lng}
const BEYOND = {lat: ANCHOR.lat + 0.002, lng: ANCHOR.lng}
const MIN = 60_000

describe('shouldCaptureBackground (Phase 1.5 gate)', () => {
  it('captures ONLY when background opt-in AND Always permission are both on', () => {
    expect(
      shouldCaptureBackground({
        backgroundEnabled: true,
        backgroundPermissionGranted: true,
      }),
    ).toBe(true)
  })

  it('captures nothing when off or permission missing', () => {
    expect(
      shouldCaptureBackground({
        backgroundEnabled: false,
        backgroundPermissionGranted: true,
      }),
    ).toBe(false)
    expect(
      shouldCaptureBackground({
        backgroundEnabled: true,
        backgroundPermissionGranted: false,
      }),
    ).toBe(false)
    expect(
      shouldCaptureBackground({
        backgroundEnabled: false,
        backgroundPermissionGranted: false,
      }),
    ).toBe(false)
  })
})

describe('isInTransit (motion detection)', () => {
  it('uses GPS speed when valid', () => {
    expect(isInTransit(10, undefined, 1_000, ANCHOR)).toBe(true)
    expect(isInTransit(1, undefined, 1_000, ANCHOR)).toBe(false)
  })
  it('falls back to displacement / time when speed is unknown', () => {
    // ~222 m in 1 s -> clearly moving.
    expect(isInTransit(-1, {coords: ANCHOR, at: 0}, 1_000, BEYOND)).toBe(true)
    // ~33 m over 60 s -> ~0.55 m/s -> not moving.
    expect(isInTransit(null, {coords: ANCHOR, at: 0}, 60_000, WITHIN)).toBe(
      false,
    )
  })
  it('is not-moving when speed is unknown and there is no prior sample', () => {
    expect(isInTransit(null, undefined, 1_000, ANCHOR)).toBe(false)
  })
})

describe('closeDwell (threshold-gated flush)', () => {
  it('emits nothing for null or a sub-threshold dwell', () => {
    expect(closeDwell(null, 1_000, idFor)).toEqual([])
    const short: OpenDwell = {
      place: 'venue',
      placeRef: 'Bar',
      confidence: 0.6,
      startAt: 0,
      lastAt: 1_000, // 1 s — a drive-by
    }
    expect(closeDwell(short, 2_000, idFor)).toEqual([])
  })
  it('emits one event with the dwell duration once the threshold is met', () => {
    const dwell: OpenDwell = {
      place: 'venue',
      placeRef: 'Bar',
      confidence: 0.6,
      startAt: 0,
      lastAt: 5 * MIN,
    }
    const out = closeDwell(dwell, 6 * MIN, idFor)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      place: 'venue',
      placeRef: 'Bar',
      attention: {durationMin: 5},
      sources: ['location'],
    })
  })
})

describe('advanceDwell (dwell + transit gating)', () => {
  const venue = {place: 'venue' as const, placeRef: 'Bar', confidence: 0.6}
  const home = {place: 'home' as const, placeRef: 'Home', confidence: 0.9}

  it('opens a dwell with no event when stationary and no prior place', () => {
    const {events, open} = advanceDwell(
      null,
      {coords: ANCHOR, speedMps: 0, conclusion: venue},
      1_000,
      idFor,
    )
    expect(events).toEqual([])
    expect(open).toMatchObject({
      place: 'venue',
      placeRef: 'Bar',
      startAt: 1_000,
      lastAt: 1_000,
      anchor: ANCHOR,
    })
  })

  it('keeps accruing (no event) while within the dwell radius', () => {
    const open: OpenDwell = {
      place: 'venue',
      placeRef: 'Bar',
      confidence: 0.6,
      startAt: 1_000,
      lastAt: 1_000,
      anchor: ANCHOR,
      lastCoords: ANCHOR,
    }
    const res = advanceDwell(
      open,
      {coords: WITHIN, speedMps: 0, conclusion: venue},
      5_000,
      idFor,
    )
    expect(res.events).toEqual([])
    expect(res.open?.startAt).toBe(1_000) // arrival preserved
    expect(res.open?.lastAt).toBe(5_000) // dwell extended
  })

  it('SUPPRESSES logging while moving and drops a sub-threshold dwell', () => {
    const open: OpenDwell = {
      place: 'venue',
      placeRef: '49 Burwood Rd',
      confidence: 0.6,
      startAt: 1_000,
      lastAt: 2_000,
      anchor: ANCHOR,
      lastCoords: ANCHOR,
    }
    const res = advanceDwell(
      open,
      {coords: BEYOND, speedMps: 12, conclusion: home},
      3_000,
      idFor,
    )
    expect(res.events).toEqual([]) // 1 s dwell -> drive-by -> nothing
    expect(res.open).toBeNull() // in transit -> no open place
  })

  it('logs a real prior dwell when departing in transit, then carries no place', () => {
    const open: OpenDwell = {
      place: 'venue',
      placeRef: 'Bar',
      confidence: 0.6,
      startAt: 0,
      lastAt: 5 * MIN,
      anchor: ANCHOR,
      lastCoords: ANCHOR,
    }
    const now = 5 * MIN + 1_000
    const res = advanceDwell(
      open,
      {coords: BEYOND, speedMps: 12, conclusion: home},
      now,
      idFor,
    )
    expect(res.events).toHaveLength(1)
    expect(res.events[0]).toMatchObject({
      place: 'venue',
      attention: {durationMin: 5},
    })
    expect(res.open).toBeNull()
  })

  it('a string of driving addresses logs NOTHING (the reported bug)', () => {
    let open: OpenDwell | null = null
    const events = []
    for (let i = 0; i < 6; i++) {
      const res = advanceDwell(
        open,
        {
          coords: {lat: ANCHOR.lat + i * 0.001, lng: ANCHOR.lng},
          speedMps: 12,
          conclusion: {
            place: 'venue',
            placeRef: `${49 + i} Burwood Rd`,
            confidence: 0.6,
          },
        },
        1_000 * (i + 1),
        idFor,
      )
      open = res.open
      events.push(...res.events)
    }
    expect(events).toEqual([])
  })
})
