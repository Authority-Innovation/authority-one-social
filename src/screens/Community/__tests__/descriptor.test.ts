import {describe, expect, it} from '@jest/globals'

import {type Community} from '#/lib/agent-runtime/communitiesClient'
import {
  asClientCommunity,
  clientCommunity,
  DEPLOYED_AGENT_DID,
  deployedHome,
  DOOR_AGENT_DID,
  DOOR_SPONSOR_DID,
  doorCommunity,
  doorCommunityWithSponsorMember,
} from '#/lib/communities/__fixtures__/door'
import {parseAccent, parseTier, postsSource, toDescriptor} from '../descriptor'

function community(extra: Record<string, unknown> = {}): Community {
  return clientCommunity({id: 'c1', name: 'BTB Listeners', ...extra})
}

describe('toDescriptor', () => {
  it('carries viewerIsAdmin only when the client says true', () => {
    expect(
      toDescriptor('c1', community({viewerIsAdmin: true})).viewerIsAdmin,
    ).toBe(true)
    expect(
      toDescriptor('c1', community({viewerIsAdmin: false})).viewerIsAdmin,
    ).toBe(false)
    expect(toDescriptor('c1', community()).viewerIsAdmin).toBe(false)
    // Membership role is not admin.
    expect(toDescriptor('c1', community({role: 'owner'})).viewerIsAdmin).toBe(
      false,
    )
  })

  it('reads the community config record when the runtime returns one', () => {
    const d = toDescriptor(
      'c1',
      community({
        role: 'member',
        memberCount: 1240,
        config: {
          tier: 'com.authorityone.community.config#members',
          theme: {accent: '#FF8800'},
          brand: {displayName: 'Between Two Beers'},
          moderation: {rulesUrl: 'https://example.com/rules'},
          consentVersion: 2,
        },
      }),
    )
    expect(d.tier).toBe('members')
    expect(d.accent).toBe('#FF8800')
    expect(d.isMember).toBe(true)
    expect(d.memberCount).toBe(1240)
    expect(d.runBy).toBe('Between Two Beers')
    expect(d.rulesUrl).toBe('https://example.com/rules')
    expect(d.consentVersion).toBe('2')
  })

  it('builds the agent from the door’s agent.did and agentSponsor {did, handle}', () => {
    expect(
      toDescriptor(
        'garden',
        asClientCommunity(doorCommunityWithSponsorMember()),
      ).agent,
    ).toEqual({
      did: DOOR_AGENT_DID,
      sponsorDid: DOOR_SPONSOR_DID,
      sponsorName: 'carol-sponsor',
      sponsorHandle: 'carol-sponsor',
    })
  })

  it('builds the agent from the deployed door’s agent {did, is_agent} with no agentSponsor', () => {
    const home = deployedHome()
    expect('agentSponsor' in home).toBe(false)
    const d = toDescriptor('ao-dev-test', asClientCommunity(home))
    expect(d.agent?.did).toBe(DEPLOYED_AGENT_DID)
    expect(d.agent?.sponsorDid).toBeUndefined()
    expect(d.agent?.sponsorName).toBeUndefined()
    expect(d.agentDid).toBe(DEPLOYED_AGENT_DID)
  })

  it('has no agent when the deployed door sends agent null or is_agent not true', () => {
    for (const agent of [
      null,
      {did: DEPLOYED_AGENT_DID, is_agent: false},
      {did: DEPLOYED_AGENT_DID},
      {did: '', is_agent: true},
    ]) {
      const d = toDescriptor(
        'ao-dev-test',
        asClientCommunity({...deployedHome(), agent} as never),
      )
      expect(d.agent).toBeUndefined()
      expect(d.agentDid).toBeUndefined()
    }
  })

  it('a null sponsor handle is absent, never the DID or the community name', () => {
    const agent = toDescriptor(
      'garden',
      asClientCommunity(doorCommunity()),
    ).agent
    expect(agent).toEqual({
      did: DOOR_AGENT_DID,
      sponsorDid: DOOR_SPONSOR_DID,
      sponsorHandle: undefined,
    })
  })

  it('reads the runtime agentSponsor {did, handle} defensively', () => {
    const config = {agent: 'did:example:agent'}
    const withHandle = toDescriptor(
      'c1',
      community({
        config,
        agentSponsor: {did: 'did:example:sponsor', handle: 'sam.example.com'},
      }),
    ).agent
    expect(withHandle?.sponsorDid).toBe('did:example:sponsor')
    expect(withHandle?.sponsorName).toBe('sam.example.com')
    // A DID alone is never used as the sponsor's name.
    const didOnly = toDescriptor(
      'c1',
      community({config, agentSponsor: {did: 'did:example:sponsor'}}),
    ).agent
    expect(didOnly?.sponsorDid).toBe('did:example:sponsor')
    expect(didOnly?.sponsorName).toBeUndefined()
    for (const junk of [null, 42, [], {handle: ''}, {handle: 7}]) {
      const d = toDescriptor('c1', community({config, agentSponsor: junk}))
      expect(d.agent?.did).toBe('did:example:agent')
      expect(d.agent?.sponsorName).toBeUndefined()
    }
  })

  it('has an agent whenever an agent DID is set, with or without a sponsor', () => {
    expect(
      toDescriptor('c1', community({config: {agent: 'did:example:agent'}}))
        .agent,
    ).toEqual({
      did: 'did:example:agent',
      sponsorDid: undefined,
      name: undefined,
      sponsorName: undefined,
      scope: undefined,
    })
    expect(
      toDescriptor(
        'c1',
        community({config: {agentSponsor: 'did:example:sponsor'}}),
      ).agent,
    ).toBeUndefined()
    expect(
      toDescriptor('c1', community({agentDid: 'did:example:agent'})).agent?.did,
    ).toBe('did:example:agent')
    expect(
      toDescriptor(
        'c1',
        community({
          agentDid: 'did:example:agent',
          agentSponsor: 'did:example:sponsor',
        }),
      ).agent?.did,
    ).toBe('did:example:agent')
  })

  it('carries the config agent DID without needing a sponsor', () => {
    expect(
      toDescriptor('c1', community({config: {agent: 'did:example:agent'}}))
        .agentDid,
    ).toBe('did:example:agent')
    expect(
      toDescriptor('c1', community({agentDid: 'did:example:agent'})).agentDid,
    ).toBe('did:example:agent')
    expect(
      toDescriptor(
        'c1',
        community({agent: {did: 'did:example:door', is_agent: true}}),
      ).agentDid,
    ).toBe('did:example:door')
    expect(
      toDescriptor(
        'c1',
        community({
          config: {agent: 'did:example:config'},
          agent: {did: 'did:example:door', is_agent: true},
        }),
      ).agentDid,
      // The door's `agent` key, when sent, decides over any config record.
    ).toBe('did:example:door')
    expect(toDescriptor('c1', community()).agentDid).toBeUndefined()
    expect(
      toDescriptor('c1', community({agent: null})).agentDid,
    ).toBeUndefined()
  })

  it('is a non-member when the runtime returns no role', () => {
    expect(toDescriptor('c1', community()).isMember).toBe(false)
    expect(toDescriptor('c1', community({role: null})).isMember).toBe(false)
  })

  it('treats a door response carrying viewer_is_admin as a member (the door sends no role)', () => {
    expect(toDescriptor('c1', community({viewerIsAdmin: true})).isMember).toBe(
      true,
    )
    expect(toDescriptor('c1', community({viewerIsAdmin: false})).isMember).toBe(
      true,
    )
  })

  it('falls back to the id for a missing name', () => {
    expect(toDescriptor('c1', community({name: ''})).name).toBe('c1')
  })
})

describe('parseTier', () => {
  it('reads full tokens and bare values', () => {
    expect(parseTier('com.authorityone.community.config#public')).toBe('public')
    expect(parseTier('paid')).toBe('paid')
    expect(parseTier('members')).toBe('members')
  })

  it('fails closed to members for unknown or missing tiers', () => {
    expect(parseTier(undefined)).toBe('members')
    expect(parseTier('com.example#public')).toBe('members')
    expect(parseTier(42)).toBe('members')
  })
})

describe('parseAccent', () => {
  it('accepts CSS hex colours only', () => {
    expect(parseAccent('#abc')).toBe('#abc')
    expect(parseAccent('#A1B2C3')).toBe('#A1B2C3')
    expect(parseAccent('red')).toBeUndefined()
    expect(parseAccent('url(javascript:1)')).toBeUndefined()
    expect(parseAccent(undefined)).toBeUndefined()
  })
})

describe('postsSource', () => {
  const base = toDescriptor('c1', community())

  it('reads nothing for a non-member of a walled community', () => {
    expect(postsSource({...base, tier: 'members', isMember: false})).toBe(
      'none',
    )
    expect(postsSource({...base, tier: 'paid', isMember: false})).toBe('none')
  })

  it('reads the runtime door for a member of a walled community', () => {
    expect(postsSource({...base, tier: 'members', isMember: true})).toBe(
      'runtime',
    )
  })

  it('reads group.ts for a public community with a group uri', () => {
    expect(
      postsSource({
        ...base,
        tier: 'public',
        isMember: false,
        groupUri: 'at://did:example:x/com.authorityone.group.profile/1',
      }),
    ).toBe('group')
    expect(postsSource({...base, tier: 'public', isMember: true})).toBe('none')
  })
})
