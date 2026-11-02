import {afterEach, beforeEach, describe, expect, it} from '@jest/globals'

import {installTextDecoder, utf8Decode, Utf8TextDecoder} from '../utf8'

// Node's own decoder is the reference; the tests then run without it, as on
// Hermes (no global TextDecoder).
const NodeDecoder = globalThis.TextDecoder
const reference = (b: Uint8Array) => new NodeDecoder().decode(b)
const enc = (s: string) => new TextEncoder().encode(s)

const TEXTS = [
  '',
  '{"sub":"owner:ls_x","jti":"01M6"}',
  'café ✓ 𝄞 ü — “quotes”',
  '日本語のテキスト',
  'emoji 👩🏽‍💻 and 🇳🇿',
]

let saved: unknown
beforeEach(() => {
  const g = globalThis as {TextDecoder?: unknown}
  saved = g.TextDecoder
  delete g.TextDecoder
})
afterEach(() => {
  ;(globalThis as {TextDecoder?: unknown}).TextDecoder = saved
})

describe('installTextDecoder (src/platform/polyfills.ts)', () => {
  it('installs a decoder when there is no global one (Hermes)', () => {
    expect(typeof (globalThis as {TextDecoder?: unknown}).TextDecoder).toBe(
      'undefined',
    )
    expect(installTextDecoder()).toBe(true)
    const TD = (globalThis as unknown as {TextDecoder: typeof Utf8TextDecoder})
      .TextDecoder
    for (const t of TEXTS) expect(new TD().decode(enc(t))).toBe(t)
  })

  it('leaves an existing TextDecoder alone', () => {
    const scope = {TextDecoder: NodeDecoder as unknown}
    expect(installTextDecoder(scope)).toBe(false)
    expect(scope.TextDecoder).toBe(NodeDecoder)
  })
})

describe('Utf8TextDecoder', () => {
  it('matches the platform decoder on ASCII and multi-byte text', () => {
    for (const t of TEXTS) {
      expect(new Utf8TextDecoder().decode(enc(t))).toBe(reference(enc(t)))
      expect(utf8Decode(enc(t))).toBe(t)
    }
  })

  it('streams: a character split across chunks comes out whole (chat)', () => {
    for (const t of TEXTS) {
      const bytes = enc(t)
      for (let cut = 0; cut <= bytes.length; cut++) {
        const d = new Utf8TextDecoder()
        const out =
          d.decode(bytes.subarray(0, cut), {stream: true}) +
          d.decode(bytes.subarray(cut), {stream: true}) +
          d.decode()
        expect(out).toBe(t)
      }
    }
  })

  it('reads a view at its offset, and an ArrayBuffer', () => {
    const all = enc('xx✓yy')
    const view = all.subarray(2, 5) // the 3 bytes of ✓
    expect(new Utf8TextDecoder().decode(view)).toBe('✓')
    expect(new Utf8TextDecoder().decode(enc('ok').buffer)).toBe('ok')
    expect(new Utf8TextDecoder().decode(undefined)).toBe('')
  })

  it('strips a leading BOM unless ignoreBOM', () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, 0x61])
    expect(new Utf8TextDecoder().decode(bom)).toBe('a')
    expect(new Utf8TextDecoder('utf-8', {ignoreBOM: true}).decode(bom)).toBe(
      '﻿a',
    )
  })

  it('malformed bytes become U+FFFD, never a throw', () => {
    const bad = new Uint8Array([0x61, 0xff, 0xc3, 0x28, 0xf4, 0x90, 0x80, 0x80])
    expect(() => utf8Decode(bad)).not.toThrow()
    expect(utf8Decode(bad).startsWith('a�')).toBe(true)
  })

  it('accepts UTF-8 labels only', () => {
    expect(new Utf8TextDecoder('UTF8').encoding).toBe('utf-8')
    expect(() => new Utf8TextDecoder('latin1')).toThrow(RangeError)
  })
})
