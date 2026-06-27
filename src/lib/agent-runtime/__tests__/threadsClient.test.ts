import {afterEach, describe, expect, it, jest} from '@jest/globals'

import {getSupabaseAccessToken} from '../authToken'
import {
  createThread,
  fetchThreads,
  groupOp,
  groupOpBody,
  makeThreadTransport,
  memberOpFor,
  normalizeThread,
  normalizeThreads,
  sendToThread,
} from '../threadsClient'

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

describe('normalizeThread / normalizeThreads (pure)', () => {
  it('drops rows without an id and defaults fields', () => {
    expect(normalizeThread({foo: 1})).toBeNull()
    expect(normalizeThread({id: 'a'})).toEqual({
      id: 'a',
      kind: 'agent',
      personaId: undefined,
      title: 'Talk to Bob',
      lastMessage: undefined,
      unreadCount: 0,
      updatedAt: 0,
      membership: undefined,
    })
  })

  it('sorts pending invites first, then by updatedAt desc', () => {
    const out = normalizeThreads({
      threads: [
        {id: 'a', kind: 'group', title: 'A', updatedAt: 10},
        {id: 'b', kind: 'group', title: 'B', updatedAt: 50},
        {id: 'c', kind: 'group', title: 'C', updatedAt: 5, membership: 'pending'},
        null,
        {nope: true},
      ],
    })
    expect(out.map(t => t.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('memberOpFor (friend vs invite)', () => {
  const friends = new Set(['did:friend'])
  it('personas are always added directly', () => {
    expect(memberOpFor('persona', 'p1', friends)).toBe('add')
    expect(memberOpFor('persona', 'p1', [])).toBe('add')
  })
  it('a connected friend is added; a stranger is invited', () => {
    expect(memberOpFor('person', 'did:friend', friends)).toBe('add')
    expect(memberOpFor('person', 'did:stranger', friends)).toBe('invite')
    expect(memberOpFor('person', 'did:friend', ['did:friend'])).toBe('add')
  })
})

describe('groupOpBody (pure)', () => {
  it('keeps op and drops undefined fields', () => {
    expect(groupOpBody({op: 'leave'})).toEqual({op: 'leave'})
    expect(
      groupOpBody({op: 'add', memberId: 'x', memberKind: 'persona'}),
    ).toEqual({op: 'add', memberId: 'x', memberKind: 'persona'})
    expect(groupOpBody({op: 'admin', memberId: 'y', makeAdmin: true})).toEqual({
      op: 'admin',
      memberId: 'y',
      makeAdmin: true,
    })
  })
})

describe('fetchThreads', () => {
  it('signed out -> no fetch, signedOut true', async () => {
    mockToken.mockResolvedValue(null)
    global.fetch = okJson({threads: []})
    const res = await fetchThreads()
    expect(res.signedOut).toBe(true)
    expect((global.fetch as unknown as jest.Mock).mock.calls).toHaveLength(0)
  })
  it('returns normalized threads on success', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = okJson({threads: [{id: 'g1', kind: 'group', title: 'Fam'}]})
    const res = await fetchThreads()
    expect(res.threads).toHaveLength(1)
    expect(res.threads[0]).toMatchObject({id: 'g1', kind: 'group', title: 'Fam'})
  })
  it('non-ok -> error, empty list (degrades)', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() =>
      Promise.resolve({ok: false, status: 500}),
    ) as unknown as typeof fetch
    const res = await fetchThreads()
    expect(res.threads).toEqual([])
    expect(res.error).toBeDefined()
  })
})

describe('createThread', () => {
  it('POSTs kind/title and returns the created thread', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = okJson({id: 'g9', kind: 'group', title: 'Trip'})
    const res = await createThread({kind: 'group', title: 'Trip'})
    const call = (global.fetch as unknown as jest.Mock).mock.calls[0]
    expect(String(call[0])).toContain('/app/threads')
    expect(JSON.parse(String((call[1] as {body: string}).body))).toMatchObject({
      kind: 'group',
      title: 'Trip',
    })
    expect(res.ok).toBe(true)
    expect(res.data?.id).toBe('g9')
  })
})

describe('sendToThread', () => {
  it('POSTs to /threads/:id/send with message + image shapes; returns reply', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = okJson({message: 'hi back', mediaUrls: ['https://r2/x.png']})
    const res = await sendToThread('t1', {
      message: 'hi',
      imageUrls: ['https://r2/in.png'],
    })
    const call = (global.fetch as unknown as jest.Mock).mock.calls[0]
    expect(String(call[0])).toContain('/app/threads/t1/send')
    const body = JSON.parse(String((call[1] as {body: string}).body)) as {
      message?: string
      imageUrls?: string[]
      imageUrl?: string
    }
    expect(body.message).toBe('hi')
    expect(body.imageUrls).toEqual(['https://r2/in.png'])
    expect(body.imageUrl).toBe('https://r2/in.png') // tolerate both shapes
    expect(res.data?.message).toBe('hi back')
    expect(res.data?.mediaUrls).toEqual(['https://r2/x.png'])
  })
})

describe('groupOp', () => {
  it('POSTs the op body to /threads/:id/group', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = okJson({})
    await groupOp('t2', {op: 'invite', memberId: 'did:x', memberKind: 'person'})
    const call = (global.fetch as unknown as jest.Mock).mock.calls[0]
    expect(String(call[0])).toContain('/app/threads/t2/group')
    expect(JSON.parse(String((call[1] as {body: string}).body))).toEqual({
      op: 'invite',
      memberId: 'did:x',
      memberKind: 'person',
    })
  })
})

describe('makeThreadTransport', () => {
  it('drives the chat handlers from a thread send (delta + done)', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = okJson({message: 'group reply', mediaUrls: []})
    const transport = makeThreadTransport('t3')
    const deltas: string[] = []
    let doneMessage: string | undefined
    await new Promise<void>(resolve => {
      transport(
        {text: 'yo', history: []},
        {
          onTextDelta: d => deltas.push(d),
          onDone: result => {
            doneMessage = result?.message
            resolve()
          },
          onError: () => resolve(),
        },
      )
    })
    expect(deltas).toEqual(['group reply'])
    expect(doneMessage).toBe('group reply')
  })
})
