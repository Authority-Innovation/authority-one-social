import {describe, expect, it} from '@jest/globals'

import {type AOSignatureEnv, parseAOSignatureConfig} from '../config'

// app.config.js (plain node, build time) mirrors parseAOSignatureConfig for
// the native platforms; this runs both over the same env matrix.

const appConfig = require('../../../../app.config.js') as {
  aoSignatureNativeScheme: (
    env: Record<string, string | undefined>,
    platform?: string,
  ) => string | null
}

const RT = 'https://authority-one-agent-runtime.e-479.workers.dev'
const full: Record<string, string> = {
  EXPO_PUBLIC_AO_SIGNATURE_ISSUER: 'https://janus.test/auth/v1',
  EXPO_PUBLIC_AO_SIGNATURE_RUNTIME_URL: `${RT}/`,
  EXPO_PUBLIC_AO_SIGNATURE_CLIENT_ID_IOS: 'ao-ios',
  EXPO_PUBLIC_AO_SIGNATURE_CLIENT_ID_ANDROID: 'ao-android',
  EXPO_PUBLIC_AO_SIGNATURE_SCHEME: 'authorityone-dev',
  EXPO_PUBLIC_AO_SIGNATURE_APP_REDIRECT_URI:
    'https://app-dev.test/auth/janus/app-callback',
}

function toEnv(raw: Record<string, string | undefined>): AOSignatureEnv {
  return {
    issuer: raw.EXPO_PUBLIC_AO_SIGNATURE_ISSUER,
    authorizeBase: raw.EXPO_PUBLIC_AO_SIGNATURE_AUTHORIZE_BASE,
    runtimeUrl: raw.EXPO_PUBLIC_AO_SIGNATURE_RUNTIME_URL,
    clientIdIos: raw.EXPO_PUBLIC_AO_SIGNATURE_CLIENT_ID_IOS,
    clientIdAndroid: raw.EXPO_PUBLIC_AO_SIGNATURE_CLIENT_ID_ANDROID,
    scheme: raw.EXPO_PUBLIC_AO_SIGNATURE_SCHEME,
    appRedirectUri: raw.EXPO_PUBLIC_AO_SIGNATURE_APP_REDIRECT_URI,
  }
}

const cases: Array<[string, Record<string, string | undefined>]> = [
  ['full', full],
  ['unset', {}],
  ['scheme only', {EXPO_PUBLIC_AO_SIGNATURE_SCHEME: 'authorityone-dev'}],
  [
    'android-callback path',
    {
      ...full,
      EXPO_PUBLIC_AO_SIGNATURE_APP_REDIRECT_URI:
        'https://a.test/auth/janus/android-callback',
    },
  ],
  [
    'foreign redirect path',
    {...full, EXPO_PUBLIC_AO_SIGNATURE_APP_REDIRECT_URI: 'https://a.test/cb'},
  ],
  [
    'redirect with ?',
    {
      ...full,
      EXPO_PUBLIC_AO_SIGNATURE_APP_REDIRECT_URI:
        'https://a.test/auth/janus/app-callback?x=1',
    },
  ],
  [
    'issuer with #',
    {...full, EXPO_PUBLIC_AO_SIGNATURE_ISSUER: 'https://janus.test/auth/v1#x'},
  ],
  [
    'http issuer',
    {...full, EXPO_PUBLIC_AO_SIGNATURE_ISSUER: 'http://janus.test/auth/v1'},
  ],
  [
    'runtime on another origin',
    {...full, EXPO_PUBLIC_AO_SIGNATURE_RUNTIME_URL: 'https://other.test'},
  ],
  [
    'agent runtime overridden to match',
    {
      ...full,
      EXPO_PUBLIC_AGENT_RUNTIME_URL: 'https://r2.test',
      EXPO_PUBLIC_AO_SIGNATURE_RUNTIME_URL: 'https://r2.test',
    },
  ],
  [
    'agent runtime overridden, AO not',
    {...full, EXPO_PUBLIC_AGENT_RUNTIME_URL: 'https://r2.test'},
  ],
  [
    'client id list',
    {
      ...full,
      EXPO_PUBLIC_AO_SIGNATURE_CLIENT_ID_IOS: 'a,b',
      EXPO_PUBLIC_AO_SIGNATURE_CLIENT_ID_ANDROID: 'a b',
    },
  ],
  [
    'iOS client only',
    {...full, EXPO_PUBLIC_AO_SIGNATURE_CLIENT_ID_ANDROID: ''},
  ],
  [
    'Android client only',
    {...full, EXPO_PUBLIC_AO_SIGNATURE_CLIENT_ID_IOS: ''},
  ],
  ['bad scheme', {...full, EXPO_PUBLIC_AO_SIGNATURE_SCHEME: 'one'}],
  [
    'bad authorize base',
    {...full, EXPO_PUBLIC_AO_SIGNATURE_AUTHORIZE_BASE: 'http://x.test'},
  ],
  [
    'good authorize base',
    {
      ...full,
      EXPO_PUBLIC_AO_SIGNATURE_AUTHORIZE_BASE: 'https://signature.test/auth/v1',
    },
  ],
]

const D = 'authorityone-dev'
const OFF = [null, null, null] as const
/** The EXPECTED scheme per case: [iOS build, Android build, local prebuild].
 *  Agreement alone could be two copies of the same bug, so pin the answers. */
const expected: Record<string, readonly (string | null)[]> = {
  full: [D, D, D],
  unset: OFF,
  'scheme only': OFF,
  'android-callback path': [D, D, D],
  'foreign redirect path': OFF,
  'redirect with ?': OFF,
  'issuer with #': OFF,
  'http issuer': OFF,
  'runtime on another origin': OFF,
  'agent runtime overridden to match': [D, D, D],
  'agent runtime overridden, AO not': OFF,
  'client id list': OFF,
  'iOS client only': [D, null, D],
  'Android client only': [null, D, D],
  'bad scheme': OFF,
  'bad authorize base': OFF,
  'good authorize base': [D, D, D],
}

describe('app.config.js scheme registration mirrors config.ts', () => {
  it('every case has a pinned expectation', () => {
    expect(Object.keys(expected).sort()).toEqual(cases.map(c => c[0]).sort())
  })

  it.each(cases)('%s', (name, raw) => {
    const [ios, android, local] = expected[name]
    expect(appConfig.aoSignatureNativeScheme(raw, 'ios')).toBe(ios)
    expect(appConfig.aoSignatureNativeScheme(raw, 'android')).toBe(android)
    expect(appConfig.aoSignatureNativeScheme(raw, undefined)).toBe(local)
    const agentRuntime = raw.EXPO_PUBLIC_AGENT_RUNTIME_URL ?? RT
    for (const platform of ['ios', 'android'] as const) {
      const ts = parseAOSignatureConfig(toEnv(raw), platform, agentRuntime)
      expect(appConfig.aoSignatureNativeScheme(raw, platform)).toBe(
        ts?.scheme ?? null,
      )
    }
    // A local prebuild (no EAS platform): armed if either native platform is.
    const either =
      parseAOSignatureConfig(toEnv(raw), 'ios', agentRuntime) ??
      parseAOSignatureConfig(toEnv(raw), 'android', agentRuntime)
    expect(appConfig.aoSignatureNativeScheme(raw, undefined)).toBe(
      either?.scheme ?? null,
    )
  })
})
