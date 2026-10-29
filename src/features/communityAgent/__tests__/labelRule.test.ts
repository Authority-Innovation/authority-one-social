import {describe, expect, it} from '@jest/globals'

import {isCommunityAgentAuthor} from '#/features/communities/agentLabel'
import {resolveAuthorLabel} from '../labelRule'
import {type CommunityAgentConfig, type CommunityThreadAuthor} from '../types'

// Placeholder DIDs only.
const AGENT_DID = 'did:plc:agentsample000000000000'
const OTHER_DID = 'did:plc:othersample0000000000000'
const SPONSOR_DID = 'did:plc:sponsorsample00000000000'

const AUTHORS: [string, CommunityThreadAuthor][] = [
  ['agent', {is_agent: true, did: AGENT_DID}],
  ['agent, padded DID', {is_agent: true, did: ` ${AGENT_DID} `}],
  ['other DID', {is_agent: true, did: OTHER_DID}],
  ['null DID', {is_agent: true, did: null}],
  ['empty DID', {is_agent: true, did: ''}],
  ['no DID', {is_agent: true}],
  ['is_agent false', {is_agent: false, did: AGENT_DID}],
  ['is_agent string', {is_agent: 'true' as never, did: AGENT_DID}],
]

const CONFIG_DIDS: [string, string | null | undefined][] = [
  ['matching', AGENT_DID],
  ['padded', `  ${AGENT_DID}  `],
  ['other', OTHER_DID],
  ['empty', ''],
  ['blank', '   '],
  ['null', null],
  ['undefined', undefined],
]

function config(agentDid: string | null | undefined): CommunityAgentConfig {
  return {
    id: 'c1',
    name: 'C',
    viewerIsAdmin: false,
    agentDid,
    agentSponsor: SPONSOR_DID,
    agentSponsorName: 'Sponsor',
  }
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

  it('a DID match without a sponsor is still a member (labelRule only)', () => {
    const author = AUTHORS[0][1]
    expect(isCommunityAgentAuthor(author, AGENT_DID)).toBe(true)
    expect(
      resolveAuthorLabel(author, {...config(AGENT_DID), agentSponsor: null}),
    ).toEqual({kind: 'member', warning: 'agent_without_sponsor'})
  })
})
