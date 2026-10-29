import {afterEach, describe, expect, it, jest} from '@jest/globals'

const KEYS = [
  'EXPO_PUBLIC_COMMUNITIES_ENABLED',
  'EXPO_PUBLIC_COMMUNITY_SWITCHER',
  'EXPO_PUBLIC_LOCKED_COMMUNITY',
  'EXPO_PUBLIC_BRAND',
  'EXPO_PUBLIC_BRAND_SKIN',
]

const saved = Object.fromEntries(KEYS.map(k => [k, process.env[k]]))

function loadEnv(env: Record<string, string | undefined>) {
  for (const k of KEYS) delete process.env[k]
  Object.assign(process.env, env)
  let mod: typeof import('#/env/common') | undefined
  jest.isolateModules(() => {
    mod = require('#/env/common')
  })
  return mod!
}

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('Communities env flags', () => {
  it('are all off or empty when nothing is set', () => {
    const env = loadEnv({})
    expect(env.COMMUNITIES_ENABLED).toBe(false)
    expect(env.COMMUNITY_SWITCHER).toBe(false)
    expect(env.LOCKED_COMMUNITY).toBe('')
    expect(env.BRAND).toBe('authority-one')
    expect(env.BRAND_SKIN).toBe('')
  })

  it('stay off for the explicit eas.json values', () => {
    const env = loadEnv({
      EXPO_PUBLIC_COMMUNITIES_ENABLED: 'false',
      EXPO_PUBLIC_COMMUNITY_SWITCHER: 'false',
      EXPO_PUBLIC_LOCKED_COMMUNITY: '',
      EXPO_PUBLIC_BRAND: 'authority-one',
      EXPO_PUBLIC_BRAND_SKIN: '',
    })
    expect(env.COMMUNITIES_ENABLED).toBe(false)
    expect(env.COMMUNITY_SWITCHER).toBe(false)
    expect(env.LOCKED_COMMUNITY).toBe('')
    expect(env.BRAND).toBe('authority-one')
    expect(env.BRAND_SKIN).toBe('')
  })

  it('parse booleans like the other env flags', () => {
    expect(
      loadEnv({EXPO_PUBLIC_COMMUNITIES_ENABLED: 'true'}).COMMUNITIES_ENABLED,
    ).toBe(true)
    expect(
      loadEnv({EXPO_PUBLIC_COMMUNITY_SWITCHER: '1'}).COMMUNITY_SWITCHER,
    ).toBe(true)
    expect(
      loadEnv({EXPO_PUBLIC_COMMUNITIES_ENABLED: 'yes'}).COMMUNITIES_ENABLED,
    ).toBe(false)
  })
})

describe('eas.json', () => {
  const eas = require('../../../../eas.json') as {
    build: Record<string, {env?: Record<string, string>}>
  }

  // The one profile allowed to turn Communities on (Elliott ruling
  // 2026-10-29). Switcher and locked community stay off even here.
  const COMMUNITIES_PROFILE = 'development-communities'

  it('has the development-communities profile with Communities on', () => {
    expect(eas.build[COMMUNITIES_PROFILE]?.env).toEqual(
      expect.objectContaining({EXPO_PUBLIC_COMMUNITIES_ENABLED: 'true'}),
    )
  })

  it('sets every Communities key to its default in every profile', () => {
    const profiles = Object.keys(eas.build)
    expect(profiles.length).toBeGreaterThan(0)
    for (const profile of profiles) {
      expect([profile, eas.build[profile].env]).toEqual([
        profile,
        expect.objectContaining({
          EXPO_PUBLIC_COMMUNITIES_ENABLED:
            profile === COMMUNITIES_PROFILE ? 'true' : 'false',
          EXPO_PUBLIC_COMMUNITY_SWITCHER: 'false',
          EXPO_PUBLIC_LOCKED_COMMUNITY: '',
          EXPO_PUBLIC_BRAND: 'authority-one',
          EXPO_PUBLIC_BRAND_SKIN: '',
        }),
      ])
    }
  })
})
