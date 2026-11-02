/**
 * Proof of possession (smoke F7 control c): the app's signer produces exactly
 * the proofs the runtime accepted (Ed25519 is deterministic), over the claims
 * of the runtime's own tokens (__fixtures__/live.json).
 */
import {describe, expect, it} from '@jest/globals'

import {utf8Decode} from '#/lib/utf8'
import {DEVICE_SEED, LIVE, tokenOf} from '../__fixtures__/runtimeLive'
import {
  b64urlDecode,
  b64urlEncode,
  deviceKeyFromSeed,
  joinClaimsOf,
  joinProof,
  joinProofMessage,
} from '../pop'

const key = deviceKeyFromSeed(DEVICE_SEED)

describe('device key', () => {
  it('derives the public key the runtime bound the tokens to', () => {
    expect(key.publicKey).toBe(LIVE.device.publicKey)
    expect(key.publicKey).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('refuses a seed that is not 32 bytes', () => {
    expect(() => deviceKeyFromSeed(new Uint8Array(31))).toThrow()
  })
})

describe('join proof', () => {
  it.each(['tokenForJoin', 'tokenCamera'])(
    'signs %s exactly as the runtime accepted it',
    name => {
      const sig = joinProof(key, tokenOf(name))
      expect(sig).toBe(LIVE.proofs[name])
      expect(sig).toMatch(/^[A-Za-z0-9_-]{86}$/)
    },
  )

  it('covers the token’s own room, identity and jti', () => {
    const c = joinClaimsOf(tokenOf('tokenForJoin'))!
    expect(c.room).toMatch(/^lv_/)
    expect(c.identity).toMatch(/^owner:ls_[0-9A-Z]{26}:/)
    expect(c.jti).toBeTruthy()
    expect(new TextDecoder().decode(joinProofMessage(c))).toBe(
      `ao-live-join-pop/v1\n${c.room}\n${c.identity}\n${c.jti}`,
    )
  })

  it('a token without claims gets no proof', () => {
    expect(joinProof(key, 'a.b.c')).toBeNull()
    expect(joinProof(key, 'nope')).toBeNull()
  })
})

describe('on Hermes: no global TextDecoder (build 43, “Couldn’t start”)', () => {
  // Hermes has TextEncoder but no TextDecoder, and the app's polyfill then
  // installs neither. Every bound join failed as a local bad_proof.
  const withoutTextDecoder = (run: () => void) => {
    const g = globalThis as {TextDecoder?: unknown}
    const saved = g.TextDecoder
    delete g.TextDecoder
    try {
      expect(typeof (globalThis as {TextDecoder?: unknown}).TextDecoder).toBe(
        'undefined',
      )
      run()
    } finally {
      g.TextDecoder = saved
    }
  }

  it('reads the claims and signs exactly as the runtime accepted', () => {
    withoutTextDecoder(() => {
      expect(joinClaimsOf(tokenOf('tokenForJoin'))).not.toBeNull()
      for (const name of ['tokenForJoin', 'tokenCamera']) {
        expect(joinProof(key, tokenOf(name))).toBe(LIVE.proofs[name])
      }
    })
  })

  it('utf8Decode matches TextDecoder on ASCII and multi-byte text', () => {
    for (const text of ['{"sub":"owner:ls_x"}', 'café ✓ 𝄞 ü', '']) {
      const bytes = new TextEncoder().encode(text)
      expect(utf8Decode(bytes)).toBe(new TextDecoder().decode(bytes))
    }
  })
})

describe('base64url', () => {
  it('round-trips every length', () => {
    for (let n = 0; n < 70; n++) {
      const bytes = Uint8Array.from({length: n}, (_, i) => (i * 37 + n) & 0xff)
      const s = b64urlEncode(bytes)
      expect(s).not.toMatch(/[=+/]/)
      expect(Array.from(b64urlDecode(s))).toEqual(Array.from(bytes))
    }
  })
})
