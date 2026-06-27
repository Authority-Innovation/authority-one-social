import {describe, expect, it} from '@jest/globals'

import {advanceDwell, shouldCaptureBackground} from '../derive'
import {type OpenDwell} from '../types'

const idFor = (at: number) => `id-${at}`

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

describe('advanceDwell (visit-style transition)', () => {
  const venue = {place: 'venue' as const, placeRef: 'Bar', confidence: 0.6}
  const home = {place: 'home' as const, placeRef: 'Home', confidence: 0.9}

  it('opens a dwell with no event when there is no prior place', () => {
    const {events, open} = advanceDwell(null, venue, 1_000, idFor)
    expect(events).toEqual([])
    expect(open).toEqual({
      place: 'venue',
      placeRef: 'Bar',
      confidence: 0.6,
      startAt: 1_000,
    })
  })

  it('records nothing while still at the same place (keeps the running dwell)', () => {
    const open: OpenDwell = {
      place: 'venue',
      placeRef: 'Bar',
      confidence: 0.6,
      startAt: 1_000,
    }
    const res = advanceDwell(open, venue, 5_000, idFor)
    expect(res.events).toEqual([])
    // The original arrival time is preserved (dwell keeps accruing).
    expect(res.open).toBe(open)
  })

  it('flushes the previous dwell as a conclusion on departure to a new place', () => {
    const open: OpenDwell = {
      place: 'venue',
      placeRef: 'Bar',
      confidence: 0.6,
      startAt: 0,
    }
    // 90 min later we arrive home.
    const now = 90 * 60_000
    const {events, open: next} = advanceDwell(open, home, now, idFor)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      place: 'venue',
      placeRef: 'Bar',
      confidence: 0.6,
      attention: {durationMin: 90},
      sources: ['location'],
    })
    expect(next).toEqual({
      place: 'home',
      placeRef: 'Home',
      confidence: 0.9,
      startAt: now,
    })
  })
})
