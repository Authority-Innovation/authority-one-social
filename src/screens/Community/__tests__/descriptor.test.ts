import {describe, expect, it} from '@jest/globals'

import {type Community} from '#/lib/agent-runtime/communitiesClient'
import {
  asClientCommunity,
  clientCommunity,
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
      sponsorHandle: 'carol-sponsor',
    })
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

  it('has no agent unless the door sends both agent and agentSponsor (N1)', () => {
    const {agentSponsor: _s, ...noSponsor} = asClientCommunity(doorCommunity())
    expect(toDescriptor('garden', noSponsor).agent).toBeUndefined()
    expect(toDescriptor('garden', noSponsor).agentDid).toBe(DOOR_AGENT_DID)
    const {agent: _a, ...noAgent} = asClientCommunity(doorCommunity())
    expect(toDescriptor('garden', noAgent).agent).toBeUndefined()
    expect(
      toDescriptor('garden', {...noAgent, agent: null}).agent,
    ).toBeUndefined()
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
    ).toBe('did:example:config')
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
