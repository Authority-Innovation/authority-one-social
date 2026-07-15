import {afterEach, describe, expect, it, jest} from '@jest/globals'

import {getSupabaseAccessToken} from '../authToken'
import {
  conversationOpenKind,
  fetchAgentConversations,
  markThreadRead,
  normalizeConversation,
  normalizeConversations,
  sumUnread,
} from '../conversationsClient'

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

describe('normalizeConversation / normalizeConversations (pure)', () => {
  it('drops rows without an id and defaults fields', () => {
    expect(normalizeConversation({channel: 'sms'})).toBeNull()
    expect(normalizeConversation({id: 'a'})).toEqual({
      id: 'a',
      channel: 'app',
      kind: 'chat',
      name: 'Chat',
      lastMessage: null,
      updatedAt: null,
      unreadCount: 0,
      memberCount: undefined,
    })
  })

  it('keeps a full row intact', () => {
    expect(
      normalizeConversation({
        id: 'ch:whatsapp',
        channel: 'whatsapp',
        kind: 'chat',
        name: 'WhatsApp',
        lastMessage: {text: 'hey', at: 1700000000000},
        updatedAt: 1700000000000,
        unreadCount: 3,
      }),
    ).toMatchObject({
      id: 'ch:whatsapp',
      channel: 'whatsapp',
      lastMessage: {text: 'hey', at: 1700000000000},
      unreadCount: 3,
    })
  })

  it('nulls a lastMessage without text and preserves server order', () => {
    const out = normalizeConversations({
      conversations: [
        {id: 'b', lastMessage: {at: 5}},
        {id: 'a', kind: 'group', memberCount: 4, hosted: true},
        null,
        {nope: true},
      ],
    })
    expect(out.map(c => c.id)).toEqual(['b', 'a'])
    expect(out[0].lastMessage).toBeNull()
    expect(out[1]).toMatchObject({kind: 'group', memberCount: 4, hosted: true})
  })
})

describe('sumUnread (pure)', () => {
  it('totals unread across rows', () => {
    const rows = normalizeConversations({
      conversations: [
        {id: 'a', unreadCount: 2},
        {id: 'b', unreadCount: 0},
        {id: 'c', unreadCount: 5},
      ],
    })
    expect(sumUnread(rows)).toBe(7)
    expect(sumUnread([])).toBe(0)
  })
})

describe('conversationOpenKind (pure)', () => {
  it('classifies Twilio sids as the sms mirror', () => {
    expect(
      conversationOpenKind({
        id: 'CH0123456789abcdef0123456789abcdef',
        kind: 'group',
        channel: 'sms',
      }),
    ).toBe('sms-mirror')
  })

  it('classifies per-channel 1:1 mirrors and the in-app 1:1 as direct', () => {
    expect(
      conversationOpenKind({
        id: 'ch:whatsapp',
        kind: 'chat',
        channel: 'whatsapp',
      }),
    ).toBe('direct')
    expect(
      conversationOpenKind({id: 'thread-9', kind: 'chat', channel: 'app'}),
    ).toBe('direct')
  })

  it('classifies app group threads as threads (CH-prefixed thread ids stay threads)', () => {
    expect(
      conversationOpenKind({id: 'g-42', kind: 'group', channel: 'app'}),
    ).toBe('thread')
    // Not a real Twilio sid (wrong length) -> not the mirror.
    expect(
      conversationOpenKind({id: 'CHat-group', kind: 'group', channel: 'app'}),
    ).toBe('thread')
  })
})

describe('fetchAgentConversations', () => {
  it('signed out -> no fetch, signedOut true', async () => {
    mockToken.mockResolvedValue(null)
    global.fetch = okJson({conversations: []})
    const res = await fetchAgentConversations('ada.pds.authority-one.com')
    expect(res.signedOut).toBe(true)
    expect((global.fetch as unknown as jest.Mock).mock.calls).toHaveLength(0)
  })

  it('returns normalized conversations on success, hitting the agent path', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = okJson({
      conversations: [{id: 'g1', kind: 'group', name: 'Fam', unreadCount: 1}],
    })
    const res = await fetchAgentConversations('ada.pds.authority-one.com')
    expect(res.conversations).toHaveLength(1)
    expect(res.conversations[0]).toMatchObject({id: 'g1', unreadCount: 1})
    const call = (global.fetch as unknown as jest.Mock).mock.calls[0]
    expect(String(call[0])).toContain(
      '/app/agents/ada.pds.authority-one.com/conversations',
    )
  })

  it('non-ok -> error, empty list (degrades)', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() =>
      Promise.resolve({ok: false, status: 403}),
    ) as unknown as typeof fetch
    const res = await fetchAgentConversations('ada.pds.authority-one.com')
    expect(res.conversations).toEqual([])
    expect(res.error).toBeDefined()
  })
})

describe('markThreadRead', () => {
  it('POSTs to /read with the agent in the body', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = okJson({ok: true})
    const res = await markThreadRead('g1', 'ada.pds.authority-one.com')
    expect(res.ok).toBe(true)
    const call = (global.fetch as unknown as jest.Mock).mock.calls[0]
    expect(String(call[0])).toContain('/app/threads/g1/read')
    expect(JSON.parse(String((call[1] as {body: string}).body))).toEqual({
      agent: 'ada.pds.authority-one.com',
    })
  })

  it('omits the agent field when unset; degrades on failure', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = okJson({ok: true})
    await markThreadRead('g2')
    const call = (global.fetch as unknown as jest.Mock).mock.calls[0]
    expect(JSON.parse(String((call[1] as {body: string}).body))).toEqual({})

    mockToken.mockResolvedValue(null)
    const signedOut = await markThreadRead('g3')
    expect(signedOut).toEqual({ok: false, signedOut: true})
  })
})
