import {afterEach, describe, expect, it, jest} from '@jest/globals'

import {
  createOwnerAgent,
  fetchOwnerAgents,
  normalizeCreatedAgent,
  normalizeOwnerAgents,
  pauseOwnerAgent,
} from '../agentsClient'
import {getSupabaseAccessToken} from '../authToken'

jest.mock('../authToken', () => ({getSupabaseAccessToken: jest.fn()}))

const mockToken = jest.mocked(getSupabaseAccessToken)
const realFetch = global.fetch
afterEach(() => {
  global.fetch = realFetch
  mockToken.mockReset()
})

function okJson(body: unknown) {
  return jest.fn(() =>
    Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(body)}),
  ) as unknown as typeof fetch
}

describe('normalizeOwnerAgents (pure)', () => {
  it('shapes rows, tolerates id/name aliases, and dedupes by handle', () => {
    const out = normalizeOwnerAgents({
      agents: [
        {handle: 'ada.pds.authority-one.com', displayName: 'Ada', avatar: null},
        {id: 'brian.pds.authority-one.com', name: 'Brian'}, // id + name aliases
        {handle: 'ADA.PDS.AUTHORITY-ONE.COM'}, // dupe (case-insensitive) → dropped
        {foo: 1}, // no handle → dropped
      ],
    })
    expect(out).toEqual([
      {
        handle: 'ada.pds.authority-one.com',
        displayName: 'Ada',
        avatar: undefined,
      },
      {
        handle: 'brian.pds.authority-one.com',
        displayName: 'Brian',
        avatar: undefined,
      },
    ])
  })

  it('returns [] when agents is missing or not an array', () => {
    expect(normalizeOwnerAgents({})).toEqual([])
    expect(normalizeOwnerAgents({agents: 'nope'})).toEqual([])
    expect(normalizeOwnerAgents(null)).toEqual([])
  })

  it('carries the enriched fields (number/paused/active/live)', () => {
    const out = normalizeOwnerAgents({
      agents: [
        {
          handle: 'fran-agent.pds.authority-one.com',
          displayName: 'Fran',
          number: '+16595555881',
          paused: false,
          active: true,
          live: true,
        },
      ],
    })
    expect(out[0]).toMatchObject({
      handle: 'fran-agent.pds.authority-one.com',
      number: '+16595555881',
      paused: false,
      active: true,
      live: true,
    })
  })

  it('derives live from active && !paused when not echoed; undefined when unenriched', () => {
    const out = normalizeOwnerAgents({
      agents: [
        {handle: 'a.pds.example.com', active: true, paused: false},
        {handle: 'b.pds.example.com', active: true, paused: true},
        {handle: 'c.pds.example.com'}, // legacy row: no enrichment at all
      ],
    })
    expect(out[0].live).toBe(true)
    expect(out[1].live).toBe(false)
    expect(out[2].live).toBeUndefined()
    expect(out[2].paused).toBeUndefined()
  })
})

describe('pauseOwnerAgent', () => {
  function status(code: number, body: unknown = {}) {
    return jest.fn(() =>
      Promise.resolve({
        ok: code >= 200 && code < 300,
        status: code,
        json: () => Promise.resolve(body),
      }),
    ) as unknown as typeof fetch
  }

  it('signed out -> no fetch, signedOut true', async () => {
    mockToken.mockResolvedValue(null)
    global.fetch = status(200)
    const res = await pauseOwnerAgent({paused: true})
    expect(res).toMatchObject({ok: false, signedOut: true})
    expect((global.fetch as unknown as jest.Mock).mock.calls).toHaveLength(0)
  })

  it('POSTs {agent, paused} to /app/agents/pause and echoes the result', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = status(200, {
      ok: true,
      agent: 'fran-agent.pds.authority-one.com',
      paused: true,
    })
    const res = await pauseOwnerAgent({
      agent: 'fran-agent.pds.authority-one.com',
      paused: true,
    })
    const call = (global.fetch as unknown as jest.Mock).mock.calls[0] as [
      string,
      {method: string; body: string},
    ]
    expect(String(call[0])).toContain('/app/agents/pause')
    expect(JSON.parse(call[1].body)).toEqual({
      agent: 'fran-agent.pds.authority-one.com',
      paused: true,
    })
    expect(res).toMatchObject({
      ok: true,
      agent: 'fran-agent.pds.authority-one.com',
      paused: true,
    })
  })

  it('omits agent for the token-mapped default', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = status(200, {ok: true, paused: false})
    await pauseOwnerAgent({paused: false})
    const call = (global.fetch as unknown as jest.Mock).mock.calls[0] as [
      string,
      {body: string},
    ]
    expect(JSON.parse(call[1].body)).toEqual({paused: false})
  })

  it('403 not-your-agent -> ownership error, NOT signedOut', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = status(403, {code: 'not-your-agent', error: 'nope'})
    const res = await pauseOwnerAgent({
      agent: 'other.pds.example.com',
      paused: true,
    })
    expect(res).toMatchObject({
      ok: false,
      signedOut: false,
      code: 'not-your-agent',
    })
  })

  it('uncoded 401 -> signedOut; network throw -> error', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = status(401)
    expect((await pauseOwnerAgent({paused: true})).signedOut).toBe(true)
    global.fetch = jest.fn(() => Promise.reject(new Error('boom')))
    const res = await pauseOwnerAgent({paused: true})
    expect(res.ok).toBe(false)
    expect(res.error).toBeDefined()
  })
})

describe('fetchOwnerAgents', () => {
  it('signed out -> no fetch, signedOut true', async () => {
    mockToken.mockResolvedValue(null)
    global.fetch = okJson({agents: []})
    const res = await fetchOwnerAgents()
    expect(res.signedOut).toBe(true)
    expect((global.fetch as unknown as jest.Mock).mock.calls).toHaveLength(0)
  })

  it('returns normalized agents on success, hitting /app/agents', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = okJson({
      agents: [{handle: 'ada.pds.authority-one.com', displayName: 'ada'}],
    })
    const res = await fetchOwnerAgents()
    const call = (global.fetch as unknown as jest.Mock).mock.calls[0]
    expect(String(call[0])).toContain('/app/agents')
    expect(res.agents).toEqual([
      {
        handle: 'ada.pds.authority-one.com',
        displayName: 'ada',
        avatar: undefined,
      },
    ])
  })

  it('401/403 -> signedOut, empty list', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() =>
      Promise.resolve({ok: false, status: 403}),
    ) as unknown as typeof fetch
    const res = await fetchOwnerAgents()
    expect(res.signedOut).toBe(true)
    expect(res.agents).toEqual([])
  })

  it('non-ok -> error, empty list (degrades)', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() =>
      Promise.resolve({ok: false, status: 500}),
    ) as unknown as typeof fetch
    const res = await fetchOwnerAgents()
    expect(res.agents).toEqual([])
    expect(res.error).toBeDefined()
  })
})

describe('normalizeCreatedAgent (pure)', () => {
  it('shapes the success echo', () => {
    expect(
      normalizeCreatedAgent(
        {
          handle: 'nova.pds.authority-one.com',
          did: 'did:plc:abc',
          number: '+14155550123',
          numberStatus: 'active',
          mode: 'full',
          intentId: 'int_1',
        },
        'nova',
      ),
    ).toEqual({
      handle: 'nova.pds.authority-one.com',
      did: 'did:plc:abc',
      number: '+14155550123',
      numberStatus: 'active',
      mode: 'full',
      intentId: 'int_1',
    })
  })

  it('falls back to the requested handle and null number on a sparse echo', () => {
    expect(normalizeCreatedAgent({}, 'nova')).toEqual({
      handle: 'nova',
      did: undefined,
      number: null,
      numberStatus: undefined,
      mode: undefined,
      intentId: undefined,
    })
  })
})

describe('createOwnerAgent', () => {
  function status(code: number, body: unknown = {}) {
    return jest.fn(() =>
      Promise.resolve({
        ok: code >= 200 && code < 300,
        status: code,
        json: () => Promise.resolve(body),
      }),
    ) as unknown as typeof fetch
  }

  it('signed out -> no fetch, signedOut true', async () => {
    mockToken.mockResolvedValue(null)
    global.fetch = status(200)
    const res = await createOwnerAgent({targetHandle: 'nova'})
    expect(res).toMatchObject({ok: false, signedOut: true, errorKind: 'auth'})
    expect((global.fetch as unknown as jest.Mock).mock.calls).toHaveLength(0)
  })

  it('POSTs the body to /app/agents and returns the created agent', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = status(200, {
      handle: 'nova.pds.authority-one.com',
      number: '+14155550123',
      numberStatus: 'active',
    })
    const res = await createOwnerAgent({
      targetHandle: 'nova',
      provisionNumber: true,
      areaCode: '415',
    })
    const call = (global.fetch as unknown as jest.Mock).mock.calls[0] as [
      string,
      {method: string; body: string},
    ]
    expect(String(call[0])).toContain('/app/agents')
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(call[1].body)).toEqual({
      targetHandle: 'nova',
      provisionNumber: true,
      areaCode: '415',
    })
    expect(res.ok).toBe(true)
    expect(res.data).toMatchObject({
      handle: 'nova.pds.authority-one.com',
      number: '+14155550123',
    })
  })

  it('omits provisionNumber/areaCode when a number is not requested', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = status(200, {handle: 'nova.pds.authority-one.com'})
    await createOwnerAgent({targetHandle: 'nova'})
    const call = (global.fetch as unknown as jest.Mock).mock.calls[0] as [
      string,
      {body: string},
    ]
    expect(JSON.parse(call[1].body)).toEqual({targetHandle: 'nova'})
  })

  it('402 -> errorKind limit', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = status(402, {error: 'payment_required'})
    const res = await createOwnerAgent({targetHandle: 'nova'})
    expect(res).toMatchObject({ok: false, signedOut: false, errorKind: 'limit'})
  })

  it('400 did-required -> errorKind did-required', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = status(400, {error: 'did-required'})
    const res = await createOwnerAgent({targetHandle: 'nova'})
    expect(res).toMatchObject({ok: false, errorKind: 'did-required'})
  })

  it('401 -> signedOut + errorKind auth', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = status(401)
    const res = await createOwnerAgent({targetHandle: 'nova'})
    expect(res).toMatchObject({ok: false, signedOut: true, errorKind: 'auth'})
  })

  it('other non-ok -> errorKind runtime, fetch throw -> errorKind network', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = status(500)
    expect((await createOwnerAgent({targetHandle: 'nova'})).errorKind).toBe(
      'runtime',
    )
    global.fetch = jest.fn(() => Promise.reject(new Error('boom')))
    expect((await createOwnerAgent({targetHandle: 'nova'})).errorKind).toBe(
      'network',
    )
  })
})
