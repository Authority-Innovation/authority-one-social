import {afterEach, describe, expect, it, jest} from '@jest/globals'

import {getSupabaseAccessToken} from '../authToken'
import {
  deleteKnowledgeFile,
  fetchKnowledgeFiles,
  knowledgeRemovalMessage,
  setKnowledgeFileEnabled,
} from '../knowledgeClient'

jest.mock('../authToken', () => ({getSupabaseAccessToken: jest.fn()}))

const mockToken = jest.mocked(getSupabaseAccessToken)
const realFetch = global.fetch
afterEach(() => {
  global.fetch = realFetch
  mockToken.mockReset()
})

function jsonRes(body: unknown, status = 200) {
  return jest.fn(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    }),
  ) as unknown as typeof fetch
}

describe('deleteKnowledgeFile', () => {
  it('resolves the full contract shape on a purged delete', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jsonRes({
      ok: true,
      id: 'kf1',
      removed: true,
      upstream: 'purged',
      message: 'File and upstream copies deleted.',
    })
    const res = await deleteKnowledgeFile('kf1')
    expect(res).toEqual({
      ok: true,
      signedOut: false,
      id: 'kf1',
      removed: true,
      upstream: 'purged',
      message: 'File and upstream copies deleted.',
    })
  })

  it('issues DELETE on /app/knowledge/{id} with the bearer and agent scope', async () => {
    mockToken.mockResolvedValue('tok')
    const fetchMock = jsonRes({ok: true, id: 'a b', removed: true})
    global.fetch = fetchMock
    await deleteKnowledgeFile('a b', 'ada.pds.authority-one.com')
    const [url, init] = (fetchMock as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(url).toMatch(
      /\/app\/knowledge\/a%20b\?agent=ada\.pds\.authority-one\.com$/,
    )
    expect(init.method).toBe('DELETE')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer tok',
    )
  })

  it('passes retained upstream through and drops unknown upstream values', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jsonRes({
      ok: true,
      id: 'kf1',
      removed: true,
      upstream: 'retained',
    })
    expect((await deleteKnowledgeFile('kf1')).upstream).toBe('retained')
    global.fetch = jsonRes({
      ok: true,
      id: 'kf1',
      removed: true,
      upstream: 'vaporized',
    })
    expect((await deleteKnowledgeFile('kf1')).upstream).toBeUndefined()
  })

  it('maps a 404 to code not-found', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jsonRes({error: 'no such file'}, 404)
    const res = await deleteKnowledgeFile('missing')
    expect(res.ok).toBe(false)
    expect(res.code).toBe('not-found')
    expect(res.error).toBe('no such file')
  })

  it('keeps a coded 403 as an ownership error, not signedOut', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jsonRes({code: 'not-your-agent', error: 'nope'}, 403)
    const res = await deleteKnowledgeFile('kf1')
    expect(res).toMatchObject({
      ok: false,
      signedOut: false,
      code: 'not-your-agent',
    })
  })

  it('degrades an uncoded 401 to signedOut', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jsonRes({}, 401)
    expect(await deleteKnowledgeFile('kf1')).toEqual({
      ok: false,
      signedOut: true,
    })
  })

  it('reports signedOut with no token and never calls fetch', async () => {
    mockToken.mockResolvedValue(null)
    const fetchMock = jsonRes({})
    global.fetch = fetchMock
    expect(await deleteKnowledgeFile('kf1')).toEqual({
      ok: false,
      signedOut: true,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns a typed error on network failure instead of throwing', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() => Promise.reject(new Error('boom')))
    const res = await deleteKnowledgeFile('kf1')
    expect(res).toEqual({ok: false, signedOut: false, error: 'boom'})
  })

  it('rejects an empty id locally as not-found', async () => {
    const res = await deleteKnowledgeFile('')
    expect(res.ok).toBe(false)
    expect(res.code).toBe('not-found')
  })
})

describe('fetchKnowledgeFiles enabled flag', () => {
  it('defaults legacy rows (no enabled field) to enabled and passes false through', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jsonRes({
      files: [
        {id: 'kf_legacy', name: 'a.txt'},
        {id: 'kf_off', name: 'b.txt', enabled: false},
        {id: 'kf_on', name: 'c.txt', enabled: true},
      ],
    })
    const res = await fetchKnowledgeFiles()
    expect(res.files?.map(f => [f.id, f.enabled])).toEqual([
      ['kf_legacy', true],
      ['kf_off', false],
      ['kf_on', true],
    ])
  })
})

describe('setKnowledgeFileEnabled', () => {
  it('issues PATCH on /app/knowledge/{id} with a JSON boolean body and agent scope', async () => {
    mockToken.mockResolvedValue('tok')
    const fetchMock = jsonRes({ok: true, id: 'kf 1', enabled: false})
    global.fetch = fetchMock
    await setKnowledgeFileEnabled('kf 1', false, 'ada.pds.authority-one.com')
    const [url, init] = (fetchMock as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(url).toMatch(
      /\/app\/knowledge\/kf%201\?agent=ada\.pds\.authority-one\.com$/,
    )
    expect(init.method).toBe('PATCH')
    expect(init.body).toBe('{"enabled":false}')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tok')
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('resolves the full contract shape on a real change', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jsonRes({
      ok: true,
      id: 'kf_1',
      enabled: false,
      changed: true,
      name: 'a.txt',
      message: 'Turned off “a.txt” — some earlier events remain visible.',
    })
    expect(await setKnowledgeFileEnabled('kf_1', false)).toEqual({
      ok: true,
      signedOut: false,
      id: 'kf_1',
      enabled: false,
      changed: true,
      name: 'a.txt',
      message: 'Turned off “a.txt” — some earlier events remain visible.',
    })
  })

  it('treats an idempotent changed:false response as success, not an error', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jsonRes({
      ok: true,
      id: 'kf_1',
      enabled: true,
      changed: false,
      name: 'a.txt',
      message: '“a.txt” was already on.',
    })
    const res = await setKnowledgeFileEnabled('kf_1', true)
    expect(res.ok).toBe(true)
    expect(res.changed).toBe(false)
    expect(res.error).toBeUndefined()
    expect(res.message).toBe('“a.txt” was already on.')
  })

  it('surfaces a 409 deleted item as code deleted, not signedOut', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jsonRes(
      {code: 'deleted', error: 'That file was deleted.'},
      409,
    )
    const res = await setKnowledgeFileEnabled('kf_1', true)
    expect(res).toMatchObject({
      ok: false,
      signedOut: false,
      code: 'deleted',
      error: 'That file was deleted.',
    })
  })

  it('maps a 404 to code not-found', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jsonRes({error: 'no such file'}, 404)
    const res = await setKnowledgeFileEnabled('missing', false)
    expect(res.ok).toBe(false)
    expect(res.code).toBe('not-found')
  })

  it('keeps a coded 403 as an ownership error, not signedOut', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jsonRes({code: 'not-your-agent', error: 'nope'}, 403)
    expect(await setKnowledgeFileEnabled('kf_1', false)).toMatchObject({
      ok: false,
      signedOut: false,
      code: 'not-your-agent',
    })
  })

  it('degrades an uncoded 401 to signedOut', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jsonRes({}, 401)
    expect(await setKnowledgeFileEnabled('kf_1', false)).toEqual({
      ok: false,
      signedOut: true,
    })
  })

  it('reports signedOut with no token and never calls fetch', async () => {
    mockToken.mockResolvedValue(null)
    const fetchMock = jsonRes({})
    global.fetch = fetchMock
    expect(await setKnowledgeFileEnabled('kf_1', false)).toEqual({
      ok: false,
      signedOut: true,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns a typed error on network failure instead of throwing', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() => Promise.reject(new Error('boom')))
    expect(await setKnowledgeFileEnabled('kf_1', false)).toEqual({
      ok: false,
      signedOut: false,
      error: 'boom',
    })
  })

  it('rejects an empty id locally as not-found', async () => {
    const res = await setKnowledgeFileEnabled('', true)
    expect(res.ok).toBe(false)
    expect(res.code).toBe('not-found')
  })
})

describe('knowledgeRemovalMessage (honest upstream copy)', () => {
  const base = {fileName: 'notes.md', agentLabel: 'Ada'}

  it('claims deletion only when upstream is purged', () => {
    expect(knowledgeRemovalMessage({...base, upstream: 'purged'})).toBe(
      'Deleted “notes.md” from Ada’s knowledge base.',
    )
  })

  it.each(['retained', 'unsupported', undefined] as const)(
    'never claims destruction when upstream is %s',
    upstream => {
      const msg = knowledgeRemovalMessage({...base, upstream})
      expect(msg).toBe(
        'Removed “notes.md” from Ada’s knowledge base — Ada can no longer read or recall it.',
      )
      expect(msg).not.toMatch(/deleted|destroyed|erased/i)
    },
  )

  it('appends the runtime detail without duplicating our line', () => {
    expect(
      knowledgeRemovalMessage({
        ...base,
        upstream: 'retained',
        runtimeMessage:
          'The memory store is append-only; the raw record persists.',
      }),
    ).toBe(
      'Removed “notes.md” from Ada’s knowledge base — Ada can no longer read or recall it. The memory store is append-only; the raw record persists.',
    )
    const line =
      'Removed “notes.md” from Ada’s knowledge base — Ada can no longer read or recall it.'
    expect(
      knowledgeRemovalMessage({
        ...base,
        upstream: 'retained',
        runtimeMessage: line,
      }),
    ).toBe(line)
  })
})
