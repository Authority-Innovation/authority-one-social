import {describe, expect, it} from '@jest/globals'

import {
  clampIndex,
  isWithinWindow,
  preloadWindow,
  shouldAutoplay,
} from '../feedPager'

describe('clampIndex', () => {
  it('clamps into [0, total)', () => {
    expect(clampIndex(-3, 5)).toBe(0)
    expect(clampIndex(9, 5)).toBe(4)
    expect(clampIndex(2, 5)).toBe(2)
  })
  it('returns 0 for an empty list', () => {
    expect(clampIndex(3, 0)).toBe(0)
  })
})

describe('preloadWindow', () => {
  it('preloads the next 2 and previous 1 by default', () => {
    expect(preloadWindow({focusIndex: 5, total: 20})).toEqual([4, 5, 6, 7])
  })
  it('clamps at the start', () => {
    expect(preloadWindow({focusIndex: 0, total: 20})).toEqual([0, 1, 2])
  })
  it('clamps at the end', () => {
    expect(preloadWindow({focusIndex: 19, total: 20})).toEqual([18, 19])
  })
  it('honors custom ahead/behind', () => {
    expect(preloadWindow({focusIndex: 5, total: 20, ahead: 1, behind: 0})).toEqual([
      5, 6,
    ])
  })
  it('returns [] when empty', () => {
    expect(preloadWindow({focusIndex: 0, total: 0})).toEqual([])
  })
})

describe('shouldAutoplay', () => {
  it('only the focused item autoplays', () => {
    expect(shouldAutoplay(3, 3)).toBe(true)
    expect(shouldAutoplay(2, 3)).toBe(false)
  })
})

describe('isWithinWindow', () => {
  it('matches preloadWindow membership', () => {
    const args = {focusIndex: 5, total: 20}
    expect(isWithinWindow(7, args)).toBe(true)
    expect(isWithinWindow(8, args)).toBe(false)
  })
})
