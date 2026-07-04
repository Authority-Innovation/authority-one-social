import {type ChatMessage} from '#/lib/agent-runtime'
import {mergeServerMessages} from '../useAgentChat'

function msg(over: Partial<ChatMessage> & {id: string}): ChatMessage {
  return {
    role: 'assistant',
    text: '',
    createdAt: 0,
    ...over,
  }
}

describe('mergeServerMessages', () => {
  const user = msg({id: 'u1', role: 'user', text: 'hi', createdAt: 1000})
  const reply = msg({
    id: 'a1',
    text: 'hello!',
    senderName: 'Bob',
    createdAt: 2000,
  })

  it('returns prev by reference when the server list matches (no re-render)', () => {
    const prev = [user, reply]
    const server = [
      msg({id: 't_1', role: 'user', text: 'hi', createdAt: 1000}),
      msg({id: 't_2', text: 'hello!', senderName: 'Bob', createdAt: 2000}),
    ]
    expect(mergeServerMessages(prev, server)).toBe(prev)
  })

  it('appends a new server row (live agent reply) while reusing matched local rows', () => {
    const prev = [user, reply]
    const incoming = msg({
      id: 't_3',
      text: 'late reply',
      senderName: 'Stormy',
      createdAt: 3000,
    })
    const server = [
      msg({id: 't_1', role: 'user', text: 'hi', createdAt: 1000}),
      msg({id: 't_2', text: 'hello!', senderName: 'Bob', createdAt: 2000}),
      incoming,
    ]
    const out = mergeServerMessages(prev, server)
    expect(out).toHaveLength(3)
    // Matched rows keep their identity (stable React keys)...
    expect(out[0]).toBe(user)
    expect(out[1]).toBe(reply)
    // ...and the new row comes through.
    expect(out[2].text).toBe('late reply')
    expect(out[2].senderName).toBe('Stormy')
  })

  it('keeps a pending local placeholder', () => {
    const pending = msg({id: 'a2', pending: true, createdAt: 4000})
    const prev = [user, pending]
    const server = [msg({id: 't_1', role: 'user', text: 'hi', createdAt: 1000})]
    const out = mergeServerMessages(prev, server)
    expect(out[out.length - 1]).toBe(pending)
  })

  it('keeps a just-sent local turn the server has not persisted yet', () => {
    const fresh = msg({id: 'u2', role: 'user', text: 'new', createdAt: 9000})
    const prev = [user, fresh]
    const server = [msg({id: 't_1', role: 'user', text: 'hi', createdAt: 1000})]
    const out = mergeServerMessages(prev, server)
    expect(out).toContain(fresh)
  })

  it('drops a stale local row that the server no longer carries', () => {
    const stale = msg({id: 'a9', text: 'gone', createdAt: 500})
    const prev = [stale, user]
    const server = [msg({id: 't_1', role: 'user', text: 'hi', createdAt: 1000})]
    const out = mergeServerMessages(prev, server)
    expect(out.map(m => m.text)).toEqual(['hi'])
  })
})
