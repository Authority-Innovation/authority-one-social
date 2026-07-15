import {describe, expect, it} from '@jest/globals'

import {rosterHasAgent} from '../agent-threads'

const roster = {
  creatorDid: 'did:plc:owner',
  members: [
    {id: 'did:plc:human', kind: 'person' as const},
    {
      id: 'did:plc:agent1',
      kind: 'agent' as const,
      handle: 'ada.pds.authority-one.com',
    },
  ],
}

describe('rosterHasAgent', () => {
  it('matches by handle, case-insensitively', () => {
    expect(rosterHasAgent(roster, {handle: 'Ada.PDS.Authority-One.com'})).toBe(
      true,
    )
  })

  it('matches by DID when the roster row carries only the DID', () => {
    expect(
      rosterHasAgent(roster, {
        handle: 'other.pds.authority-one.com',
        did: 'did:plc:agent1',
      }),
    ).toBe(true)
  })

  it('does not match humans or absent agents', () => {
    expect(
      rosterHasAgent(roster, {
        handle: 'did:plc:human',
        did: 'did:plc:human',
      }),
    ).toBe(false)
    expect(rosterHasAgent(roster, {handle: 'bull.pds.authority-one.com'})).toBe(
      false,
    )
    expect(
      rosterHasAgent(undefined, {handle: 'ada.pds.authority-one.com'}),
    ).toBe(false)
  })
})
