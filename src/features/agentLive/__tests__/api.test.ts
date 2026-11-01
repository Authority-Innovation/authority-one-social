/**
 * The /live client against the runtime's real replies (__fixtures__/live.json,
 * generated from agent-live/integration):
 * - ruling 3 (r2 §6 step 2, R3, X-TOK-1): no owner DID or identity field
 *   leaves the app; the bearer is the only identity;
 * - every reply shape the runtime gives, including the session with no token
 *   before consent (F9), 403 consent_required and the proof refusals;
 * - owner scope: a session's calls go out with its own account's bearer, also
 *   after an account switch or sign-out;
 * - no token, bearer or DID in any log line (X-LOG-1, client half).
 */
import {beforeEach, describe, expect, it, jest} from '@jest/globals'

const BEARER = 'opaque-owner-session-bearer'
const OTHER_BEARER = 'opaque-other-account-bearer'

jest.mock('#/lib/agent-runtime/authToken', () => ({
  getAgentRuntimeAccessToken: jest.fn(),
}))
jest.mock('#/lib/agent-runtime/config', () => ({
  AGENT_RUNTIME_BASE_URL: 'https://runtime.test',
}))
jest.mock('#/state/persisted', () => ({get: jest.fn()}))
jest.mock('#/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

import {getAgentRuntimeAccessToken} from '#/lib/agent-runtime/authToken'
import {logger} from '#/logger'
import * as persisted from '#/state/persisted'
import {createRuntimeFetch} from '../__fixtures__/runtimeFetch'
import {
  AGENT_DID,
  LIVE,
  OWNER_DID,
  reply,
  SID,
  tokenOf,
} from '../__fixtures__/runtimeLive'
import {
  captureLiveAuth,
  endLiveSession,
  LIVE_REQUEST_TIMEOUT_MS,
  type LiveAuth,
  proveLiveJoin,
  requestLiveToken,
  startLiveSession,
  submitLiveConsent,
} from '../api'

const OTHER_DID = 'did:plc:someotheraccount00000001'
// A fresh one per test: a call refreshes the pinned bearer in place.
let AUTH: LiveAuth = {ownerDid: OWNER_DID, bearer: BEARER}
const PK = LIVE.device.publicKey

const mockBearer = getAgentRuntimeAccessToken as jest.Mock<
  () => Promise<string | null>
>
const mockPersisted = persisted.get as unknown as jest.Mock<
  (k: string) => unknown
>
let rt: ReturnType<typeof createRuntimeFetch>

function signedInAs(did: string | null, bearer: string | null) {
  mockPersisted.mockImplementation(() =>
    did ? {currentAccount: {did}} : {currentAccount: undefined},
  )
  mockBearer.mockResolvedValue(bearer)
}

beforeEach(() => {
  rt = createRuntimeFetch()
  ;(globalThis as {fetch: unknown}).fetch = rt.fetch
  AUTH = {ownerDid: OWNER_DID, bearer: BEARER}
  for (const fn of Object.values(logger)) (fn as jest.Mock).mockClear()
  mockBearer.mockReset()
  signedInAs(OWNER_DID, BEARER)
})

// Identity keys the runtime never reads from a body (live-routes.js R3).
const IDENTITY_KEYS = [
  'ownerDid',
  'owner',
  'did',
  'identity',
  'tk',
  'doId',
  'handle',
  'userDid',
  'actor',
]

function allKeys(x: unknown, out: string[] = []): string[] {
  if (x && typeof x === 'object') {
    for (const [k, v] of Object.entries(x)) {
      out.push(k)
      allKeys(v, out)
    }
  }
  return out
}

function expectNoIdentity(i = 0) {
  const c = rt.sent[i]
  const u = new URL(c.url)
  // No query string at all, so nothing can ride there.
  expect(u.search).toBe('')
  const headers = JSON.stringify(c.headers)
  expect(c.url).not.toContain(OWNER_DID)
  expect(c.raw ?? '').not.toContain(OWNER_DID)
  expect(headers).not.toMatch(/did:/)
  for (const k of allKeys(c.body)) expect(IDENTITY_KEYS).not.toContain(k)
}

describe('ruling 3: no DID or identity field leaves the app', () => {
  it('start: body is exactly {agentDid, devicePubKey}, bearer only', async () => {
    rt.on('/live/sessions', 'startAwaitingConsent')
    const res = await startLiveSession({
      agentDid: AGENT_DID,
      auth: AUTH,
      devicePubKey: PK,
    })
    expect(res.ok).toBe(true)
    const [c] = rt.sent
    expect(c.method).toBe('POST')
    expect(c.path).toBe('/live/sessions')
    expect(c.body).toEqual({agentDid: AGENT_DID, devicePubKey: PK})
    expect(c.headers.Authorization).toBe(`Bearer ${BEARER}`)
    expectNoIdentity()
  })

  it('start: extra caller fields cannot ride along', async () => {
    rt.on('/live/sessions', 'startAwaitingConsent')
    const smuggled = {
      agentDid: AGENT_DID,
      auth: AUTH,
      ownerDid: OWNER_DID,
      identity: `owner:x:${OWNER_DID}`,
    }
    await startLiveSession(smuggled)
    expect(rt.sent[0].body).toEqual({agentDid: AGENT_DID})
    expectNoIdentity()
  })

  it('consent: {decisions, textVersion, devicePubKey}, no DID at all', async () => {
    rt.on('/live/sessions/:sid/consent', 'consentAdmitted')
    const decisions = {
      record_audio: 'refused',
      record_video: 'refused',
      transcribe: 'given',
      ai_process: 'given',
      remember: 'refused',
    } as const
    await submitLiveConsent({
      sid: SID,
      auth: AUTH,
      decisions,
      textVersion: 'one-app-v1',
      devicePubKey: PK,
    })
    const [c] = rt.sent
    expect(c.path).toBe(`/live/sessions/${SID}/consent`)
    expect(c.body).toEqual({
      decisions,
      textVersion: 'one-app-v1',
      devicePubKey: PK,
    })
    expect(c.raw).not.toMatch(/did:/)
    expectNoIdentity()
  })

  it('token: {camera, devicePubKey}, no DID at all', async () => {
    rt.on('/live/sessions/:sid/token', 'tokenCamera')
    await requestLiveToken({
      sid: SID,
      auth: AUTH,
      camera: true,
      devicePubKey: PK,
    })
    expect(rt.sent[0].body).toEqual({camera: true, devicePubKey: PK})
    expect(rt.sent[0].raw).not.toMatch(/did:/)
    expectNoIdentity()
  })

  it('end: no body, no DID at all', async () => {
    rt.on('/live/sessions/:sid/end', 'end')
    expect(await endLiveSession({sid: SID, auth: AUTH})).toEqual({
      ok: true,
      data: null,
    })
    expect(rt.sent[0].body).toBeUndefined()
    expect(rt.sent[0].path).toBe(`/live/sessions/${SID}/end`)
    expectNoIdentity()
  })

  it('prove: {token, sig} only (rev 4: no exchange flag), no bearer, and the RETURNED token comes back', async () => {
    rt.on('/live/join/prove', 'proveExchange')
    const token = tokenOf('tokenForExchange')
    const sig = LIVE.proofs.tokenForExchange
    expect(await proveLiveJoin({token, sig})).toEqual({
      ok: true,
      data: {
        token: tokenOf('proveExchange'),
        expiresAt: reply('proveExchange').body.expiresAt,
      },
    })
    expect(tokenOf('proveExchange')).not.toBe(token)
    expect(rt.sent[0].body).toEqual({token, sig})
    expect(rt.sent[0].headers.Authorization).toBeUndefined()
  })

  it('prove: a half-exchange (no token back) is a bad_response, never a join on the proven token', async () => {
    rt.on(
      '/live/join/prove',
      {status: 200, body: {ok: true, expiresAt: 1}},
      {
        status: 200,
        body: {ok: true, token: tokenOf('tokenForExchange'), expiresAt: 1},
      },
    )
    const token = tokenOf('tokenForExchange')
    const sig = LIVE.proofs.tokenForExchange
    expect(await proveLiveJoin({token, sig})).toEqual({
      ok: false,
      error: {kind: 'bad_response'},
    })
    // The same token handed back is not an exchange either.
    expect(await proveLiveJoin({token, sig})).toEqual({
      ok: false,
      error: {kind: 'bad_response'},
    })
  })

  it('prove: the plain {ok: true} of a server before the exchange is server_outdated', async () => {
    // The recorded reply of a runtime without the exchange.
    rt.on('/live/join/prove', 'proveOk')
    const token = tokenOf('tokenForExchange')
    const sig = LIVE.proofs.tokenForExchange
    expect(await proveLiveJoin({token, sig})).toEqual({
      ok: false,
      error: {kind: 'server_outdated'},
    })
  })

  it('a request that never answers times out as a network error, and is aborted (d8f8f16e H2)', async () => {
    jest.useFakeTimers({doNotFake: ['Date']})
    try {
      let signal: AbortSignal | undefined
      ;(globalThis as {fetch: unknown}).fetch = (
        _u: string,
        i: RequestInit,
      ) => {
        signal = i.signal ?? undefined
        return new Promise<Response>(() => {})
      }
      const res = endLiveSession({sid: SID, auth: AUTH})
      await Promise.resolve()
      jest.advanceTimersByTime(LIVE_REQUEST_TIMEOUT_MS - 1)
      let settled = false
      void res.then(() => (settled = true))
      await Promise.resolve()
      expect(settled).toBe(false)
      jest.advanceTimersByTime(1)
      expect(await res).toEqual({ok: false, error: {kind: 'network'}})
      expect(signal?.aborted).toBe(true)
    } finally {
      jest.useRealTimers()
    }
  })

  it('malformed input never reaches the network', async () => {
    const bad = {ok: false, error: {kind: 'invalid_argument'}}
    expect(await requestLiveToken({sid: OWNER_DID, auth: AUTH})).toEqual(bad)
    expect(await endLiveSession({sid: '../x', auth: AUTH})).toEqual(bad)
    expect(await startLiveSession({agentDid: 'bob', auth: AUTH})).toEqual(bad)
    expect(
      await startLiveSession({
        agentDid: AGENT_DID,
        auth: AUTH,
        devicePubKey: 'short',
      }),
    ).toEqual(bad)
    expect(
      await submitLiveConsent({
        sid: SID,
        auth: AUTH,
        decisions: {ai_process: 'maybe' as never},
        textVersion: 'one-app-v1',
      }),
    ).toEqual(bad)
    expect(await proveLiveJoin({token: 'x', sig: 'y'})).toEqual(bad)
    expect(rt.sent).toHaveLength(0)
  })
})

describe('the runtime replies (live.json)', () => {
  it('a start before consent has a session and no token', async () => {
    rt.on('/live/sessions', 'startAwaitingConsent')
    const res = await startLiveSession({
      agentDid: AGENT_DID,
      auth: AUTH,
      devicePubKey: PK,
    })
    const body = reply('startAwaitingConsent').body
    expect(res).toEqual({
      ok: true,
      data: {
        sid: body.sid,
        region: body.region,
        wsUrl: body.wsUrl,
        join: null,
        consentRequired: body.consentRequired,
        recordPolicy: 'off',
        reused: false,
      },
    })
  })

  it('a reused session is marked reused', async () => {
    rt.on('/live/sessions', 'startReused')
    const res = await startLiveSession({agentDid: AGENT_DID, auth: AUTH})
    expect(res.ok && res.data.reused).toBe(true)
  })

  it('consent admitted carries the bound join token; partial is not admitted', async () => {
    rt.on('/live/sessions/:sid/consent', 'consentAdmitted', 'consentPartial')
    const args = {
      sid: SID,
      auth: AUTH,
      decisions: {},
      textVersion: 'one-app-v1',
    }
    expect(await submitLiveConsent(args)).toEqual({
      ok: true,
      data: {
        admitted: true,
        missing: [],
        join: {
          token: tokenOf('consentAdmitted'),
          expiresAt: reply('consentAdmitted').body.expiresAt,
          popRequired: true,
        },
        agent: reply('consentAdmitted').body.agent,
      },
    })
    expect(await submitLiveConsent(args)).toEqual({
      ok: true,
      data: {
        admitted: false,
        missing: reply('consentPartial').body.missing,
        join: null,
        agent: reply('consentPartial').body.agent,
      },
    })
  })

  it('a token: bound or not, with its ≤60 s expiry', async () => {
    rt.on('/live/sessions/:sid/token', 'tokenCamera', 'tokenUnbound')
    const bound = await requestLiveToken({
      sid: SID,
      auth: AUTH,
      camera: true,
      devicePubKey: PK,
    })
    expect(bound).toEqual({
      ok: true,
      data: {
        token: tokenOf('tokenCamera'),
        expiresAt: reply('tokenCamera').body.expiresAt,
        popRequired: true,
      },
    })
    const unbound = await requestLiveToken({sid: SID, auth: AUTH, camera: true})
    expect(unbound.ok && unbound.data.popRequired).toBe(false)
  })

  it.each([
    ['tokenBeforeConsent', {kind: 'consent_required'}],
    ['tokenAfterEnd', {kind: 'not_found'}],
    ['tokenOtherOwner', {kind: 'not_found'}],
  ])('token %s → %j', async (name, error) => {
    rt.on('/live/sessions/:sid/token', name)
    expect(await requestLiveToken({sid: SID, auth: AUTH})).toEqual({
      ok: false,
      error,
    })
  })

  it.each([
    ['startNotOwnedAgent', {kind: 'not_found'}],
    ['startSignedOut', {kind: 'signed_out'}],
  ])('start %s → %j', async (name, error) => {
    rt.on('/live/sessions', name)
    expect(await startLiveSession({agentDid: AGENT_DID, auth: AUTH})).toEqual({
      ok: false,
      error,
    })
  })

  it('a bad proof is bad_proof', async () => {
    rt.on('/live/join/prove', 'proveBadSignature')
    expect(
      await proveLiveJoin({
        token: tokenOf('tokenAfterRevoke'),
        sig: 'A'.repeat(86),
      }),
    ).toEqual({ok: false, error: {kind: 'bad_proof'}})
  })

  it('end is idempotent; another owner gets not_found', async () => {
    rt.on('/live/sessions/:sid/end', 'end', 'endAgain', 'endOtherOwner')
    expect((await endLiveSession({sid: SID, auth: AUTH})).ok).toBe(true)
    expect((await endLiveSession({sid: SID, auth: AUTH})).ok).toBe(true)
    expect(await endLiveSession({sid: SID, auth: AUTH})).toEqual({
      ok: false,
      error: {kind: 'not_found'},
    })
  })

  it.each([
    [
      'a token with no expiry',
      {...reply('tokenCamera').body, expiresAt: undefined},
    ],
    [
      'no token and no consentMissing',
      {...reply('startAwaitingConsent').body, consentMissing: undefined},
    ],
    ['bad sid', {...reply('startAwaitingConsent').body, sid: 'nope'}],
    [
      'http wsUrl',
      {...reply('startAwaitingConsent').body, wsUrl: 'https://x.test'},
    ],
  ])('%s is a bad_response', async (_name, body) => {
    rt.on('/live/sessions', {status: 200, body})
    expect(await startLiveSession({agentDid: AGENT_DID, auth: AUTH})).toEqual({
      ok: false,
      error: {kind: 'bad_response'},
    })
  })

  it('consentMissing wins over a stray token: the sheet is never skipped', async () => {
    rt.on('/live/sessions', {
      status: 200,
      body: {
        ...reply('startAwaitingConsent').body,
        token: tokenOf('tokenCamera'),
        expiresAt: 1,
      },
    })
    const res = await startLiveSession({agentDid: AGENT_DID, auth: AUTH})
    expect(res.ok && res.data.join).toBeNull()
  })

  it.each([
    [503, {kind: 'unavailable', status: 503}],
    [429, {kind: 'http', status: 429}],
    [403, {kind: 'http', status: 403}],
  ])('status %i maps to %j', async (status, error) => {
    rt.on('/live/sessions', {status, body: {error: 'x'}})
    expect(await startLiveSession({agentDid: AGENT_DID, auth: AUTH})).toEqual({
      ok: false,
      error,
    })
  })
})

describe('owner scope', () => {
  it('captures the signed-in account and its bearer; nobody signed in is null', async () => {
    expect(await captureLiveAuth()).toEqual({
      ownerDid: OWNER_DID,
      bearer: BEARER,
    })
    signedInAs(null, null)
    expect(await captureLiveAuth()).toBeNull()
  })

  it('still this account: its current (refreshed) bearer', async () => {
    signedInAs(OWNER_DID, 'refreshed-bearer')
    rt.on('/live/sessions/:sid/end', 'end')
    await endLiveSession({sid: SID, auth: AUTH})
    expect(rt.sent[0].headers.Authorization).toBe('Bearer refreshed-bearer')
  })

  it('H2: the pinned bearer follows the refresh, so after a sign-out the newest one goes out', async () => {
    signedInAs(OWNER_DID, 'refreshed-bearer')
    rt.on('/live/sessions/:sid/token', 'tokenForJoin')
    await requestLiveToken({sid: SID, auth: AUTH})
    expect(AUTH.bearer).toBe('refreshed-bearer')
    signedInAs(null, null)
    rt.on('/live/sessions/:sid/end', 'end')
    await endLiveSession({sid: SID, auth: AUTH})
    expect(rt.sent[1].headers.Authorization).toBe('Bearer refreshed-bearer')
  })

  it('after an account switch: the session account’s bearer, never the new one', async () => {
    signedInAs(OTHER_DID, OTHER_BEARER)
    rt.on('/live/sessions/:sid/end', 'end')
    await endLiveSession({sid: SID, auth: AUTH})
    expect(rt.sent[0].headers.Authorization).toBe(`Bearer ${BEARER}`)
    expect(mockBearer).not.toHaveBeenCalled()
  })

  it('after sign-out: the session account’s bearer', async () => {
    signedInAs(null, null)
    rt.on('/live/sessions/:sid/end', 'end')
    expect((await endLiveSession({sid: SID, auth: AUTH})).ok).toBe(true)
    expect(rt.sent[0].headers.Authorization).toBe(`Bearer ${BEARER}`)
  })

  it('no auth: nothing is sent', async () => {
    expect(
      await endLiveSession({sid: SID, auth: {ownerDid: '', bearer: ''}}),
    ).toEqual({ok: false, error: {kind: 'signed_out'}})
    expect(rt.sent).toHaveLength(0)
  })
})

describe('logs (X-LOG-1, client half)', () => {
  it('a network failure logs no token, bearer or DID', async () => {
    const token = tokenOf('tokenCamera')
    rt.on('/live/sessions', new Error(`boom ${token} ${BEARER} ${AGENT_DID}`))
    expect(await startLiveSession({agentDid: AGENT_DID, auth: AUTH})).toEqual({
      ok: false,
      error: {kind: 'network'},
    })
    const logged = JSON.stringify(
      Object.values(logger).flatMap(fn => (fn as jest.Mock).mock.calls),
    )
    expect(logged).not.toContain(token)
    expect(logged).not.toContain(BEARER)
    expect(logged).not.toMatch(/did:/)
  })
})
