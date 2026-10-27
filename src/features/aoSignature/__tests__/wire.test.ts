import {describe, expect, it} from '@jest/globals'

import {
  aosToken,
  DID,
  mintedSession,
  redeemBody,
} from '../__fixtures__/fixtures'
import {AOSignatureError} from '../errors'
import {
  aoSessionClaims,
  decodePickerList,
  decodeRedeem,
  isAOSessionToken,
} from '../wire'

function kind(fn: () => unknown): string {
  try {
    fn()
  } catch (e) {
    return e instanceof AOSignatureError ? e.kind : 'other'
  }
  return 'none'
}

describe('redeem decode (fail-closed)', () => {
  it('adopts a v2 answer: the aos1 session, did, primary — and never the PDS window token', () => {
    const r = decodeRedeem(redeemBody())
    expect(r.outcome).toBe('bound')
    expect(r.did).toBe(DID)
    expect(r.session.token.startsWith('aos1.')).toBe(true)
    expect(r.primary).toBe('bob.pds.test')
    expect(r.needsAgent).toBe(false)
    expect(JSON.stringify(r)).not.toContain('PDS-WINDOW-JWT')
  })

  it('provisioned person-only: no primary ⇒ needsAgent, whatever the flag says', () => {
    const r = decodeRedeem(
      redeemBody({outcome: 'provisioned', primary: null, needsAgent: false}),
    )
    expect(r.needsAgent).toBe(true)
  })

  it.each([
    [
      'a pre-v2 runtime (no aoSession key)',
      {aoSession: undefined, needsAgent: undefined, primary: undefined},
    ],
    ['aoSession null (secret unset)', {aoSession: null}],
    ['a non-aos1 token', {aoSession: {...mintedSession(), token: 'eyJ.x.y'}}],
    [
      'a token for another DID',
      {aoSession: mintedSession('did:plc:someoneelse')},
    ],
    [
      'an expired session',
      {
        aoSession: {
          ...mintedSession(),
          expiresAt: new Date(1000).toISOString(),
        },
      },
    ],
    ['no did', {did: null}],
    ['a non-did did', {did: 'alice.test'}],
    ['ok:false', {ok: false}],
    ['an unknown outcome', {outcome: 'refused'}],
  ])('refuses %s', (_n, over) => {
    expect(kind(() => decodeRedeem(redeemBody(over)))).toBe('no-ao-session')
  })

  it('refuses a non-object', () => {
    expect(kind(() => decodeRedeem(null))).toBe('no-ao-session')
    expect(kind(() => decodeRedeem('ok'))).toBe('no-ao-session')
  })

  it('a token whose sid disagrees with the minted sid is refused', () => {
    const s = mintedSession()
    expect(
      kind(() => decodeRedeem(redeemBody({aoSession: {...s, sid: 'other'}}))),
    ).toBe('no-ao-session')
  })

  it('link mode: must come back `linked` to exactly the code DID', () => {
    const linked = redeemBody({outcome: 'linked', session: null})
    expect(decodeRedeem(linked, {linkDid: DID}).outcome).toBe('linked')
    expect(kind(() => decodeRedeem(redeemBody(), {linkDid: DID}))).toBe(
      'link-mismatch',
    )
    expect(kind(() => decodeRedeem(linked, {linkDid: 'did:plc:other'}))).toBe(
      'link-mismatch',
    )
  })
})

describe('aos1 claims', () => {
  it('reads did/sid/exp/lv; anything malformed is empty', () => {
    const t = aosToken({did: DID, sid: 's', exp: 2000000000, lv: 1900000000})
    expect(isAOSessionToken(t)).toBe(true)
    expect(aoSessionClaims(t)).toEqual({
      did: DID,
      sid: 's',
      exp: 2000000000,
      lv: 1900000000,
    })
    expect(aoSessionClaims('aos1.!!!.x')).toEqual({
      did: null,
      sid: null,
      exp: null,
      lv: null,
    })
    expect(isAOSessionToken('aos1.a')).toBe(false)
    expect(isAOSessionToken('aos1..b')).toBe(false)
  })
})

describe('picker list decode', () => {
  it('reads the /app/agents v2 shape and the introspect picker entries, deduped', () => {
    const l = decodePickerList({
      agents: [
        {handle: 'steve.pds.test', displayName: 'Steve'},
        {handle: 'STEVE.pds.test'},
        'bob.pds.test',
        {nope: 1},
      ],
      primary: null,
      needsAgent: true,
    })
    expect(l.agents.map(a => a.handle)).toEqual([
      'steve.pds.test',
      'bob.pds.test',
    ])
    expect(l.needsAgent).toBe(true)
    expect(
      decodePickerList({agents: [], primary: 'bob.pds.test'}).needsAgent,
    ).toBe(false)
    expect(decodePickerList(null)).toEqual({
      agents: [],
      primary: null,
      needsAgent: true,
    })
  })
})
