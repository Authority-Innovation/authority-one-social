import {beforeEach, describe, expect, it, jest} from '@jest/globals'

import {
  DID,
  mintedSession,
  redeemBody,
  res,
  RUNTIME,
} from '../__fixtures__/fixtures'
import {type AOFetch, createAOClient} from '../client'
import {AOSignatureError} from '../errors'
import {type AOGrant} from '../pkce'

const grant: AOGrant = {
  code: 'C',
  code_verifier: 'v'.repeat(43),
  code_challenge_method: 'S256',
  redirect_uri: 'https://app-dev.test/auth/janus/app-callback',
  state: 'as.authorityone-dev.r',
  callback_state: 'as.authorityone-dev.r',
  client_id: 'ao-social-ios-dev',
}

type Call = {
  url: string
  init: {method: string; headers: Record<string, string>; body?: string}
}

describe('runtime client wire', () => {
  let calls: Call[]
  let next: ReturnType<typeof res>
  let doFetch: AOFetch
  beforeEach(() => {
    calls = []
    next = res(200, redeemBody())
    doFetch = jest.fn((url: string, init: Call['init']) => {
      calls.push({url, init})
      return Promise.resolve(next)
    })
  })

  it('a normal redeem carries NO Authorization, the grant (with client_id) and the nonce', async () => {
    const c = createAOClient(`${RUNTIME}/`, doFetch)
    await c.redeem(grant, 'NONCE', null)
    expect(calls[0].url).toBe(`${RUNTIME}/auth/janus/session`)
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.headers.Authorization).toBeUndefined()
    expect(calls[0].init.headers['X-Authority-Auth']).toBeUndefined()
    expect(JSON.parse(calls[0].init.body!)).toEqual({grant, nonce: 'NONCE'})
  })

  it('a link redeem carries the SAME PDS bearer + atproto marker + link_code', async () => {
    next = res(200, redeemBody({outcome: 'linked'}))
    const c = createAOClient(RUNTIME, doFetch)
    await c.redeem(grant, 'N', {
      pdsAccessJwt: 'PDSJWT',
      linkCode: 'LC',
      did: DID,
    })
    expect(calls[0].init.headers.Authorization).toBe('Bearer PDSJWT')
    expect(calls[0].init.headers['X-Authority-Auth']).toBe('atproto')
    expect(
      (JSON.parse(calls[0].init.body!) as {link_code: string}).link_code,
    ).toBe('LC')
  })

  it('AO-session routes send `Bearer aos1…` WITHOUT X-Authority-Auth', async () => {
    const c = createAOClient(RUNTIME, doFetch)
    next = res(200, {ok: true, sid: 's'})
    await c.signout('aos1.x.y')
    await c.signoutEverywhere('aos1.x.y')
    await c.unlink('aos1.x.y')
    expect(calls.map(x => x.url)).toEqual([
      `${RUNTIME}/auth/ao/signout`,
      `${RUNTIME}/auth/ao/signout-everywhere`,
      `${RUNTIME}/auth/ao/unlink`,
    ])
    for (const x of calls) {
      expect(x.init.headers).toEqual({Authorization: 'Bearer aos1.x.y'})
    }
  })

  it('refusals surface status + code (code wins over error)', async () => {
    const c = createAOClient(RUNTIME, doFetch)
    next = res(401, {error: 'reverify', code: 'janus-reverify'})
    const e = (await c
      .refresh('aos1.x.y', DID)
      .catch(x => x)) as AOSignatureError
    expect(e).toBeInstanceOf(AOSignatureError)
    expect([e.kind, e.status, e.code]).toEqual([
      'refused',
      401,
      'janus-reverify',
    ])
    next = res(403, {error: 'link-code-invalid'})
    const e2 = (await c
      .redeem(grant, 'N', null)
      .catch(x => x)) as AOSignatureError
    expect(e2.kind).toBe('link-code-unusable')
  })

  it('a hung request times out as `transport` and is aborted', async () => {
    jest.useFakeTimers()
    let signal: AbortSignal | undefined
    const hang = ((_u: string, init: {signal?: AbortSignal}) => {
      signal = init.signal
      return new Promise(() => {})
    }) as unknown as AOFetch
    const c = createAOClient(RUNTIME, hang, {timeoutMs: 1000})
    const p = c.refresh('aos1.x.y', DID).catch(x => x as AOSignatureError)
    jest.advanceTimersByTime(1001)
    const e = await p
    expect(e).toBeInstanceOf(AOSignatureError)
    expect((e as AOSignatureError).kind).toBe('transport')
    expect(signal?.aborted).toBe(true)
    jest.useRealTimers()
  })

  it('a thrown fetch is `transport`', async () => {
    const c = createAOClient(RUNTIME, () =>
      Promise.reject(new Error('offline')),
    )
    const e = (await c.introspect('aos1.x.y').catch(x => x)) as AOSignatureError
    expect(e.kind).toBe('transport')
  })

  it('refresh decodes the re-minted session (same person) and refuses a malformed one', async () => {
    const c = createAOClient(RUNTIME, doFetch)
    const m = mintedSession()
    next = res(200, {ok: true, aoSession: m})
    await expect(c.refresh('aos1.x.y', DID)).resolves.toEqual({
      token: m.token,
      sid: m.sid,
      expiresAt: m.expiresAt,
    })
    next = res(200, {ok: true, aoSession: mintedSession('did:plc:else')})
    await expect(c.refresh('aos1.x.y', DID)).rejects.toBeInstanceOf(
      AOSignatureError,
    )
    // A re-mint under another sid is refused when the sid is named.
    next = res(200, {ok: true, aoSession: mintedSession(DID, 'sid-other')})
    const e = (await c
      .refresh('aos1.x.y', DID, 'sid-1')
      .catch(x => x as AOSignatureError)) as AOSignatureError
    expect(e.code).toBe('sid-mismatch')
  })

  it('link-code: PDS bearer only, and the answer is checked', async () => {
    const c = createAOClient(RUNTIME, doFetch)
    next = res(200, {
      ok: true,
      did: DID,
      linkCode: 'LC',
      expiresAt: new Date().toISOString(),
    })
    await expect(c.linkCode('PDSJWT')).resolves.toMatchObject({
      did: DID,
      linkCode: 'LC',
    })
    expect(calls[0].init.headers).toEqual({Authorization: 'Bearer PDSJWT'})
    next = res(200, {ok: true})
    await expect(c.linkCode('PDSJWT')).rejects.toBeInstanceOf(AOSignatureError)
  })

  it('picker routes: list, create {handle,name}, choose {agent}', async () => {
    const c = createAOClient(RUNTIME, doFetch)
    next = res(201, {handle: 'ron.pds.test', primary: null})
    await expect(
      c.createAgent('aos1.x.y', {handle: 'ron', name: 'Ron'}),
    ).resolves.toEqual({
      handle: 'ron.pds.test',
      primary: null,
    })
    expect(JSON.parse(calls[0].init.body!)).toEqual({
      handle: 'ron',
      name: 'Ron',
    })
    next = res(200, {ok: true, primary: 'steve.pds.test'})
    await expect(c.choosePrimary('aos1.x.y', 'steve.pds.test')).resolves.toBe(
      'steve.pds.test',
    )
    expect(calls[1].url).toBe(`${RUNTIME}/app/agents/primary`)
    expect(JSON.parse(calls[1].init.body!)).toEqual({agent: 'steve.pds.test'})
  })
})
