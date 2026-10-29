import {describe, expect, it} from '@jest/globals'

import {isCommunityAgentAuthor} from '#/features/communities/agentLabel'

const AGENT_DID = 'did:example:agent'

describe('isCommunityAgentAuthor', () => {
  it('is the agent when is_agent is true and the did matches the config', () => {
    expect(
      isCommunityAgentAuthor({is_agent: true, did: AGENT_DID}, AGENT_DID),
    ).toBe(true)
    expect(
      isCommunityAgentAuthor({is_agent: true, did: ` ${AGENT_DID} `}, AGENT_DID),
    ).toBe(true)
  })

  it('is a member without is_agent, even with the agent did', () => {
    expect(
      isCommunityAgentAuthor({is_agent: false, did: AGENT_DID}, AGENT_DID),
    ).toBe(false)
    expect(isCommunityAgentAuthor({did: AGENT_DID}, AGENT_DID)).toBe(false)
    expect(
      isCommunityAgentAuthor({is_agent: 'true', did: AGENT_DID}, AGENT_DID),
    ).toBe(false)
  })

  it('is a member for a spoofed name with a different did', () => {
    expect(
      isCommunityAgentAuthor(
        {displayName: 'Steve', is_agent: true, did: 'did:example:eve'},
        AGENT_DID,
      ),
    ).toBe(false)
  })

  it('is a member for an old item whose did is null or missing', () => {
    expect(
      isCommunityAgentAuthor({is_agent: false, did: null}, AGENT_DID),
    ).toBe(false)
    expect(isCommunityAgentAuthor({is_agent: true, did: null}, AGENT_DID)).toBe(
      false,
    )
    expect(isCommunityAgentAuthor({is_agent: true}, AGENT_DID)).toBe(false)
    expect(isCommunityAgentAuthor({is_agent: true, did: ''}, AGENT_DID)).toBe(
      false,
    )
  })

  it('is a member when the author is absent', () => {
    expect(isCommunityAgentAuthor(undefined, AGENT_DID)).toBe(false)
    expect(isCommunityAgentAuthor(null, AGENT_DID)).toBe(false)
  })

  it('is a member when the config names no agent', () => {
    for (const config of [undefined, null, '', '  ']) {
      expect(
        isCommunityAgentAuthor({is_agent: true, did: AGENT_DID}, config),
      ).toBe(false)
    }
  })
})
