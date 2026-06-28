import {afterEach, describe, expect, it, jest} from '@jest/globals'

import {getSupabaseAccessToken} from '../authToken'
import {
  createPersona,
  deletePersona,
  fetchPersonaDetail,
  fetchPersonas,
  normalizeKeywords,
  normalizeKnowledgeBase,
  normalizePersonaDetail,
  normalizePersonasResponse,
  pickActiveVoiceId,
  pickAgentHeaderName,
  setActivePersona,
  updatePersona,
} from '../personasClient'

jest.mock('../authToken', () => ({
  getSupabaseAccessToken: jest.fn(),
}))

const mockToken = jest.mocked(getSupabaseAccessToken)
const realFetch = global.fetch

afterEach(() => {
  global.fetch = realFetch
  mockToken.mockReset()
})

function mockOkJson(body: unknown) {
  global.fetch = jest.fn(() =>
    Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(body)}),
  ) as unknown as typeof fetch
}

describe('normalizePersonasResponse', () => {
  it('derives activeName/activeVoiceId from the active persona when not echoed', () => {
    const state = normalizePersonasResponse({
      personas: [
        {id: 'p1', name: 'Bob', voiceId: 'v1'},
        {id: 'p2', name: 'Ada', voiceId: 'v2', personality: 'curious'},
      ],
      activePersonaId: 'p2',
      voices: [{voiceId: 'v2', name: 'Ada Voice', default: true}],
    })
    expect(state.activePersonaId).toBe('p2')
    expect(state.activeName).toBe('Ada')
    expect(state.activeVoiceId).toBe('v2')
    expect(state.personas).toHaveLength(2)
    expect(state.voices[0].default).toBe(true)
  })

  it('prefers explicit activeName/activeVoiceId from the payload', () => {
    const state = normalizePersonasResponse({
      personas: [{id: 'p1', name: 'Bob', voiceId: 'v1'}],
      activePersonaId: 'p1',
      activeName: 'Override',
      activeVoiceId: 'vX',
      voices: [],
    })
    expect(state.activeName).toBe('Override')
    expect(state.activeVoiceId).toBe('vX')
  })

  it('is defensive: drops malformed entries, defaults name to id/voiceId', () => {
    const state = normalizePersonasResponse({
      personas: [{name: 'no id'}, {id: 'p1'}, null, 42],
      voices: [{name: 'no voiceId'}, {voiceId: 'v9'}],
    })
    expect(state.personas).toEqual([
      {id: 'p1', name: 'p1', voiceId: undefined, personality: undefined},
    ])
    expect(state.voices).toEqual([{voiceId: 'v9', name: 'v9', default: false}])
  })

  it('handles empty/missing input', () => {
    expect(normalizePersonasResponse(null)).toEqual({
      personas: [],
      voices: [],
      activePersonaId: undefined,
      activeName: undefined,
      activeVoiceId: undefined,
      migrated: false,
    })
  })
})

describe('pickAgentHeaderName (active persona feeds the header)', () => {
  it('uses the active persona name when present', () => {
    expect(pickAgentHeaderName('Ada', 'profile-fallback')).toBe('Ada')
  })
  it('falls back when the active name is missing/blank', () => {
    expect(pickAgentHeaderName(undefined, 'Fallback')).toBe('Fallback')
    expect(pickAgentHeaderName('   ', 'Fallback')).toBe('Fallback')
  })
})

describe('pickActiveVoiceId (active persona feeds voice mode)', () => {
  it('returns the active voice id, trimmed', () => {
    expect(pickActiveVoiceId('v2')).toBe('v2')
  })
  it('returns undefined when there is no active voice (runtime default applies)', () => {
    expect(pickActiveVoiceId(undefined)).toBeUndefined()
    expect(pickActiveVoiceId('  ')).toBeUndefined()
  })
})

describe('fetchPersonas', () => {
  it('returns signedOut when there is no token', async () => {
    mockToken.mockResolvedValue(null)
    const res = await fetchPersonas()
    expect(res).toEqual({signedOut: true})
  })

  it('returns normalized state on success', async () => {
    mockToken.mockResolvedValue('tok')
    mockOkJson({
      personas: [{id: 'p1', name: 'Bob', voiceId: 'v1'}],
      activePersonaId: 'p1',
      voices: [{voiceId: 'v1', name: 'Bob Voice'}],
    })
    const res = await fetchPersonas()
    expect(res.signedOut).toBe(false)
    expect(res.state?.activeName).toBe('Bob')
    expect(res.state?.activeVoiceId).toBe('v1')
  })

  it('treats 401/403 as no-state (not a hard error)', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() =>
      Promise.resolve({ok: false, status: 401}),
    ) as unknown as typeof fetch
    const res = await fetchPersonas()
    expect(res).toEqual({signedOut: false})
  })

  it('never throws on network error', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() => Promise.reject(new Error('offline')))
    const res = await fetchPersonas()
    expect(res.signedOut).toBe(false)
    expect(res.error).toBeDefined()
    expect(res.state).toBeUndefined()
  })
})

describe('CRUD request shaping', () => {
  it('POSTs the right bodies and is signed out without a token', async () => {
    mockToken.mockResolvedValue(null)
    expect(await createPersona({name: 'x'})).toEqual({
      ok: false,
      signedOut: true,
    })

    mockToken.mockResolvedValue('tok')
    mockOkJson({})
    // Nested split shape: identity + knowledgeBase.
    await createPersona({
      name: 'Ada',
      voiceId: 'v2',
      identity: {personality: 'curious'},
      knowledgeBase: {summary: 'a curious mind', entries: []},
    })
    await updatePersona({id: 'p2', name: 'Ada 2'})
    await deletePersona({id: 'p2'})
    await setActivePersona({id: 'p1'})

    const calls = (global.fetch as unknown as jest.Mock).mock.calls
    const byUrl = (suffix: string) =>
      calls.find(c => String(c[0]).endsWith(suffix))
    const bodyOf = (c: unknown[]) =>
      JSON.parse(String((c[1] as {body: string}).body))

    expect(bodyOf(byUrl('/app/personas')!)).toEqual({
      name: 'Ada',
      voiceId: 'v2',
      identity: {personality: 'curious'},
      knowledgeBase: {summary: 'a curious mind', entries: []},
    })
    expect(bodyOf(byUrl('/app/personas/update')!)).toMatchObject({
      id: 'p2',
      name: 'Ada 2',
    })
    expect(bodyOf(byUrl('/app/personas/delete')!)).toEqual({id: 'p2'})
    expect(bodyOf(byUrl('/app/personas/active')!)).toEqual({id: 'p1'})
  })

  it('returns the refreshed state when the runtime echoes a personas view', async () => {
    mockToken.mockResolvedValue('tok')
    mockOkJson({
      personas: [
        {id: 'p1', name: 'Bob'},
        {id: 'p2', name: 'Stormy'},
      ],
      activePersonaId: 'p1',
      voices: [{voiceId: 'v1', name: 'Bob'}],
    })
    const res = await createPersona({
      name: 'Stormy',
      identity: {personality: 'an ice hog'},
    })
    expect(res.ok).toBe(true)
    // The authoritative list comes back so the cache can update without a refetch.
    expect(res.state?.personas.map(p => p.name)).toEqual(['Bob', 'Stormy'])
  })

  it('surfaces the runtime 400 code (e.g. identity-too-long)', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({code: 'identity-too-long', error: 'too long'}),
      }),
    ) as unknown as typeof fetch
    const res = await createPersona({
      name: 'X',
      identity: {personality: 'x'.repeat(5000)},
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('identity-too-long')
    expect(res.error).toBe('too long')
  })
})

describe('normalizeKeywords (pure)', () => {
  it('accepts arrays or comma/newline strings; trims + dedupes', () => {
    expect(normalizeKeywords(['a', 'B', 'a'])).toEqual(['a', 'B'])
    expect(normalizeKeywords('trail, falls\nrocks, trail')).toEqual([
      'trail',
      'falls',
      'rocks',
    ])
    expect(normalizeKeywords(undefined)).toEqual([])
  })
})

describe('normalizeKnowledgeBase (pure)', () => {
  it('keeps summary + drops entries with no title and no body', () => {
    const kb = normalizeKnowledgeBase({
      summary: 'gist',
      entries: [
        {id: 'e1', title: 'Lore', keywords: 'a,b', body: 'deep'},
        {title: '', body: ''},
        null,
      ],
    })
    expect(kb.summary).toBe('gist')
    expect(kb.entries).toEqual([
      {id: 'e1', title: 'Lore', keywords: ['a', 'b'], body: 'deep'},
    ])
  })
})

describe('normalizePersonaDetail (pure)', () => {
  it('reads the nested {persona:{identity,knowledgeBase,fiction}} shape', () => {
    const d = normalizePersonaDetail({
      persona: {
        id: 'p1',
        name: 'Stormy',
        voiceId: 'v1',
        identity: {personality: 'an ice hog'},
        knowledgeBase: {
          summary: 'hockey star',
          entries: [{id: 'e1', title: 'Team', keywords: ['nhl'], body: '...'}],
        },
        fiction: {enabled: true, haunts: ['the rink']},
      },
    })
    expect(d?.identity.personality).toBe('an ice hog')
    expect(d?.knowledgeBase.summary).toBe('hockey star')
    expect(d?.knowledgeBase.entries[0].keywords).toEqual(['nhl'])
    expect(d?.fiction?.enabled).toBe(true)
  })

  it('lifts a legacy flat personality into identity; null without an id', () => {
    const d = normalizePersonaDetail({persona: {id: 'p2', personality: 'flat'}})
    expect(d?.identity.personality).toBe('flat')
    expect(d?.knowledgeBase.entries).toEqual([])
    expect(normalizePersonaDetail({persona: {name: 'no id'}})).toBeNull()
  })
})

describe('fetchPersonaDetail', () => {
  it('returns signedOut without a token', async () => {
    mockToken.mockResolvedValue(null)
    expect(await fetchPersonaDetail('p1')).toEqual({signedOut: true})
  })

  it('POSTs {id} and returns the normalized detail', async () => {
    mockToken.mockResolvedValue('tok')
    mockOkJson({persona: {id: 'p1', name: 'Bob', identity: {personality: 'x'}}})
    const res = await fetchPersonaDetail('p1')
    const call = (global.fetch as unknown as jest.Mock).mock.calls[0]
    expect(String(call[0])).toContain('/app/personas/get')
    expect(JSON.parse(String((call[1] as {body: string}).body))).toEqual({
      id: 'p1',
    })
    expect(res.detail?.identity.personality).toBe('x')
  })

  it('returns an error on non-ok (degrades)', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() =>
      Promise.resolve({ok: false, status: 500}),
    ) as unknown as typeof fetch
    const res = await fetchPersonaDetail('p1')
    expect(res.detail).toBeUndefined()
    expect(res.error).toContain('500')
  })

  it('omits state when the runtime body is not a personas view', async () => {
    mockToken.mockResolvedValue('tok')
    mockOkJson({ok: true})
    const res = await setActivePersona({id: 'p1'})
    expect(res.ok).toBe(true)
    expect(res.state).toBeUndefined()
  })
})
