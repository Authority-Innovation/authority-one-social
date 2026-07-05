import {describe, expect, it} from '@jest/globals'

import {groupSenderLabel, isSelfSender} from '../attribution'

const VIEWER_DID = 'did:plc:viewer123'
const VIEWER_HANDLE = 'viewer.pds.example.com'
const BRIAN_DID = 'did:plc:brian456'

const selfIds = new Set([VIEWER_DID, VIEWER_HANDLE.toLowerCase()])

const roster = (senderId?: string) =>
  senderId === BRIAN_DID ? 'Brian' : undefined

const opts = {selfIds, rosterName: roster, agentName: 'Ada'}

describe('groupSenderLabel', () => {
  it('labels "You" ONLY on a strict sender-identity match with the viewer', () => {
    expect(groupSenderLabel({role: 'user', senderId: VIEWER_DID}, opts)).toBe(
      'You',
    )
    // handle-form identity, any casing
    expect(
      groupSenderLabel(
        {role: 'user', senderId: VIEWER_HANDLE.toUpperCase()},
        opts,
      ),
    ).toBe('You')
  })

  it('never labels another member "You" just because their role is user', () => {
    // THE reported bug: Brian's rows viewed from a different account.
    expect(
      groupSenderLabel(
        {role: 'user', senderId: BRIAN_DID, senderName: 'Brian'},
        opts,
      ),
    ).toBe('Brian')
    // No stamped name — resolve from the roster by identity.
    expect(groupSenderLabel({role: 'user', senderId: BRIAN_DID}, opts)).toBe(
      'Brian',
    )
    // Unknown human with no identity/name: neutral label, not "You", not the agent.
    expect(groupSenderLabel({role: 'user'}, opts)).toBe('Member')
  })

  it('labels the viewer own assistant-agent rows "You" only on identity match', () => {
    // An agent row stamped with someone else's id keeps its own name.
    expect(
      groupSenderLabel(
        {role: 'assistant', senderId: 'stormy.pds.example.com'},
        opts,
      ),
    ).toBe('Ada')
  })

  it('agent rows: runtime name, then roster, then thread agent name', () => {
    expect(
      groupSenderLabel({role: 'assistant', senderName: 'Stormy'}, opts),
    ).toBe('Stormy')
    expect(
      groupSenderLabel({role: 'assistant', senderId: BRIAN_DID}, opts),
    ).toBe('Brian')
    expect(groupSenderLabel({role: 'assistant'}, opts)).toBe('Ada')
  })

  it('keeps a pending unnamed agent placeholder anonymous', () => {
    expect(
      groupSenderLabel({role: 'assistant', pending: true}, opts),
    ).toBeUndefined()
    expect(
      groupSenderLabel(
        {role: 'assistant', pending: true, senderName: 'Stormy'},
        opts,
      ),
    ).toBe('Stormy')
  })
})

describe('isSelfSender (drives group bubble alignment AND the "You" label)', () => {
  it('true only on a strict sender-identity match with the viewer', () => {
    expect(isSelfSender({senderId: VIEWER_DID}, selfIds)).toBe(true)
    // handle-form identity, any casing
    expect(isSelfSender({senderId: VIEWER_HANDLE.toUpperCase()}, selfIds)).toBe(
      true,
    )
  })

  it('false for another member — their rows must align LEFT on this device', () => {
    // THE reported bug: Brian's role:'user' rows rendered right-aligned as "You"
    // on Elliott's phone. Identity decides, never role.
    expect(isSelfSender({senderId: BRIAN_DID}, selfIds)).toBe(false)
  })

  it('false for agents and for rows with no stamped identity', () => {
    expect(isSelfSender({senderId: 'stormy.pds.example.com'}, selfIds)).toBe(
      false,
    )
    expect(isSelfSender({}, selfIds)).toBe(false)
    expect(isSelfSender({senderId: ''}, selfIds)).toBe(false)
  })

  it('agrees with groupSenderLabel: self is exactly the "You" rows', () => {
    for (const m of [
      {role: 'user' as const, senderId: VIEWER_DID},
      {role: 'user' as const, senderId: BRIAN_DID, senderName: 'Brian'},
      {role: 'user' as const},
      {role: 'assistant' as const, senderName: 'Stormy'},
    ]) {
      expect(isSelfSender(m, selfIds)).toBe(
        groupSenderLabel(m, opts) === 'You',
      )
    }
  })
})
