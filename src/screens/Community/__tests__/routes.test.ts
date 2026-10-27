import {describe, expect, it} from '@jest/globals'

import {applyCommunitiesFlag} from '#/screens/Community/linking'
import {router} from '#/routes'

describe('Community routes', () => {
  it('resolve /c/:id and /c/:id/members', () => {
    expect(router.matchPath('/c/abc')).toEqual(['Community', {id: 'abc'}])
    expect(router.matchPath('/c/abc/members')).toEqual([
      'CommunityMembers',
      {id: 'abc'},
    ])
  })

  it('build back to the same paths', () => {
    expect(router.matchName('Community')?.build({id: 'abc'})).toBe('/c/abc')
    expect(router.matchName('CommunityMembers')?.build({id: 'abc'})).toBe(
      '/c/abc/members',
    )
  })
})

describe('deep links with Communities off', () => {
  it('lands /c/abc and /c/abc/members on Home (default build)', () => {
    expect(applyCommunitiesFlag(router.matchPath('/c/abc'))).toEqual([
      'Home',
      {},
    ])
    expect(applyCommunitiesFlag(router.matchPath('/c/abc/members'))).toEqual([
      'Home',
      {},
    ])
  })

  it('leaves community routes alone when the flag is on', () => {
    expect(applyCommunitiesFlag(router.matchPath('/c/abc'), true)).toEqual([
      'Community',
      {id: 'abc'},
    ])
  })

  it('leaves every other route alone', () => {
    for (const path of ['/', '/profile/alice.test', '/messages', '/nope/x']) {
      expect(applyCommunitiesFlag(router.matchPath(path))).toEqual(
        router.matchPath(path),
      )
      expect(applyCommunitiesFlag(router.matchPath(path), true)).toEqual(
        router.matchPath(path),
      )
    }
  })
})
