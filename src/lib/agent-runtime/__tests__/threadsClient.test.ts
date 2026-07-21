import {afterEach, describe, expect, it, jest} from '@jest/globals'

import {getSupabaseAccessToken} from '../authToken'
import {
  createThread,
  deleteThread,
  fetchThreadMembers,
  fetchThreadMessages,
  fetchThreads,
  groupOp,
  groupOpBody,
  isCreatorIdentity,
  makeThreadTransport,
  memberOpFor,
  normalizeMembers,
  normalizeRoster,
  normalizeThread,
  normalizeThreads,
  pickThreadId,
  removeThreadMember,
  renameThread,
  rosterAgentKeys,
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
        {
          id: 'c',
          kind: 'group',
          title: 'C',
          updatedAt: 5,
          membership: 'pending',
        },
        null,
        {nope: true},
      ],
    })
    expect(out.map(t => t.id)).toEqual(['c', 'b', 'a'])
  })

  it('only a true live flag marks a thread live', () => {
    expect(normalizeThread({id: 'a', live: true})?.live).toBe(true)
    expect(normalizeThread({id: 'b', live: 'yes'})?.live).toBeUndefined()
    expect(normalizeThread({id: 'c', live: false})?.live).toBeUndefined()
    expect(normalizeThread({id: 'd'})?.live).toBeUndefined()
  })

  it('pins live rooms above pending invites and everything else', () => {
    const out = normalizeThreads({
      threads: [
        {id: 'a', kind: 'group', title: 'A', updatedAt: 100},
        {
          id: 'b',
          kind: 'group',
          title: 'B',
          updatedAt: 5,
          membership: 'pending',
        },
        {id: 'c', kind: 'group', title: 'C', updatedAt: 1, live: true},
      ],
    })
    expect(out.map(t => t.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('rosterAgentKeys (pure)', () => {
  it('collects lowercased ids and handles of AGENT members only', () => {
    const keys = rosterAgentKeys({
      creatorDid: 'did:plc:owner',
      members: [
        {id: 'did:plc:human', kind: 'person'},
        {
          id: 'did:plc:agent1',
          kind: 'agent',
          handle: 'Ada.PDS.Authority-One.com',
        },
        {id: 'Bull.pds.authority-one.com', kind: 'person', isAgent: true},
        {id: 'p1', kind: 'persona'},
      ],
    })
    expect(keys).toEqual([
      'did:plc:agent1',
      'ada.pds.authority-one.com',
      'bull.pds.authority-one.com',
    ])
  })

  it('returns empty for undefined or agent-free rosters', () => {
    expect(rosterAgentKeys(undefined)).toEqual([])
    expect(
      rosterAgentKeys({members: [{id: 'did:plc:human', kind: 'person'}]}),
    ).toEqual([])
  })
})

describe('memberOpFor (friend vs invite)', () => {
  const friends = new Set(['did:friend'])
  it('personas are always added directly', () => {
    expect(memberOpFor('persona', 'p1', friends)).toBe('add')
    expect(memberOpFor('persona', 'p1', [])).toBe('add')
  })
  it('agents are always added directly (a chosen agent does not accept an invite)', () => {
    expect(memberOpFor('agent', 'ada.pds.authority-one.com', friends)).toBe(
      'add',
    )
    expect(memberOpFor('agent', 'ada.pds.authority-one.com', [])).toBe('add')
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
    expect(res.threads[0]).toMatchObject({
      id: 'g1',
      kind: 'group',
      title: 'Fam',
    })
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

  it('a GROUP create never sends personaId (no persona pinned / no agent auto-added)', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = okJson({id: 'g12', kind: 'group', title: 'Fam'})
    // Even if a caller passes a personaId, a group must not pin it.
    await createThread({
      kind: 'group',
      title: 'Fam',
      personaId: 'p_stormy',
    } as never)
    const call = (global.fetch as unknown as jest.Mock).mock.calls[0]
    const body = JSON.parse(String((call[1] as {body: string}).body)) as {
      kind?: string
      personaId?: string
    }
    expect(body.kind).toBe('group')
    expect(body.personaId).toBeUndefined()
  })

  it('an AGENT (1:1) thread may still pin a personaId', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = okJson({id: 'a1', kind: 'agent', title: 'Chat'})
    await createThread({kind: 'agent', title: 'Chat', personaId: 'p_x'})
    const call = (global.fetch as unknown as jest.Mock).mock.calls[0]
    const body = JSON.parse(String((call[1] as {body: string}).body)) as {
      kind?: string
      personaId?: string
    }
    expect(body.personaId).toBe('p_x')
  })

  it('recovers the id when the runtime nests the created thread', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = okJson({ok: true, thread: {id: 'g10'}})
    const res = await createThread({kind: 'group', title: 'Trip'})
    expect(res.ok).toBe(true)
    // The title falls back to the requested name since the envelope omitted it.
    expect(res.data?.id).toBe('g10')
    expect(res.data?.title).toBe('Trip')
  })

  it('recovers a bare threadId field (no nested object)', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = okJson({threadId: 'g11'})
    const res = await createThread({kind: 'group', title: 'Fam'})
    expect(res.ok).toBe(true)
    expect(res.data?.id).toBe('g11')
  })

  it('reports ok (no data) on a 2xx with no recoverable id', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = okJson({status: 'created'})
    const res = await createThread({kind: 'group', title: 'Trip'})
    // A 2xx means it WAS created; we must not surface a false failure.
    expect(res.ok).toBe(true)
    expect(res.data).toBeUndefined()
  })
})

describe('pickThreadId (pure)', () => {
  it('reads flat, nested, and bare-id shapes; undefined otherwise', () => {
    expect(pickThreadId({id: 'a'})).toBe('a')
    expect(pickThreadId({threadId: 'b'})).toBe('b')
    expect(pickThreadId({sid: 'c'})).toBe('c')
    expect(pickThreadId({thread: {id: 'd'}})).toBe('d')
    expect(pickThreadId({data: {threadId: 'e'}})).toBe('e')
    expect(pickThreadId({ok: true})).toBeUndefined()
    expect(pickThreadId(null)).toBeUndefined()
  })
})

describe('normalizeMembers (pure)', () => {
  it('drops rows without an id and orders owner/admin/member/pending', () => {
    const out = normalizeMembers({
      members: [
        {id: 'm', role: 'member'},
        {foo: 1},
        {id: 'p', role: 'pending'},
        {id: 'o', role: 'owner'},
        {id: 'a', role: 'admin', kind: 'persona'},
      ],
    })
    expect(out.map(m => m.id)).toEqual(['o', 'a', 'm', 'p'])
    expect(out.find(m => m.id === 'a')?.kind).toBe('persona')
  })

  it('surfaces an agent member with kind:agent + isAgent (from kind or the isAgent flag)', () => {
    const out = normalizeMembers({
      members: [
        {handle: 'ada.pds.authority-one.com', kind: 'agent', role: 'agent'},
        {handle: 'brian.pds', isAgent: true, role: 'agent'},
        {did: 'did:plc:human', role: 'member'},
      ],
    })
    const ada = out.find(m => m.handle === 'ada.pds.authority-one.com')
    expect(ada?.kind).toBe('agent')
    expect(ada?.isAgent).toBe(true)
    const brian = out.find(m => m.handle === 'brian.pds')
    expect(brian?.kind).toBe('agent')
    expect(brian?.isAgent).toBe(true)
    const human = out.find(m => m.id === 'did:plc:human')
    expect(human?.kind).toBe('person')
    expect(human?.isAgent).toBeUndefined()
  })

  it('returns [] when members is missing or not an array', () => {
    expect(normalizeMembers({})).toEqual([])
    expect(normalizeMembers({members: 'nope'})).toEqual([])
  })
})

describe('normalizeRoster (pure)', () => {
  it('reads creatorDid + members (mapping did -> id)', () => {
    const out = normalizeRoster({
      creatorDid: 'did:owner',
      members: [
        {did: 'did:owner', handle: 'o.test', name: 'Owner', role: 'owner'},
        {did: 'did:m', handle: 'm.test', role: 'member'},
      ],
    })
    expect(out.creatorDid).toBe('did:owner')
    expect(out.members.map(m => m.id)).toEqual(['did:owner', 'did:m'])
    expect(out.members[0].name).toBe('Owner')
  })

  it('defaults to an empty roster with no creatorDid', () => {
    expect(normalizeRoster({})).toEqual({creatorDid: undefined, members: []})
    expect(normalizeRoster(null)).toEqual({creatorDid: undefined, members: []})
  })

  it('keeps a handle-only member (did null) — falls the id back to handle', () => {
    const out = normalizeRoster({
      creatorDid: 'alice.test',
      members: [
        {did: null, handle: 'alice.test', name: 'Alice', role: 'owner'},
        {did: 'did:bob', handle: null, role: 'member'},
      ],
    })
    // The handle-only member is NOT dropped (the old id chain had no handle fallback).
    expect(out.members).toHaveLength(2)
    expect(out.members[0].id).toBe('alice.test')
    expect(out.members[1].id).toBe('did:bob')
  })
})

describe('isCreatorIdentity (creator gating)', () => {
  const me = {did: 'did:plc:me', handle: 'me.pds.authority-one.com'}

  it('matches when creatorId is the user did', () => {
    expect(isCreatorIdentity('did:plc:me', me)).toBe(true)
  })

  it('matches when creatorId is the user HANDLE (the live-bug case)', () => {
    expect(isCreatorIdentity('me.pds.authority-one.com', me)).toBe(true)
    // case-insensitive
    expect(isCreatorIdentity('ME.PDS.Authority-One.com', me)).toBe(true)
  })

  it('does not match a different identity, or with no creatorId', () => {
    expect(isCreatorIdentity('did:plc:other', me)).toBe(false)
    expect(isCreatorIdentity('someone.else', me)).toBe(false)
    expect(isCreatorIdentity(undefined, me)).toBe(false)
    expect(isCreatorIdentity('', me)).toBe(false)
  })
})

describe('fetchThreadMembers', () => {
  it('returns an empty roster (no fetch) when signed out', async () => {
    mockToken.mockResolvedValue(null)
    const spy = okJson({members: [{id: 'x'}]})
    global.fetch = spy
    expect(await fetchThreadMembers('g1')).toEqual({members: []})
    expect((spy as unknown as jest.Mock).mock.calls).toHaveLength(0)
  })

  it('returns the normalized roster (creatorDid + members) on success', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = okJson({
      creatorDid: 'did:o',
      members: [{did: 'did:o', role: 'owner', handle: 'o.test'}],
    })
    const out = await fetchThreadMembers('g1')
    expect(out.creatorDid).toBe('did:o')
    expect(out.members).toEqual([
      {
        id: 'did:o',
        kind: 'person',
        name: undefined,
        handle: 'o.test',
        role: 'owner',
      },
    ])
  })

  it('returns an empty roster on non-ok (degrades, e.g. endpoint not deployed)', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() =>
      Promise.resolve({ok: false, status: 405}),
    ) as unknown as typeof fetch
    expect(await fetchThreadMembers('g1')).toEqual({members: []})
  })
})

describe('group admin writes (rename/remove/delete)', () => {
  it('renameThread POSTs {name} to /rename', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = okJson({})
    const res = await renameThread('g1', 'Family')
    const call = (global.fetch as unknown as jest.Mock).mock.calls[0]
    expect(String(call[0])).toContain('/app/threads/g1/rename')
    expect(JSON.parse(String((call[1] as {body: string}).body))).toEqual({
      name: 'Family',
    })
    expect(res.ok).toBe(true)
  })

  it('removeThreadMember POSTs {did} to /members/remove', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = okJson({})
    const res = await removeThreadMember('g1', 'did:x')
    const call = (global.fetch as unknown as jest.Mock).mock.calls[0]
    expect(String(call[0])).toContain('/app/threads/g1/members/remove')
    expect(JSON.parse(String((call[1] as {body: string}).body))).toEqual({
      did: 'did:x',
    })
    expect(res.ok).toBe(true)
  })

  it('deleteThread POSTs to /delete', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = okJson({})
    const res = await deleteThread('g1')
    const call = (global.fetch as unknown as jest.Mock).mock.calls[0]
    expect(String(call[0])).toContain('/app/threads/g1/delete')
    expect(res.ok).toBe(true)
  })

  it('surfaces signed-out and non-ok as not-ok (no false success)', async () => {
    mockToken.mockResolvedValue(null)
    expect(await renameThread('g1', 'x')).toEqual({ok: false, signedOut: true})

    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() =>
      Promise.resolve({ok: false, status: 500}),
    ) as unknown as typeof fetch
    const res = await deleteThread('g1')
    expect(res.ok).toBe(false)
    expect(res.error).toContain('500')
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

  it('sends the device IANA `timezone` on the thread lane too', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = okJson({message: 'ok'})
    await sendToThread('t1', {message: 'hi'})
    const call = (global.fetch as unknown as jest.Mock).mock.calls[0]
    const body = JSON.parse(String((call[1] as {body: string}).body)) as {
      timezone?: string
    }
    expect(body.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
  })

  it('omits `timezone` when the zone cannot be resolved', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = okJson({message: 'ok'})
    const spy = jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('Intl unavailable')
    })
    try {
      await sendToThread('t1', {message: 'hi'})
    } finally {
      spy.mockRestore()
    }
    const call = (global.fetch as unknown as jest.Mock).mock.calls[0]
    const body = JSON.parse(String((call[1] as {body: string}).body)) as Record<
      string,
      unknown
    >
    expect('timezone' in body).toBe(false)
  })

  it('reads reply text from `text` first, falling back to `message`', async () => {
    mockToken.mockResolvedValue('tok')
    // Runtime now sends the reply under both fields; `text` wins.
    global.fetch = okJson({text: 'from text', message: 'from message'})
    const res = await sendToThread('t1', {message: 'hi'})
    expect(res.data?.message).toBe('from text')

    global.fetch = okJson({message: 'only message'})
    const res2 = await sendToThread('t1', {message: 'hi'})
    expect(res2.data?.message).toBe('only message')
  })

  it('marks a silent turn (status:silent / silent:true) with silent + empty text', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = okJson({status: 'silent'})
    const res = await sendToThread('t1', {message: 'hi'})
    expect(res.ok).toBe(true)
    expect(res.data?.silent).toBe(true)
    expect(res.data?.status).toBe('silent')
    expect(res.data?.message).toBe('')

    global.fetch = okJson({silent: true, message: ''})
    const res2 = await sendToThread('t1', {message: 'hi'})
    expect(res2.data?.silent).toBe(true)
  })
})

describe('fetchThreadMessages (silent / blank suppression)', () => {
  it('drops silent and empty assistant rows, keeps real replies', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = okJson({
      messages: [
        {role: 'user', text: 'hello'},
        {role: 'agent', status: 'silent', text: ''}, // deliberate no-op
        {role: 'agent', silent: true}, // bare silent flag
        {role: 'agent', text: ''}, // stray blank (no text/media)
        {role: 'agent', text: 'real reply'},
        {role: 'agent', message: 'from message field'}, // text carried under `message`
      ],
    })
    const res = await fetchThreadMessages('t1')
    expect(res.ok).toBe(true)
    const texts = res.messages.map(m => m.text)
    expect(texts).toEqual(['hello', 'real reply', 'from message field'])
  })

  it('reports ok:false (not "empty history") when auth or the fetch fails', async () => {
    mockToken.mockResolvedValue(null) // signed out / token race
    const noAuth = await fetchThreadMessages('t1')
    expect(noAuth).toEqual({messages: [], ok: false})

    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({}),
      }),
    ) as unknown as typeof fetch
    const unauth = await fetchThreadMessages('t1')
    expect(unauth).toEqual({messages: [], ok: false})

    global.fetch = jest.fn(() => Promise.reject(new Error('network down')))
    const netFail = await fetchThreadMessages('t1')
    expect(netFail).toEqual({messages: [], ok: false})
  })

  it('reports ok:true with no rows for a genuinely empty thread', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = okJson({messages: []})
    const res = await fetchThreadMessages('t1')
    expect(res).toEqual({messages: [], ok: true})
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
