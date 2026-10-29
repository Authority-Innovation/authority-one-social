import {describe, expect, it} from '@jest/globals'

import {isCommunityAgentAuthor} from '#/features/communities/agentLabel'
import {type Community} from '#/lib/agent-runtime/communitiesClient'
import {
  asClientCommunity,
  DOOR_AGENT_DID,
  DOOR_SPONSOR_DID,
  doorCommunity,
  doorCommunityWithSponsorMember,
  doorItem,
} from '#/lib/communities/__fixtures__/door'
import {type DoorCommunity} from '#/lib/communities/doorContract'
import {resolveAuthorLabel} from '../labelRule'
import {type CommunityThreadAuthor} from '../types'

// Placeholder DID only.
const OTHER_DID = 'did:plc:othersample0000000000000'

const AUTHORS: [string, CommunityThreadAuthor][] = [
  ['agent', {is_agent: true, did: DOOR_AGENT_DID}],
  ['agent, padded DID', {is_agent: true, did: ` ${DOOR_AGENT_DID} `}],
  ['other DID', {is_agent: true, did: OTHER_DID}],
  ['null DID', {is_agent: true, did: null}],
  ['empty DID', {is_agent: true, did: ''}],
  ['no DID', {is_agent: true}],
  ['is_agent false', {is_agent: false, did: DOOR_AGENT_DID}],
  ['is_agent string', {is_agent: 'true' as never, did: DOOR_AGENT_DID}],
]

const CONFIG_DIDS: [string, string | null | undefined][] = [
  ['matching', DOOR_AGENT_DID],
  ['padded', `  ${DOOR_AGENT_DID}  `],
  ['other', OTHER_DID],
  ['empty', ''],
  ['blank', '   '],
  // The door's `agent: null` (no valid slot) and no `agent` key (flag off).
  ['null', null],
  ['undefined', undefined],
]

/** door.json's member community, its agent DID set to `agentDid`. */
function config(agentDid: string | null | undefined): Community {
  const {agent: _agent, ...c} = asClientCommunity(doorCommunity())
  if (agentDid === undefined) return c
  return {
    ...c,
    agent: agentDid === null ? null : {did: agentDid, is_agent: true},
  }
}

/** Every key the door can send on a community, as the client names them. */
const DOOR_COMMUNITY_KEYS = new Set<string>([
  ...(Object.keys(doorCommunity()) as (keyof DoorCommunity)[]),
  'agent_error',
  'viewerIsAdmin',
])

/**
 * Wraps a door object so every key read is recorded, nested objects too.
 * `reads` gets `path.key` for each property access.
 */
function recording<T extends object>(v: T, reads: string[], path = ''): T {
  return new Proxy(v, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver)
      if (typeof key !== 'string') return value
      const at = path ? `${path}.${key}` : key
      reads.push(at)
      return typeof value === 'object' && value !== null
        ? recording(value, reads, at)
        : value
    },
  })
}

describe('labelRule and agentLabel share one DID-match rule', () => {
  for (const [authorName, author] of AUTHORS) {
    for (const [configName, agentDid] of CONFIG_DIDS) {
      it(`agree for author "${authorName}", config DID "${configName}"`, () => {
        const isAgent = isCommunityAgentAuthor(author, agentDid)
        const label = resolveAuthorLabel(author, config(agentDid))
        expect(label.kind === 'agent').toBe(isAgent)
      })
    }
  }

  it('agree when there is no community config at all', () => {
    for (const [, author] of AUTHORS) {
      expect(resolveAuthorLabel(author, null).kind).toBe('member')
      expect(resolveAuthorLabel(author, undefined).kind).toBe('member')
      expect(isCommunityAgentAuthor(author, undefined)).toBe(false)
    }
  })

  it('a DID match without the agentSponsor view is still a member (labelRule only)', () => {
    const author = AUTHORS[0][1]
    const {agentSponsor: _sponsor, ...noSponsor} = config(DOOR_AGENT_DID)
    expect(isCommunityAgentAuthor(author, DOOR_AGENT_DID)).toBe(true)
    expect(resolveAuthorLabel(author, noSponsor)).toEqual({
      kind: 'member',
      warning: 'agent_without_sponsor',
    })
  })
})

describe('labelRule reads only what the door sends', () => {
  it('labels door.json’s agent item from the door’s own community, sponsor handle and all', () => {
    const community = asClientCommunity(doorCommunityWithSponsorMember())
    expect(community.agentSponsor).toEqual({
      did: DOOR_SPONSOR_DID,
      handle: 'carol-sponsor',
    })
    expect(resolveAuthorLabel(doorItem('agent').author, community)).toEqual({
      kind: 'agent',
      sponsorHandle: 'carol-sponsor',
    })
  })

  it('labels with no sponsor handle when the door answers handle null, never the DID', () => {
    const community = asClientCommunity(doorCommunity())
    expect(community.agentSponsor?.handle).toBeNull()
    expect(resolveAuthorLabel(doorItem('agent').author, community)).toEqual({
      kind: 'agent',
      sponsorHandle: '',
    })
  })

  it('leaves door.json’s member and legacy items as members', () => {
    const community = asClientCommunity(doorCommunityWithSponsorMember())
    for (const kind of ['post', 'reply', 'legacy'] as const) {
      expect(resolveAuthorLabel(doorItem(kind).author, community)).toEqual({
        kind: 'member',
      })
    }
  })

  it('never reads a community or author key the door does not send', () => {
    const reads: string[] = []
    const community = recording(
      asClientCommunity(doorCommunityWithSponsorMember()),
      reads,
    )
    const author = recording(doorItem('agent').author!, reads, 'author')
    expect(resolveAuthorLabel(author, community).kind).toBe('agent')

    const topLevel = reads.filter(r => !r.startsWith('author'))
    for (const key of topLevel.map(r => r.split('.')[0])) {
      expect(DOOR_COMMUNITY_KEYS).toContain(key)
    }
    for (const r of topLevel.filter(k => k.includes('.'))) {
      expect([
        'agent.did',
        'agent.is_agent',
        'agentSponsor.did',
        'agentSponsor.handle',
      ]).toContain(r)
    }
    for (const r of reads.filter(k => k.startsWith('author.'))) {
      expect(['author.did', 'author.is_agent']).toContain(r)
    }
    // It did read the door's agent and sponsor fields.
    expect(reads).toEqual(
      expect.arrayContaining(['agent.did', 'agentSponsor.did']),
    )
  })
})
