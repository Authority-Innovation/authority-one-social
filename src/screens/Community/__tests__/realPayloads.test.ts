/**
 * The REAL Dev runtime responses (captured 2026-10-30 from
 * authority-one-agent-runtime-dev, identities anonymised) run through the real
 * client and the community home / switcher mappers. One Dev 38 crashed on
 * these ("Cannot read property 'id' of undefined"): the jest fakes used a
 * `{posts: [{body}]}` timeline page the runtime never sends.
 */
import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals'

jest.mock('#/logger', () => ({logger: {error: jest.fn(), warn: jest.fn()}}))
jest.mock('#/lib/agent-runtime/config', () => ({
  AGENT_RUNTIME_BASE_URL: 'https://runtime.test',
}))
jest.mock('#/lib/agent-runtime/authToken', () => ({
  getAgentRuntimeAccessToken: jest.fn(() => Promise.resolve('tok')),
}))
jest.mock('#/env', () => ({COMMUNITIES_ENABLED: true}))

import {
  getCommunity,
  getTimeline,
  listMyCommunities,
} from '#/lib/agent-runtime/communitiesClient'
import {toSwitcherCommunities} from '#/features/communities/switcher/util'
import {postsSource, toDescriptor} from '../descriptor'
import {toMemberPostRows} from '../memberRows'
import REAL from '#/lib/communities/__fixtures__/door/dev-runtime-2026-10-30.json'

const realFetch = globalThis.fetch
const mockFetch = jest.fn<typeof fetch>()

function serve(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {'Content-Type': 'application/json'},
  })
}

beforeEach(() => {
  mockFetch.mockReset()
  globalThis.fetch = mockFetch
})
afterEach(() => {
  globalThis.fetch = realFetch
})

describe('real Dev runtime payloads', () => {
  it('my communities → one switcher chip / drawer item', async () => {
    mockFetch.mockResolvedValueOnce(serve(REAL.list))
    const res = await listMyCommunities()
    expect(res.ok).toBe(true)
    const chips = toSwitcherCommunities(res.ok ? res.data : null)
    expect(chips.map(c => c.id)).toEqual(['ao-dev-test'])
    expect(chips[0].viewerIsAdmin).toBe(true)
  })

  it('community home → a member descriptor that reads the runtime timeline', async () => {
    mockFetch.mockResolvedValueOnce(serve(REAL.home))
    const res = await getCommunity('ao-dev-test')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const d = toDescriptor('ao-dev-test', res.data)
    expect(d.isMember).toBe(true)
    expect(d.viewerIsAdmin).toBe(true)
    expect(d.agentDid).toBe('did:plc:agentagentagentaaaaaaaaa')
    // No agentSponsor on this member response: the card still renders, as
    // "AI agent" with no sponsor name.
    expect(d.agent?.did).toBe('did:plc:agentagentagentaaaaaaaaa')
    expect(d.agent?.sponsorName).toBeUndefined()
    expect(postsSource(d)).toBe('runtime')
  })

  it('timeline → rows for every item, no undefined row, text and author name read', async () => {
    mockFetch.mockResolvedValueOnce(serve(REAL.timeline))
    const res = await getTimeline('ao-dev-test')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const rows = toMemberPostRows([res.data])
    expect(rows).toHaveLength(REAL.timeline.items.length)
    expect(rows.every(r => typeof r.id === 'string' && r.id.length > 0)).toBe(
      true,
    )
    expect(rows[0].text).toBe(REAL.timeline.items[0].text)
    expect(rows[0].authorName).toBe('member.example.test')
    expect(rows[0].author.did).toBe('did:plc:membermemberaaaaaaaaaaaa')
  })

  it('malformed pages and items render nothing and never throw', () => {
    expect(toMemberPostRows(undefined)).toEqual([])
    expect(toMemberPostRows([undefined, null, 3, {}, {items: null}])).toEqual(
      [],
    )
    expect(
      toMemberPostRows([
        {items: [null, undefined, {}, {id: 5}, {id: ''}, 'x']},
      ]),
    ).toEqual([])
    // A duplicate id is shown once.
    const one = {id: 'a', text: 't', createdAt: '', authorId: 'x'}
    expect(toMemberPostRows([{items: [one, one]}])).toHaveLength(1)
  })

  it('still reads the legacy {posts: [{body}]} page shape', () => {
    const rows = toMemberPostRows([
      {posts: [{id: 'p1', body: 'hello', author: {displayName: 'Ada'}}]},
    ])
    expect(rows).toEqual([
      expect.objectContaining({id: 'p1', text: 'hello', authorName: 'Ada'}),
    ])
  })
})
