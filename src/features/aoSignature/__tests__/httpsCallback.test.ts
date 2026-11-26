import {beforeEach, describe, expect, it, jest} from '@jest/globals'

// The claimed https callback (Community iOS, 2026-11-26): Janus redirects to
// https://app-dev.authority-one.com/auth/janus/community/app-callback, which
// the OS hands straight back to the in-app browser session (iOS 17.4
// ASWebAuthenticationSession Callback.https, the local expo-ao-auth-session
// module). No custom scheme, no runtime bounce.

const mockNative = {
  isSupported: jest.fn(() => true),
  authorizeHttps: jest.fn(
    (_url: string, _host: string, _path: string): Promise<unknown> =>
      Promise.resolve({type: 'cancel'}),
  ),
}
let mockNativePresent = true
jest.mock('expo-modules-core', () => ({
  ...jest.requireActual<object>('expo-modules-core'),
  requireOptionalNativeModule: (name: string) =>
    mockNativePresent && name === 'ExpoAOAuthSession' ? mockNative : null,
}))
const mockOpenAuthSession = jest.fn(
  (_url: string, _cb: string, _o: unknown): Promise<unknown> =>
    Promise.resolve({type: 'cancel'}),
)
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (url: string, cb: string, o: unknown) =>
    mockOpenAuthSession(url, cb, o),
}))

import {
  _resetAOAuthSessionForTests,
  AOAuthSessionUnavailable,
  authorizeWithHttpsCallback,
  httpsCallbackTarget,
} from '../../../../modules/expo-ao-auth-session'
import {
  COMMUNITY_HTTPS_CALLBACK,
  DID,
  IOS_CFG,
  IOS_HTTPS_CFG,
  nodeCrypto,
  redeemBody,
} from '../__fixtures__/fixtures'
import {getNativeBrowser} from '../browser'
import {type AOClient} from '../client'
import {
  AO_SIGNATURE_HTTPS_CALLBACK_PATH,
  parseAOSignatureConfig,
} from '../config'
import {AOSignatureError} from '../errors'
import {buildAuthorizeUrl, createFlow} from '../pkce'
import {
  type AOBrowserResult,
  isClaimedCallback,
  signInNative,
} from '../signIn'
import {decodeRedeem} from '../wire'

const RT = 'https://runtime.test'
const httpsEnv = {
  issuer: 'https://janus.test/auth/v1',
  runtimeUrl: RT,
  clientIdIos: 'community-ios-dev',
  clientIdAndroid: 'community-android-dev',
  appRedirectUri: COMMUNITY_HTTPS_CALLBACK,
}

beforeEach(() => {
  jest.clearAllMocks()
  mockNativePresent = true
  mockNative.isSupported.mockReturnValue(true)
  _resetAOAuthSessionForTests()
})

describe('config: the claimed callback', () => {
  it('the path is the one the Janus client registers', () => {
    expect(AO_SIGNATURE_HTTPS_CALLBACK_PATH).toBe(
      '/auth/janus/community/app-callback',
    )
  })

  it('arms iOS in https mode: no scheme, the callback IS the redirect, openid email, the community-ios door', () => {
    expect(parseAOSignatureConfig(httpsEnv, 'ios', RT)).toMatchObject({
      platform: 'ios',
      clientId: 'community-ios-dev',
      redirectUri: COMMUNITY_HTTPS_CALLBACK,
      callbackUrl: COMMUNITY_HTTPS_CALLBACK,
      callbackMode: 'https',
      scheme: null,
      scopes: 'openid email',
      sessionPath: '/auth/janus/community-ios/session',
    })
  })

  it('the legacy bounce still arms, as `bounce`', () => {
    const c = parseAOSignatureConfig(
      {
        ...httpsEnv,
        scheme: 'community-dev',
        appRedirectUri: 'https://app-dev.test/auth/janus/app-callback',
      },
      'ios',
      RT,
    )
    expect(c?.callbackMode).toBe('bounce')
    expect(c?.callbackUrl).toBe('community-dev://auth/janus/app-callback')
  })

  it.each([
    ['Android (iOS-only mode)', httpsEnv, 'android'],
    ['a scheme alongside it (mixed)', {...httpsEnv, scheme: 'community'}, 'ios'],
    [
      'a port',
      {
        ...httpsEnv,
        appRedirectUri:
          'https://app-dev.authority-one.com:8443/auth/janus/community/app-callback',
      },
      'ios',
    ],
    [
      'credentials',
      {
        ...httpsEnv,
        appRedirectUri:
          'https://u:p@app-dev.authority-one.com/auth/janus/community/app-callback',
      },
      'ios',
    ],
    [
      'a query',
      {...httpsEnv, appRedirectUri: `${COMMUNITY_HTTPS_CALLBACK}?x=1`},
      'ios',
    ],
    [
      'a trailing slash (not the registered path)',
      {...httpsEnv, appRedirectUri: `${COMMUNITY_HTTPS_CALLBACK}/`},
      'ios',
    ],
    [
      'http',
      {
        ...httpsEnv,
        appRedirectUri: COMMUNITY_HTTPS_CALLBACK.replace('https:', 'http:'),
      },
      'ios',
    ],
    ['no iOS client', {...httpsEnv, clientIdIos: ''}, 'ios'],
  ])('refuses %s', (_n, env, platform) => {
    expect(parseAOSignatureConfig(env, platform, RT)).toBeNull()
  })

  it('web is unaffected (its own callback, no native mode)', () => {
    const c = parseAOSignatureConfig(
      {
        ...httpsEnv,
        clientIdWeb: 'community-web-dev',
        webRedirectUri: 'https://community.test/auth/janus/callback',
      },
      'web',
      RT,
    )
    expect(c?.callbackMode).toBeNull()
    expect(c?.callbackUrl).toBeNull()
  })
})

describe('authorize leg in https mode', () => {
  it('state has no bounce marker; redirect_uri is the claimed callback; S256; openid email', async () => {
    const flow = await createFlow(IOS_HTTPS_CFG, nodeCrypto)
    expect(flow.state.startsWith('as.')).toBe(false)
    expect(flow.state).toMatch(/^[A-Za-z0-9_-]+$/)
    const u = new URL(buildAuthorizeUrl(IOS_HTTPS_CFG, flow))
    expect(u.searchParams.get('redirect_uri')).toBe(COMMUNITY_HTTPS_CALLBACK)
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
    expect(u.searchParams.get('scope')).toBe('openid email')
  })
})

function harness(browser: (authUrl: string, cb: string) => AOBrowserResult) {
  const redeem = jest.fn((_g: unknown, _n: string, _l: unknown) =>
    Promise.resolve(decodeRedeem(redeemBody())),
  )
  const client = {redeem} as unknown as AOClient
  const port = {
    authorize: jest.fn((url: string, cb: string) =>
      Promise.resolve(browser(url, cb)),
    ),
  }
  return {
    redeem,
    port,
    deps: {cfg: IOS_HTTPS_CFG, client, crypto: nodeCrypto},
  }
}

const stateOf = (url: string) => new URL(url).searchParams.get('state')!

describe('signInNative with the claimed callback', () => {
  it('waits for the https callback and redeems with it as redirect_uri', async () => {
    const h = harness((url, cb) => ({
      type: 'success',
      url: `${cb}?code=CODE&state=${stateOf(url)}`,
    }))
    const r = await signInNative(h.deps, h.port)
    expect(r.did).toBe(DID)
    expect(h.port.authorize.mock.calls[0][1]).toBe(COMMUNITY_HTTPS_CALLBACK)
    const [grant] = h.redeem.mock.calls[0] as [Record<string, string>]
    expect(grant.redirect_uri).toBe(COMMUNITY_HTTPS_CALLBACK)
    expect(grant.code).toBe('CODE')
    expect(grant.client_id).toBe(IOS_HTTPS_CFG.clientId)
  })

  it.each([
    ['another host', 'https://evil.test/auth/janus/community/app-callback'],
    ['another path', 'https://app-dev.authority-one.com/auth/janus/app-callback'],
    ['http', COMMUNITY_HTTPS_CALLBACK.replace('https:', 'http:')],
    [
      'a port',
      'https://app-dev.authority-one.com:444/auth/janus/community/app-callback',
    ],
    ['the old scheme bounce', 'community-dev://auth/janus/app-callback'],
  ])(
    'a callback on %s never reaches the runtime, even with the right state',
    async (_n, base) => {
      const h = harness(url => ({
        type: 'success',
        url: `${base}?code=C&state=${stateOf(url)}`,
      }))
      await expect(signInNative(h.deps, h.port)).rejects.toMatchObject({
        kind: 'janus',
      })
      expect(h.redeem).not.toHaveBeenCalled()
    },
  )

  it('a foreign state never reaches the runtime', async () => {
    const h = harness(() => ({
      type: 'success',
      url: `${COMMUNITY_HTTPS_CALLBACK}?code=C&state=evil`,
    }))
    await expect(signInNative(h.deps, h.port)).rejects.toMatchObject({
      kind: 'janus',
    })
    expect(h.redeem).not.toHaveBeenCalled()
  })

  it('isClaimedCallback is exact on origin + path', () => {
    expect(
      isClaimedCallback(`${COMMUNITY_HTTPS_CALLBACK}?code=a`, IOS_HTTPS_CFG),
    ).toBe(true)
    expect(isClaimedCallback('not a url', IOS_HTTPS_CFG)).toBe(false)
    expect(
      isClaimedCallback(
        'https://APP-DEV.authority-one.com/auth/janus/community/app-callback',
        IOS_HTTPS_CFG,
      ),
    ).toBe(true) // hosts are case-insensitive; URL lowercases them
    expect(
      isClaimedCallback(
        'https://x@app-dev.authority-one.com/auth/janus/community/app-callback',
        IOS_HTTPS_CFG,
      ),
    ).toBe(false)
  })
})

describe('the native module wrapper', () => {
  it('httpsCallbackTarget: host + path of a plain https URL only', () => {
    expect(httpsCallbackTarget(COMMUNITY_HTTPS_CALLBACK)).toEqual({
      host: 'app-dev.authority-one.com',
      path: '/auth/janus/community/app-callback',
    })
    for (const bad of [
      'community-dev://auth/janus/app-callback',
      'http://a.test/x',
      'https://a.test:1/x',
      'https://u@a.test/x',
      'https://a.test/x?y=1',
      'https://a.test/x#f',
      'https://a.test/',
      'nope',
    ]) {
      expect(httpsCallbackTarget(bad)).toBeNull()
    }
  })

  it('passes the exact host + path to the OS session and maps the answer', async () => {
    mockNative.authorizeHttps.mockResolvedValueOnce({
      type: 'success',
      url: `${COMMUNITY_HTTPS_CALLBACK}?code=C&state=S`,
    })
    await expect(
      authorizeWithHttpsCallback('https://janus.test/a', COMMUNITY_HTTPS_CALLBACK),
    ).resolves.toEqual({
      type: 'success',
      url: `${COMMUNITY_HTTPS_CALLBACK}?code=C&state=S`,
    })
    expect(mockNative.authorizeHttps).toHaveBeenCalledWith(
      'https://janus.test/a',
      'app-dev.authority-one.com',
      '/auth/janus/community/app-callback',
    )
    // Anything but a success with a URL is a cancel.
    mockNative.authorizeHttps.mockResolvedValueOnce({type: 'success'})
    await expect(
      authorizeWithHttpsCallback('https://janus.test/a', COMMUNITY_HTTPS_CALLBACK),
    ).resolves.toEqual({type: 'cancel'})
  })

  it.each([
    ['no-module', () => (mockNativePresent = false)],
    ['unsupported-os', () => mockNative.isSupported.mockReturnValue(false)],
  ] as const)('refuses to start: %s', async (reason, arrange) => {
    arrange()
    _resetAOAuthSessionForTests()
    const p = authorizeWithHttpsCallback(
      'https://janus.test/a',
      COMMUNITY_HTTPS_CALLBACK,
    )
    await expect(p).rejects.toBeInstanceOf(AOAuthSessionUnavailable)
    await expect(p).rejects.toMatchObject({reason})
    expect(mockNative.authorizeHttps).not.toHaveBeenCalled()
  })
})

describe('browser port routing', () => {
  it('an https callback runs the claimed-callback session, never expo-web-browser', async () => {
    mockNative.authorizeHttps.mockResolvedValueOnce({type: 'cancel'})
    await expect(
      getNativeBrowser().authorize(
        'https://janus.test/a',
        COMMUNITY_HTTPS_CALLBACK,
      ),
    ).resolves.toEqual({type: 'cancel'})
    expect(mockNative.authorizeHttps).toHaveBeenCalledTimes(1)
    expect(mockOpenAuthSession).not.toHaveBeenCalled()
  })

  it('the scheme bounce still uses expo-web-browser, non-ephemeral', async () => {
    await getNativeBrowser().authorize(
      'https://janus.test/a',
      IOS_CFG.callbackUrl!,
    )
    expect(mockOpenAuthSession).toHaveBeenCalledWith(
      'https://janus.test/a',
      'community-dev://auth/janus/app-callback',
      {preferEphemeralSession: false},
    )
    expect(mockNative.authorizeHttps).not.toHaveBeenCalled()
  })

  it('a binary without the module (or iOS < 17.4) says `not-configured`, and nothing is redeemed', async () => {
    mockNativePresent = false
    _resetAOAuthSessionForTests()
    const redeem = jest.fn()
    const client = {redeem} as unknown as AOClient
    const err = await signInNative(
      {cfg: IOS_HTTPS_CFG, client, crypto: nodeCrypto},
      getNativeBrowser(),
    ).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AOSignatureError)
    expect((err as AOSignatureError).kind).toBe('not-configured')
    expect(redeem).not.toHaveBeenCalled()
  })

  it('a native failure is a Janus-leg error', async () => {
    mockNative.authorizeHttps.mockRejectedValueOnce(new Error('ERR_AO_AUTH'))
    const redeem = jest.fn()
    const client = {redeem} as unknown as AOClient
    await expect(
      signInNative(
        {cfg: IOS_HTTPS_CFG, client, crypto: nodeCrypto},
        getNativeBrowser(),
      ),
    ).rejects.toMatchObject({kind: 'janus'})
    expect(redeem).not.toHaveBeenCalled()
  })
})
