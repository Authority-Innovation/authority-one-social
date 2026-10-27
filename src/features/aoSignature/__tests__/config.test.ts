import {describe, expect, it} from '@jest/globals'

import {
  AO_SIGNATURE_CONFIG,
  isAOSignatureArmed,
  parseAOSignatureConfig,
} from '../config'

const RT = 'https://runtime.test'
const full = {
  issuer: 'https://janus.test/auth/v1',
  runtimeUrl: 'https://runtime.test/',
  clientIdIos: 'ao-ios',
  clientIdAndroid: 'ao-android',
  clientIdWeb: 'ao-web',
  scheme: 'authorityone-dev',
  appRedirectUri: 'https://app-dev.test/auth/janus/app-callback',
  webRedirectUri: 'https://web.test/auth/janus/callback',
}

describe('AO Signature config (dark by default)', () => {
  it('is DARK in this build: no env set ⇒ null', () => {
    expect(AO_SIGNATURE_CONFIG).toBeNull()
    expect(isAOSignatureArmed()).toBe(false)
  })

  it('unset / empty env ⇒ null on every platform', () => {
    for (const p of ['ios', 'android', 'web']) {
      expect(parseAOSignatureConfig({}, p, RT)).toBeNull()
    }
  })

  it('arms iOS with the iOS client and the bounce', () => {
    const c = parseAOSignatureConfig(full, 'ios', RT)
    expect(c).toMatchObject({
      platform: 'ios',
      clientId: 'ao-ios',
      runtimeUrl: 'https://runtime.test',
      redirectUri: 'https://app-dev.test/auth/janus/app-callback',
      scheme: 'authorityone-dev',
      callbackUrl: 'authorityone-dev://auth/janus/app-callback',
      authorizeUrl: 'https://janus.test/auth/v1/oauth/authorize',
      scopes: 'openid email profile',
    })
  })

  it('Android uses its own client id; the android-callback path is accepted', () => {
    const c = parseAOSignatureConfig(
      {
        ...full,
        appRedirectUri: 'https://app-dev.test/auth/janus/android-callback',
      },
      'android',
      RT,
    )
    expect(c?.clientId).toBe('ao-android')
    expect(c?.callbackUrl).toBe('authorityone-dev://auth/janus/app-callback')
  })

  it('web uses the web client + the web callback, no scheme', () => {
    const c = parseAOSignatureConfig(full, 'web', RT)
    expect(c).toMatchObject({
      clientId: 'ao-web',
      redirectUri: 'https://web.test/auth/janus/callback',
      scheme: null,
      callbackUrl: null,
    })
  })

  it('a branded authorize host replaces only the authorize leg', () => {
    const c = parseAOSignatureConfig(
      {...full, authorizeBase: 'https://signature.test/auth/v1/'},
      'ios',
      RT,
    )
    expect(c?.authorizeUrl).toBe(
      'https://signature.test/auth/v1/oauth/authorize',
    )
    expect(c?.issuer).toBe('https://janus.test/auth/v1')
  })

  it.each([
    ['missing platform client', {...full, clientIdIos: ''}, 'ios'],
    ['a client LIST', {...full, clientIdIos: 'a,b'}, 'ios'],
    ['http issuer', {...full, issuer: 'http://janus.test/auth/v1'}, 'ios'],
    [
      'issuer with a query',
      {...full, issuer: 'https://janus.test/auth/v1?x=1'},
      'ios',
    ],
    ['scheme off the bounce allow-list', {...full, scheme: 'one'}, 'ios'],
    ['no scheme on native', {...full, scheme: ''}, 'android'],
    [
      'bounce on a foreign path',
      {...full, appRedirectUri: 'https://app-dev.test/cb'},
      'ios',
    ],
    ['no web redirect', {...full, webRedirectUri: ''}, 'web'],
    ['http runtime', {...full, runtimeUrl: 'http://runtime.test'}, 'ios'],
    ['unknown platform', full, 'windows'],
  ])('refuses %s', (_name, env, platform) => {
    expect(parseAOSignatureConfig(env, platform, RT)).toBeNull()
  })

  it('refuses a runtime that is not the agent runtime the app talks to (the bearer never leaves it)', () => {
    expect(
      parseAOSignatureConfig(full, 'ios', 'https://other-runtime.test'),
    ).toBeNull()
  })
})
