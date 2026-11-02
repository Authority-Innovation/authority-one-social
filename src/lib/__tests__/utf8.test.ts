/* eslint-disable import-x/no-nodejs-modules -- loads fast-text-encoding's source */
import * as fs from 'node:fs'
import * as vm from 'node:vm'

import {afterEach, beforeEach, describe, expect, it} from '@jest/globals'

import {
  installTextDecoder,
  isCapableTextDecoder,
  utf8Decode,
  Utf8TextDecoder,
} from '../utf8'

/**
 * fast-text-encoding's decoder, as React Native gets it: the polyfill
 * installs onto `window` (RN defines one) when there is no TextDecoder.
 */
function fastTextEncodingDecoder(): unknown {
  const src = fs.readFileSync(
    require.resolve('fast-text-encoding/text.min.js'),
    'utf8',
  )
  const fakeWindow: {TextEncoder?: unknown; TextDecoder?: unknown} = {
    TextEncoder: globalThis.TextEncoder,
  }
  vm.runInNewContext(src, {window: fakeWindow, Uint8Array, Uint16Array})
  return fakeWindow.TextDecoder
}

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

  it('leaves a full TextDecoder alone (Node, web)', () => {
    const scope = {TextDecoder: NodeDecoder as unknown}
    expect(installTextDecoder(scope)).toBe(false)
    expect(scope.TextDecoder).toBe(NodeDecoder)
  })

  it('replaces fast-text-encoding’s decoder, which throws on {fatal: true} (builds 43/44, code room-setup)', () => {
    const FTE = fastTextEncodingDecoder() as new (
      l?: string,
      o?: {fatal?: boolean},
    ) => unknown
    expect(typeof FTE).toBe('function')
    // What livekit-client 2.23.0 does at module scope:
    expect(() => new FTE('utf-8', {fatal: true})).toThrow(/fatal/)
    expect(isCapableTextDecoder(FTE)).toBe(false)
    const scope = {TextDecoder: FTE as unknown}
    expect(installTextDecoder(scope)).toBe(true)
    expect(scope.TextDecoder).toBe(Utf8TextDecoder)
    const TD = scope.TextDecoder as typeof Utf8TextDecoder
    expect(() => new TD('utf-8', {fatal: true})).not.toThrow()
  })

  it('fatal: malformed input throws a TypeError, as the platform decoder does', () => {
    const bad = new Uint8Array([0x61, 0xff])
    expect(() =>
      new Utf8TextDecoder('utf-8', {fatal: true}).decode(bad),
    ).toThrow(TypeError)
    expect(() => new NodeDecoder('utf-8', {fatal: true}).decode(bad)).toThrow(
      TypeError,
    )
    expect(
      new Utf8TextDecoder('utf-8', {fatal: true}).decode(enc('ok ✓')),
    ).toBe('ok ✓')
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
