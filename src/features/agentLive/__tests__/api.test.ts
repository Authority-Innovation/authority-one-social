/**
 * Ruling 3 (r2 §6 step 2, R3, X-TOK-1): the app never sends the owner's DID or
 * any identity field. The bearer is the only identity. Also the response
 * reading against piece 1's shapes, and no token in any log line (X-LOG-1,
 * client half).
 */
import {beforeEach, describe, expect, it, jest} from '@jest/globals'

const BEARER = 'opaque-owner-session-bearer'

jest.mock('#/lib/agent-runtime/authToken', () => ({
  getAgentRuntimeAccessToken: jest.fn(() =>
    Promise.resolve('opaque-owner-session-bearer'),
  ),
}))
jest.mock('#/lib/agent-runtime/config', () => ({
  AGENT_RUNTIME_BASE_URL: 'https://runtime.test',
}))
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
import {
  AGENT_DID,
  CAMERA_TOKEN_FIXTURE,
  END_FIXTURE,
  OWNER_DID,
  SESSION_FIXTURE,
} from '../__fixtures__/piece1Live'
import {endLiveSession, requestLiveToken, startLiveSession} from '../api'

type Call = {url: string; init: RequestInit}
const calls: Call[] = []
let nextResponse: {status: number; body: unknown}

const fetchMock = jest.fn((url: string, init: RequestInit) => {
  calls.push({url, init})
  const {status, body} = nextResponse
  const text = typeof body === 'string' ? body : JSON.stringify(body ?? null)
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
  } as Response)
})

/** The request body as sent (always a string or absent). */
const rawBody = (c: Call): string =>
  typeof c.init.body === 'string' ? c.init.body : ''

beforeEach(() => {
  calls.length = 0
  fetchMock.mockClear()
  ;(globalThis as {fetch: unknown}).fetch = fetchMock
  for (const fn of Object.values(logger)) (fn as jest.Mock).mockClear()
  ;(getAgentRuntimeAccessToken as jest.Mock<() => Promise<string | null>>)
    .mockReset()
    .mockResolvedValue(BEARER)
})

// Identity keys the runtime never reads from a body (piece 1 R3 comment).
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

function bodyOf(c: Call): Record<string, unknown> | undefined {
  return c.init.body === undefined
    ? undefined
    : (JSON.parse(rawBody(c)) as Record<string, unknown>)
}

function expectNoIdentity(c: Call) {
  const u = new URL(c.url)
  // No query string at all, so nothing can ride there.
  expect(u.search).toBe('')
  expect([...u.searchParams.keys()]).toEqual([])
  // The owner's DID appears nowhere in the request.
  const headers = JSON.stringify(c.init.headers)
  expect(c.url).not.toContain(OWNER_DID)
  expect(rawBody(c)).not.toContain(OWNER_DID)
  expect(headers).not.toContain(OWNER_DID)
  expect(headers).not.toMatch(/did:/)
  // The bearer is the only identity, sent as the Authorization header.
  expect(c.init.headers).toMatchObject({Authorization: `Bearer ${BEARER}`})
  const body = bodyOf(c)
  for (const k of allKeys(body)) expect(IDENTITY_KEYS).not.toContain(k)
}

describe('ruling 3: no DID or identity field leaves the app', () => {
  it('start: body is exactly {agentDid}, empty query, no owner DID', async () => {
    nextResponse = {status: 200, body: SESSION_FIXTURE}
    const res = await startLiveSession({agentDid: AGENT_DID})
    expect(res.ok).toBe(true)
    expect(calls).toHaveLength(1)
    const [c] = calls
    expect(c.init.method).toBe('POST')
    expect(new URL(c.url).pathname).toBe('/live/sessions')
    expect(Object.keys(bodyOf(c)!)).toEqual(['agentDid'])
    expect(bodyOf(c)).toEqual({agentDid: AGENT_DID})
    // The agent's DID is the only DID, and only as the `agentDid` value.
    const rest = {...bodyOf(c)}
    delete rest.agentDid
    expect(JSON.stringify(rest)).not.toMatch(/did:/)
    expectNoIdentity(c)
  })

  it('start: extra caller fields cannot ride along', async () => {
    nextResponse = {status: 200, body: SESSION_FIXTURE}
    const smuggled = {
      agentDid: AGENT_DID,
      ownerDid: OWNER_DID,
      identity: `owner:x:${OWNER_DID}`,
    }
    await startLiveSession(smuggled)
    expect(bodyOf(calls[0])).toEqual({agentDid: AGENT_DID})
    expectNoIdentity(calls[0])
  })

  it('token: body is exactly {camera}, no DID at all, empty query', async () => {
    nextResponse = {status: 200, body: CAMERA_TOKEN_FIXTURE}
    const res = await requestLiveToken({sid: SESSION_FIXTURE.sid, camera: true})
    expect(res).toEqual({ok: true, data: CAMERA_TOKEN_FIXTURE})
    const [c] = calls
    expect(new URL(c.url).pathname).toBe(
      `/live/sessions/${SESSION_FIXTURE.sid}/token`,
    )
    expect(bodyOf(c)).toEqual({camera: true})
    expect(rawBody(c)).not.toMatch(/did:/)
    expect(c.url).not.toMatch(/did:/)
    expectNoIdentity(c)
  })

  it('end: no body, no DID at all, empty query', async () => {
    nextResponse = {status: 200, body: END_FIXTURE}
    const res = await endLiveSession({sid: SESSION_FIXTURE.sid})
    expect(res).toEqual({ok: true, data: null})
    const [c] = calls
    expect(new URL(c.url).pathname).toBe(
      `/live/sessions/${SESSION_FIXTURE.sid}/end`,
    )
    expect(c.init.body).toBeUndefined()
    expect(c.url).not.toMatch(/did:/)
    expectNoIdentity(c)
  })

  it('a malformed sid or agent DID never reaches the network', async () => {
    nextResponse = {status: 200, body: CAMERA_TOKEN_FIXTURE}
    expect(await requestLiveToken({sid: OWNER_DID})).toEqual({
      ok: false,
      error: {kind: 'invalid_argument'},
    })
    expect(await endLiveSession({sid: '../x'})).toEqual({
      ok: false,
      error: {kind: 'invalid_argument'},
    })
    expect(await startLiveSession({agentDid: 'bob'})).toEqual({
      ok: false,
      error: {kind: 'invalid_argument'},
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('signed out: nothing is sent', async () => {
    ;(
      getAgentRuntimeAccessToken as jest.Mock<() => Promise<string | null>>
    ).mockResolvedValue(null)
    expect(await startLiveSession({agentDid: AGENT_DID})).toEqual({
      ok: false,
      error: {kind: 'signed_out'},
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('reading piece 1 responses', () => {
  it('reads the session fixture field by field', async () => {
    nextResponse = {
      status: 200,
      body: {...SESSION_FIXTURE, extra: 'dropped', ownerDid: OWNER_DID},
    }
    const res = await startLiveSession({agentDid: AGENT_DID})
    expect(res).toEqual({ok: true, data: SESSION_FIXTURE})
  })

  it.each([
    ['no token', {...SESSION_FIXTURE, token: undefined}],
    ['bad sid', {...SESSION_FIXTURE, sid: 'nope'}],
    ['http wsUrl', {...SESSION_FIXTURE, wsUrl: 'https://x.test'}],
    ['non-JSON', 'not json'],
  ])('%s is a bad_response', async (_name, body) => {
    nextResponse = {status: 200, body}
    expect(await startLiveSession({agentDid: AGENT_DID})).toEqual({
      ok: false,
      error: {kind: 'bad_response'},
    })
  })

  it.each([
    [401, {kind: 'signed_out'}],
    [404, {kind: 'not_found'}],
    [503, {kind: 'unavailable', status: 503}],
    [429, {kind: 'http', status: 429}],
  ])('status %i maps to %j', async (status, error) => {
    nextResponse = {status, body: {error: 'x'}}
    expect(await startLiveSession({agentDid: AGENT_DID})).toEqual({
      ok: false,
      error,
    })
  })
})

describe('logs (X-LOG-1, client half)', () => {
  it('a network failure logs no token, bearer or DID', async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.reject(new Error(`boom ${SESSION_FIXTURE.token} ${BEARER} ${AGENT_DID}`)),
    )
    expect(await startLiveSession({agentDid: AGENT_DID})).toEqual({
      ok: false,
      error: {kind: 'network'},
    })
    const logged = JSON.stringify(
      Object.values(logger).flatMap(fn => (fn as jest.Mock).mock.calls),
    )
    expect(logged).not.toContain(SESSION_FIXTURE.token)
    expect(logged).not.toContain(BEARER)
    expect(logged).not.toMatch(/did:/)
  })
})
