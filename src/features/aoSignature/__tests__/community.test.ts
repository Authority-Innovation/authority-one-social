// Signature rollout P5 — Community: the per-lane session door, Community's own
// terms (per-app enrollment), the short-lived PDS session broker and the
// one-time "connect your Community account" self-mint.
import {beforeEach, describe, expect, it, jest} from '@jest/globals'

import {
  DID,
  mintedSession,
  redeemBody,
  res,
  RUNTIME,
} from '../__fixtures__/fixtures'
import {type AOClient, type AOFetch, createAOClient} from '../client'
import {
  AO_SIGNATURE_SCHEMES,
  AO_SIGNATURE_SCOPES,
  AO_SIGNATURE_SESSION_PATHS,
  parseAOSignatureConfig,
} from '../config'
import {AOSignatureError} from '../errors'
import {
  connectCommunityAccount,
  createPdsBroker,
  needsCommunityConnect,
  PDS_SESSION_EARLY_MS,
  PDS_SESSION_UNSTATED_TTL_MS,
} from '../pdsBroker'
import {type AOGrant} from '../pkce'
import {recordFromRedeem} from '../session'
import {type AORecord} from '../store'
import {decodeEnrollmentAsk, decodePdsSession, decodeRedeem} from '../wire'

const ASK = {
  app: 'community',
  termsUrl: 'https://authority-one.com/terms',
  privacyUrl: 'https://authority-one.com/privacy',
  termsVersion: '2026-11-03',
  privacyVersion: '2026-11-03',
  consents: [{name: 'marketing', version: '2026-11-03'}],
}
const jwt = (payload: object) =>
  `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`

type Call = {
  url: string
  init: {method: string; headers: Record<string, string>; body?: string}
}

function recorder(answers: Array<ReturnType<typeof res>>) {
  const calls: Call[] = []
  const doFetch: AOFetch = jest.fn((url: string, init: Call['init']) => {
    calls.push({url, init})
    const next = answers.shift()
    if (!next) return Promise.reject(new Error('no answer queued'))
    return Promise.resolve(next)
  })
  return {calls, doFetch}
}

function record(over: Partial<AORecord> = {}): AORecord {
  return {
    ...recordFromRedeem(decodeRedeem(redeemBody({enrolled: true}))),
    ...over,
  }
}

describe('config: Community lanes, schemes, scopes', () => {
  const env = {
    issuer: 'https://janus.test/auth/v1',
    runtimeUrl: RUNTIME,
    clientIdIos: 'ios',
    clientIdAndroid: 'android',
    clientIdWeb: 'web',
    scheme: 'community-dev',
    appRedirectUri: 'https://app-dev.test/auth/janus/app-callback',
    webRedirectUri: 'https://community.test/auth/janus/callback',
  }
  it('each platform redeems at its own lane door; scopes are openid email', () => {
    for (const p of ['ios', 'android', 'web'] as const) {
      const c = parseAOSignatureConfig(env, p, RUNTIME)
      expect(c?.sessionPath).toBe(AO_SIGNATURE_SESSION_PATHS[p])
      expect(c?.scopes).toBe('openid email')
    }
    expect(AO_SIGNATURE_SESSION_PATHS.ios).toBe(
      '/auth/janus/community-ios/session',
    )
    expect(AO_SIGNATURE_SCOPES).toBe('openid email')
  })
  it('only community / community-dev schemes arm native (authorityone now belongs to Authority One)', () => {
    expect([...AO_SIGNATURE_SCHEMES]).toEqual(['community', 'community-dev'])
    expect(
      parseAOSignatureConfig(
        {...env, scheme: 'authorityone-dev'},
        'ios',
        RUNTIME,
      ),
    ).toBeNull()
    expect(
      parseAOSignatureConfig({...env, scheme: 'community'}, 'ios', RUNTIME)
        ?.callbackUrl,
    ).toBe('community://auth/janus/app-callback')
  })
})

describe('wire: enrolled, the ask, the PDS session', () => {
  it('only an explicit enrolled:true is enrolled', () => {
    expect(decodeRedeem(redeemBody({enrolled: true})).enrolled).toBe(true)
    expect(decodeRedeem(redeemBody({enrolled: false})).enrolled).toBe(false)
    expect(decodeRedeem(redeemBody({enrolled: null})).enrolled).toBe(false)
    expect(decodeRedeem(redeemBody()).enrolled).toBe(false)
  })
  it('the ask is fail-closed: https links and both versions or nothing', () => {
    expect(decodeEnrollmentAsk(ASK)).toEqual(ASK)
    expect(
      decodeEnrollmentAsk({...ASK, termsUrl: 'http://x.test/terms'}),
    ).toBeNull()
    expect(decodeEnrollmentAsk({...ASK, privacyVersion: ''})).toBeNull()
    expect(
      decodeEnrollmentAsk({...ASK, consents: [{name: 'x'}]})?.consents,
    ).toEqual([])
  })
  it('a PDS session must name the same DID and carry a JWT; a refresh token is never read', () => {
    const ok = {
      ok: true,
      did: DID,
      handle: 'h',
      accessJwt: 'a.b.c',
      accessExpiresAt: '2030-01-01T00:00:00.000Z',
      refreshJwt: 'X',
    }
    expect(decodePdsSession(ok, DID)).toEqual({
      did: DID,
      handle: 'h',
      accessJwt: 'a.b.c',
      expiresAt: Date.parse('2030-01-01T00:00:00.000Z'),
    })
    expect(decodePdsSession({...ok, did: 'did:plc:other'}, DID)).toBeNull()
    expect(decodePdsSession({...ok, accessJwt: 'nope'}, DID)).toBeNull()
    expect(
      decodePdsSession({...ok, accessExpiresAt: null}, DID)?.expiresAt,
    ).toBeNull()
  })
})

describe('client: the lane door and the new routes', () => {
  const grant: AOGrant = {
    code: 'C',
    code_verifier: 'v'.repeat(43),
    code_challenge_method: 'S256',
    redirect_uri: 'https://app-dev.test/auth/janus/app-callback',
    state: 'as.community-dev.r',
    callback_state: 'as.community-dev.r',
    client_id: 'ios',
  }
  it('redeems at the configured lane door', async () => {
    const r = recorder([res(200, redeemBody())])
    const c = createAOClient(RUNTIME, r.doFetch, {
      sessionPath: '/auth/janus/community-ios/session',
    })
    await c.redeem(grant, 'N', null)
    expect(r.calls[0].url).toBe(`${RUNTIME}/auth/janus/community-ios/session`)
  })
  it('enrollment reads the ask; enroll sends both acceptances, the exact versions, and only known consents', async () => {
    const r = recorder([
      res(200, {ok: true, enrolled: false, ask: ASK}),
      res(200, {ok: true, enrolled: true}),
    ])
    const c = createAOClient(RUNTIME, r.doFetch)
    const got = await c.enrollment('aos1.t.s')
    expect(got).toEqual({enrolled: false, ask: ASK})
    await c.enroll('aos1.t.s', {
      ask: got.ask,
      consents: {marketing: false, photos: true},
    })
    expect(r.calls[1].url).toBe(`${RUNTIME}/auth/ao/enroll`)
    expect(r.calls[1].init.headers.Authorization).toBe('Bearer aos1.t.s')
    expect(JSON.parse(r.calls[1].init.body!)).toEqual({
      accept_terms: true,
      accept_privacy: true,
      terms_version: '2026-11-03',
      privacy_version: '2026-11-03',
      consents: {marketing: false},
    })
  })
  it('a stale ask comes back as the runtime refusal', async () => {
    const r = recorder([res(409, {error: 'terms-version-stale', ask: ASK})])
    const c = createAOClient(RUNTIME, r.doFetch)
    await expect(
      c.enroll('aos1.t.s', {ask: ASK, consents: {}}),
    ).rejects.toMatchObject({
      kind: 'refused',
      status: 409,
      code: 'terms-version-stale',
    })
  })
  it('pds-credential sends the AO bearer AND the full PDS session in X-PDS-Authorization', async () => {
    const r = recorder([res(200, {ok: true, did: DID, custodied: true})])
    const c = createAOClient(RUNTIME, r.doFetch)
    await c.pdsCredential('aos1.t.s', 'FULL.PDS.JWT')
    expect(r.calls[0].url).toBe(`${RUNTIME}/auth/ao/pds-credential`)
    expect(r.calls[0].init.headers).toMatchObject({
      Authorization: 'Bearer aos1.t.s',
      'X-PDS-Authorization': 'Bearer FULL.PDS.JWT',
    })
  })
})

describe('PDS session broker', () => {
  let now: number
  beforeEach(() => {
    now = 1_900_000_000_000
  })
  function fakeClient(answers: Array<() => Promise<unknown>>) {
    const pdsSession = jest.fn(() =>
      (answers.shift() ?? (() => Promise.reject(new Error('none'))))(),
    )
    return {client: {pdsSession} as unknown as AOClient, pdsSession}
  }
  const session = (expiresAt: number | null) => ({
    did: DID,
    handle: 'h',
    accessJwt: 'a.b.c',
    expiresAt,
  })

  it('caches until a minute before expiry, then asks again; one request at a time', async () => {
    const {client, pdsSession} = fakeClient([
      () => Promise.resolve(session(now + 10 * 60_000)),
      () => Promise.resolve(session(now + 20 * 60_000)),
    ])
    const b = createPdsBroker(client, () => now)
    const rec = record()
    await Promise.all([b.get(rec), b.get(rec)])
    expect(pdsSession).toHaveBeenCalledTimes(1)
    now += 10 * 60_000 - PDS_SESSION_EARLY_MS - 1
    await b.get(rec)
    expect(pdsSession).toHaveBeenCalledTimes(1)
    now += 2
    await b.get(rec)
    expect(pdsSession).toHaveBeenCalledTimes(2)
  })
  it('an unstated expiry is kept briefly; invalidate and a new session (sid) ask again', async () => {
    const {client, pdsSession} = fakeClient([
      () => Promise.resolve(session(null)),
      () => Promise.resolve(session(null)),
      () => Promise.resolve(session(null)),
    ])
    const b = createPdsBroker(client, () => now)
    await b.get(record())
    now += PDS_SESSION_UNSTATED_TTL_MS - 1
    await b.get(record())
    expect(pdsSession).toHaveBeenCalledTimes(1)
    b.invalidate()
    await b.get(record())
    expect(pdsSession).toHaveBeenCalledTimes(2)
    await b.get(
      record({sid: 'sid-2', token: mintedSession(DID, 'sid-2').token}),
    )
    expect(pdsSession).toHaveBeenCalledTimes(3)
  })
  it('409 pds-credential-unavailable means "connect your Community account"', () => {
    expect(
      needsCommunityConnect(
        new AOSignatureError('refused', 409, 'pds-credential-unavailable'),
      ),
    ).toBe(true)
    expect(
      needsCommunityConnect(
        new AOSignatureError('refused', 403, 'enrollment-required'),
      ),
    ).toBe(false)
    expect(needsCommunityConnect(new Error('x'))).toBe(false)
  })
})

describe('connect your Community account (one-time self-mint)', () => {
  const SERVICE = 'https://pds.test'
  it('signs in once, hands the FULL session to the runtime, then ends it at the PDS; nothing kept', async () => {
    const full = jwt({scope: 'com.atproto.access', sub: DID})
    const r = recorder([
      res(200, {did: DID, accessJwt: full, refreshJwt: 'REFRESH-1'}),
      res(200, {}),
    ])
    const pdsCredential = jest.fn(() => Promise.resolve())
    const invalidate = jest.fn()
    await connectCommunityAccount({
      client: {pdsCredential} as unknown as AOClient,
      record: record(),
      service: `${SERVICE}/`,
      identifier: ' owner.pds.test ',
      password: 'pw',
      doFetch: r.doFetch,
      broker: {get: jest.fn() as never, invalidate},
    })
    expect(r.calls[0].url).toBe(
      `${SERVICE}/xrpc/com.atproto.server.createSession`,
    )
    expect(JSON.parse(r.calls[0].init.body!)).toEqual({
      identifier: 'owner.pds.test',
      password: 'pw',
    })
    expect(pdsCredential).toHaveBeenCalledWith(record().token, full)
    expect(r.calls[1].url).toBe(
      `${SERVICE}/xrpc/com.atproto.server.deleteSession`,
    )
    expect(r.calls[1].init.headers.Authorization).toBe('Bearer REFRESH-1')
    expect(invalidate).toHaveBeenCalled()
  })
  it('a different account is refused before the runtime is called, and the full session is still ended', async () => {
    const r = recorder([
      res(200, {
        did: 'did:plc:someoneelse',
        accessJwt: 'a.b.c',
        refreshJwt: 'R',
      }),
      res(200, {}),
    ])
    const pdsCredential = jest.fn(() => Promise.resolve())
    await expect(
      connectCommunityAccount({
        client: {pdsCredential} as unknown as AOClient,
        record: record(),
        service: SERVICE,
        identifier: 'x',
        password: 'y',
        doFetch: r.doFetch,
      }),
    ).rejects.toMatchObject({code: 'not-your-account'})
    expect(pdsCredential).not.toHaveBeenCalled()
    expect(r.calls[1].url).toContain('deleteSession')
  })
  it('a wrong password is pds-session-invalid; the runtime refusing an app password surfaces as full-sign-in-required', async () => {
    const bad = recorder([res(401, {error: 'AuthenticationRequired'})])
    await expect(
      connectCommunityAccount({
        client: {} as AOClient,
        record: record(),
        service: SERVICE,
        identifier: 'x',
        password: 'y',
        doFetch: bad.doFetch,
      }),
    ).rejects.toMatchObject({code: 'pds-session-invalid'})
    const r = recorder([
      res(200, {did: DID, accessJwt: 'a.b.c', refreshJwt: 'R'}),
      res(200, {}),
    ])
    const refuse = jest.fn(() =>
      Promise.reject(
        new AOSignatureError('refused', 403, 'full-sign-in-required'),
      ),
    )
    await expect(
      connectCommunityAccount({
        client: {pdsCredential: refuse} as unknown as AOClient,
        record: record(),
        service: SERVICE,
        identifier: 'x',
        password: 'y',
        doFetch: r.doFetch,
      }),
    ).rejects.toMatchObject({code: 'full-sign-in-required'})
    expect(r.calls[1].url).toContain('deleteSession')
  })
})
