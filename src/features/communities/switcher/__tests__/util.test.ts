import {describe, expect, it} from '@jest/globals'

import {clientCommunity} from '#/lib/communities/__fixtures__/door'
import {resolveSelection, safeAccent, toSwitcherCommunities} from '../util'

describe('switcher util', () => {
  it('accepts hex accents only', () => {
    expect(safeAccent('#abc')).toBe('#abc')
    expect(safeAccent('#C8102E')).toBe('#C8102E')
    expect(safeAccent('#C8102EFF')).toBe('#C8102EFF')
    expect(safeAccent('red')).toBeUndefined()
    expect(safeAccent('#12')).toBeUndefined()
    expect(safeAccent(null)).toBeUndefined()
    expect(safeAccent(42)).toBeUndefined()
  })

  it('keeps only renderable, unique communities', () => {
    expect(toSwitcherCommunities(null)).toEqual([])
    expect(
      toSwitcherCommunities([
        {id: 'a', name: 'A'},
        {id: 'a', name: 'A again'},
        {id: ' ', name: 'blank'},
        {id: 'b'},
        null,
        'c',
        {id: 'd', name: 'D'},
      ]).map(c => c.id),
    ).toEqual(['a', 'd'])
  })

  it('falls back to "All" for a community no longer listed', () => {
    const list = [clientCommunity({id: 'a', name: 'A'})]
    expect(resolveSelection('communities', list)).toBe('communities')
    expect(resolveSelection('community|a', list)).toBe('community|a')
    expect(resolveSelection('community|gone', list)).toBe('communities')
    expect(resolveSelection('community|a', [])).toBe('communities')
  })
})
