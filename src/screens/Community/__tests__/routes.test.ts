import {afterEach, describe, expect, it, jest} from '@jest/globals'

import {applyCommunitiesFlag} from '#/screens/Community/linking'
import {router} from '#/routes'

const FLAG = 'EXPO_PUBLIC_COMMUNITIES_ENABLED'
const saved = process.env[FLAG]

afterEach(() => {
  if (saved === undefined) delete process.env[FLAG]
  else process.env[FLAG] = saved
})

/*
 * COMMUNITIES_ENABLED is read once at module load, so the flag-on router has
 * to come from a fresh module registry.
 */
function loadRouterWithFlagOn() {
  process.env[FLAG] = 'true'
  let mod: typeof import('#/routes') | undefined
  jest.isolateModules(() => {
    mod = require('#/routes')
  })
  return mod!.router
}

describe('Community routes with Communities off (default build)', () => {
  it('router.matchPath sends /c/abc and /c/abc/members to Home', () => {
    expect(router.matchPath('/c/abc')).toEqual(['Home', {}])
    expect(router.matchPath('/c/abc/members')).toEqual(['Home', {}])
    expect(router.matchPath('/c/abc?x=1')).toEqual(['Home', {}])
  })

  it('leaves every other route alone', () => {
    expect(router.matchPath('/')).toEqual(['Home', {}])
    expect(router.matchPath('/profile/alice.test')).toEqual([
      'Profile',
      {name: 'alice.test'},
    ])
    expect(router.matchPath('/nope/x')).toEqual(['NotFound', {}])
  })

  it('still builds the community paths by name', () => {
    expect(router.matchName('Community')?.build({id: 'abc'})).toBe('/c/abc')
    expect(router.matchName('CommunityMembers')?.build({id: 'abc'})).toBe(
      '/c/abc/members',
    )
  })
})

describe('Community routes with Communities on', () => {
  it('router.matchPath resolves /c/:id and /c/:id/members', () => {
    const flagOnRouter = loadRouterWithFlagOn()
    expect(flagOnRouter.matchPath('/c/abc')).toEqual(['Community', {id: 'abc'}])
    expect(flagOnRouter.matchPath('/c/abc/members')).toEqual([
      'CommunityMembers',
      {id: 'abc'},
    ])
    expect(flagOnRouter.matchPath('/profile/alice.test')).toEqual([
      'Profile',
      {name: 'alice.test'},
    ])
  })
})

describe('applyCommunitiesFlag', () => {
  it('maps community routes to Home only when disabled', () => {
    expect(applyCommunitiesFlag(['Community', {id: 'abc'}], false)).toEqual([
      'Home',
      {},
    ])
    expect(
      applyCommunitiesFlag(['CommunityMembers', {id: 'abc'}], false),
    ).toEqual(['Home', {}])
    expect(applyCommunitiesFlag(['Community', {id: 'abc'}], true)).toEqual([
      'Community',
      {id: 'abc'},
    ])
    expect(applyCommunitiesFlag(['Profile', {name: 'a'}], false)).toEqual([
      'Profile',
      {name: 'a'},
    ])
  })
})
