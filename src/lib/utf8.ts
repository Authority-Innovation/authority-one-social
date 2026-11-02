/**
 * A spec-shaped UTF-8 TextDecoder for React Native. Hermes has no native
 * TextDecoder, and the one fast-text-encoding installs throws on the `fatal`
 * and `stream` options. livekit-client builds
 * `new TextDecoder('utf-8', {fatal: true})` at module scope, so the SDK
 * failed to load on the phone: Metro evaluates it lazily, at the first
 * `new Room()`, which was Agent Live's "(code: room-setup)" (builds 43, 44).
 * Chat streaming decodes with {stream: true} too. `installTextDecoder()`
 * (src/platform/polyfills.ts) installs this one when the global is missing or
 * can't do both options; Node, the web and any engine with a full
 * TextDecoder keep theirs.
 */

const REPLACEMENT = 0xfffd

/** Bytes needed by a lead byte, or 0 for a byte that can't start one. */
function seqLength(b: number): number {
  if (b < 0x80) return 1
  if (b >= 0xc0 && b < 0xe0) return 2
  if (b >= 0xe0 && b < 0xf0) return 3
  if (b >= 0xf0 && b < 0xf8) return 4
  return 0
}

/** UTF-8 bytes to a string; malformed input becomes U+FFFD, or throws if `fatal`. */
export function utf8Decode(bytes: Uint8Array, fatal = false): string {
  const bad = () => {
    if (fatal) {
      throw new TypeError('The encoded data was not valid for encoding utf-8')
    }
    return String.fromCharCode(REPLACEMENT)
  }
  let out = ''
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i]
    const n = seqLength(b)
    if (n === 1) {
      out += String.fromCharCode(b)
      i++
      continue
    }
    if (n === 0 || i + n > bytes.length) {
      out += bad()
      i++
      continue
    }
    let cp = b & (0xff >> (n + 1))
    let ok = true
    for (let k = 1; k < n; k++) {
      const c = bytes[i + k]
      if ((c & 0xc0) !== 0x80) {
        ok = false
        break
      }
      cp = (cp << 6) | (c & 0x3f)
    }
    if (!ok || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
      out += bad()
      i++
      continue
    }
    out += String.fromCodePoint(cp)
    i += n
  }
  return out
}

/** How many trailing bytes start a sequence the chunk doesn't finish. */
function incompleteTail(bytes: Uint8Array): number {
  for (let back = 1; back <= Math.min(3, bytes.length); back++) {
    const b = bytes[bytes.length - back]
    if ((b & 0xc0) === 0x80) continue // a continuation byte: look further back
    const n = seqLength(b)
    return n > back ? back : 0
  }
  return 0
}

const LABELS = new Set(['utf-8', 'utf8', 'unicode-1-1-utf-8'])

/** A UTF-8-only TextDecoder (decode, {stream}, BOM handling). */
export class Utf8TextDecoder {
  readonly encoding = 'utf-8'
  readonly fatal: boolean
  readonly ignoreBOM: boolean
  private pending = new Uint8Array(0)
  private bomSeen = false

  constructor(
    label = 'utf-8',
    options: {fatal?: boolean; ignoreBOM?: boolean} = {},
  ) {
    if (!LABELS.has(String(label).trim().toLowerCase())) {
      throw new RangeError(
        `The encoding label provided ('${label}') is invalid.`,
      )
    }
    this.fatal = !!options.fatal
    this.ignoreBOM = !!options.ignoreBOM
  }

  decode(
    input?: ArrayBuffer | ArrayBufferView | null,
    options: {stream?: boolean} = {},
  ): string {
    let bytes =
      input == null
        ? new Uint8Array(0)
        : input instanceof ArrayBuffer
          ? new Uint8Array(input)
          : new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
    if (this.pending.length) {
      const joined = new Uint8Array(this.pending.length + bytes.length)
      joined.set(this.pending)
      joined.set(bytes, this.pending.length)
      bytes = joined
      this.pending = new Uint8Array(0)
    }
    if (options.stream) {
      const tail = incompleteTail(bytes)
      if (tail) {
        this.pending = bytes.slice(bytes.length - tail)
        bytes = bytes.subarray(0, bytes.length - tail)
      }
    }
    let text = utf8Decode(bytes, this.fatal)
    if (!this.ignoreBOM && !this.bomSeen && text.length) {
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
      this.bomSeen = true
    }
    if (!options.stream) this.bomSeen = false
    return text
  }
}

type DecoderCtor = new (
  label?: string,
  options?: {fatal?: boolean},
) => {decode(input?: Uint8Array, options?: {stream?: boolean}): string}

/** The TextDecoder can do what the app and livekit-client ask of it. */
export function isCapableTextDecoder(TD: unknown): boolean {
  if (typeof TD !== 'function') return false
  try {
    const Ctor = TD as DecoderCtor
    new Ctor('utf-8', {fatal: true})
    const d = new Ctor()
    // The first two bytes of "✓": a stream decoder holds them back.
    return (
      d.decode(new Uint8Array([0xe2, 0x9c]), {stream: true}) === '' &&
      d.decode(new Uint8Array([0x93])) === '✓'
    )
  } catch {
    return false
  }
}

/**
 * Installs Utf8TextDecoder as the global TextDecoder when there is none, or
 * when the one there can't do `fatal` and `stream` (fast-text-encoding's).
 */
export function installTextDecoder(
  scope: {TextDecoder?: unknown} = globalThis,
): boolean {
  if (isCapableTextDecoder(scope.TextDecoder)) return false
  scope.TextDecoder = Utf8TextDecoder
  return true
}
