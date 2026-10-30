import {describe, expect, it} from '@jest/globals'

import {type Community} from '#/lib/agent-runtime/communitiesClient'
import {
  asClientCommunity,
  DEPLOYED_AGENT_DID,
  deployedHome,
  DEV_RUNTIME,
  DOOR_AGENT_DID,
  DOOR_SPONSOR_DID,
  doorCommunity,
  doorCommunityAsDeployed,
  doorCommunityWithSponsorMember,
  doorItem,
} from '#/lib/communities/__fixtures__/door'
import {type DoorCommunity} from '#/lib/communities/doorContract'
import {isCommunityAgentAuthor} from '#/features/communities/agentLabel'
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

  it('a DID match needs no agentSponsor (the deployed door sends none)', () => {
    const author = AUTHORS[0][1]
    const {agentSponsor: _sponsor, ...noSponsor} = config(DOOR_AGENT_DID)
    expect(isCommunityAgentAuthor(author, DOOR_AGENT_DID)).toBe(true)
    expect(resolveAuthorLabel(author, noSponsor)).toEqual({
      kind: 'agent',
      sponsorHandle: '',
    })
  })

  it('a community agent without is_agent true labels no one', () => {
    const author = AUTHORS[0][1]
    const c = config(DOOR_AGENT_DID)
    for (const is_agent of [false, undefined, 'true']) {
      const community = {
        ...c,
        agent: {did: DOOR_AGENT_DID, is_agent} as never,
      }
      expect(resolveAuthorLabel(author, community)).toEqual({kind: 'member'})
    }
  })
})

describe('labelRule on the deployed door (agent {did, is_agent}, no agentSponsor)', () => {
  it('the real Dev home has agent {did, is_agent: true} and no agentSponsor', () => {
    const home = deployedHome()
    expect(home.agent).toEqual({did: DEPLOYED_AGENT_DID, is_agent: true})
    expect('agentSponsor' in home).toBe(false)
  })

  it('labels an is_agent author whose DID is the home’s agent.did', () => {
    const community = asClientCommunity(deployedHome())
    // The roster's agent entry in the same capture names the same DID.
    const rosterAgent = DEV_RUNTIME.roster.roster.find(e => e.is_agent)
    expect(rosterAgent?.did).toBe(DEPLOYED_AGENT_DID)
    expect(
      resolveAuthorLabel({did: DEPLOYED_AGENT_DID, is_agent: true}, community),
    ).toEqual({kind: 'agent', sponsorHandle: ''})
  })

  it('labels door.json’s agent item against the community with no agentSponsor', () => {
    const community = asClientCommunity(doorCommunityAsDeployed())
    expect(community.agentSponsor).toBeUndefined()
    const item = doorItem('agent')
    expect(item.is_agent).toBe(true)
    expect(resolveAuthorLabel(item.author, community)).toEqual({
      kind: 'agent',
      sponsorHandle: '',
    })
  })

  it('labels no one when the home’s agent is null', () => {
    const community = asClientCommunity({...deployedHome(), agent: null})
    expect(
      resolveAuthorLabel({did: DEPLOYED_AGENT_DID, is_agent: true}, community),
    ).toEqual({kind: 'member'})
    expect(
      resolveAuthorLabel(
        doorItem('agent').author,
        asClientCommunity({...doorCommunityAsDeployed(), agent: null}),
      ),
    ).toEqual({kind: 'member'})
  })

  it('every author in the real Dev timeline (all non-agents) is a member', () => {
    const community = asClientCommunity(deployedHome())
    const items = DEV_RUNTIME.timeline.items
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      expect(item.is_agent).toBe(false)
      expect(resolveAuthorLabel(item.author, community)).toEqual({
        kind: 'member',
      })
    }
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
    // It did read the door's agent fields.
    expect(reads).toEqual(
      expect.arrayContaining(['agent.did', 'agent.is_agent']),
    )
  })
})
