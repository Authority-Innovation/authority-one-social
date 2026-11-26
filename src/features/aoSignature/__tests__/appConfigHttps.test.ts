import {describe, expect, it} from '@jest/globals'

// The resolved Expo config for the claimed https callback (Community iOS,
// 2026-11-26): what a build ACTUALLY carries, not just the helper's answer.
// Dark (nothing set) must stay exactly as before: iOS 17.0, scheme 'one', the
// brand's associated domains only.

const appConfig = require('../../../../app.config.js') as (c: object) => {
  expo: unknown
}
const {resolveConfigJson} = require('../../../../scripts/brand-config/matrix.js') as {
  resolveConfigJson: (
    fn: (c: object) => unknown,
    env: Record<string, string>,
  ) => string
}

type Resolved = {
  expo: {
    scheme: string | string[]
    ios: {associatedDomains?: string[]}
    plugins: unknown[]
  }
}

const HTTPS_ENV = {
  EXPO_PUBLIC_AO_SIGNATURE_ISSUER: 'https://janus.test/auth/v1',
  EXPO_PUBLIC_AO_SIGNATURE_RUNTIME_URL:
    'https://authority-one-agent-runtime.e-479.workers.dev',
  EXPO_PUBLIC_AO_SIGNATURE_CLIENT_ID_IOS: 'community-ios-dev',
  EXPO_PUBLIC_AO_SIGNATURE_APP_REDIRECT_URI:
    'https://app-dev.authority-one.com/auth/janus/community/app-callback',
}

function resolve(env: Record<string, string>): Resolved {
  return JSON.parse(resolveConfigJson(appConfig, env)) as Resolved
}

function iosFloor(c: Resolved): string {
  const p = c.expo.plugins.find(
    x => Array.isArray(x) && x[0] === 'expo-build-properties',
  ) as [string, {ios: {deploymentTarget: string}}]
  return p[1].ios.deploymentTarget
}

describe('app.config.js: the claimed https callback', () => {
  it('dark: iOS 17.0, scheme one, the brand associated domains only', () => {
    const c = resolve({PAID_SIGNING: '1', EAS_BUILD_PLATFORM: 'ios'})
    expect(iosFloor(c)).toBe('17.0')
    expect(c.expo.scheme).toBe('one')
    expect(c.expo.ios.associatedDomains).toEqual(['applinks:authority-one.com'])
  })

  it('armed (iOS, paid): applinks + webcredentials for the callback host, the 17.4 floor, no extra scheme', () => {
    const c = resolve({
      ...HTTPS_ENV,
      PAID_SIGNING: '1',
      EAS_BUILD_PLATFORM: 'ios',
    })
    expect(iosFloor(c)).toBe('17.4')
    expect(c.expo.scheme).toBe('one')
    expect(c.expo.ios.associatedDomains).toEqual([
      'applinks:authority-one.com',
      'applinks:app-dev.authority-one.com',
      'webcredentials:app-dev.authority-one.com',
    ])
  })

  it('armed on a local prebuild (no EAS platform) is the iOS answer', () => {
    const c = resolve({...HTTPS_ENV, PAID_SIGNING: '1'})
    expect(iosFloor(c)).toBe('17.4')
    expect(c.expo.ios.associatedDomains).toContain(
      'webcredentials:app-dev.authority-one.com',
    )
  })

  it('an Android build is untouched by the iOS-only https mode', () => {
    const c = resolve({
      ...HTTPS_ENV,
      PAID_SIGNING: '1',
      EAS_BUILD_PLATFORM: 'android',
    })
    expect(iosFloor(c)).toBe('17.0')
    expect(c.expo.scheme).toBe('one')
  })

  it('a free-team build has no associated domains at all (the https callback cannot work there; see the report)', () => {
    const c = resolve({...HTTPS_ENV, EAS_BUILD_PLATFORM: 'ios'})
    expect(c.expo.ios.associatedDomains).toBeUndefined()
  })

  it('a half config (no iOS client) stays dark', () => {
    const c = resolve({
      ...HTTPS_ENV,
      EXPO_PUBLIC_AO_SIGNATURE_CLIENT_ID_IOS: '',
      PAID_SIGNING: '1',
      EAS_BUILD_PLATFORM: 'ios',
    })
    expect(iosFloor(c)).toBe('17.0')
    expect(c.expo.ios.associatedDomains).toEqual(['applinks:authority-one.com'])
  })
})
