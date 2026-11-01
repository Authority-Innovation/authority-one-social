/**
 * Device-key proof of possession for a bound owner join token (smoke F7
 * control c; runtime src/live/tenant/live-token.js joinProofMessage,
 * live-tenant-do.js proveToken). Pure: no storage, no network.
 *
 * The runtime binds a join token to the device key sent as `devicePubKey`.
 * Before joining, the device signs
 *
 *   ao-live-join-pop/v1\n<room>\n<identity>\n<jti>
 *
 * (the token's own `video.room`, `sub` and `jti`) with that key and posts it
 * to /live/join/prove. A copy of the token without the key can't join, and a
 * fresh token proven by the same key may replace the connected owner (the
 * camera rejoin) without waiting for LiveKit's participant_left.
 */
import {ed25519} from '@noble/curves/ed25519'

export type DeviceKey = {
  /** Raw 32-byte Ed25519 public key, base64url without padding (43 chars). */
  publicKey: string
  /** Signs `msg`; base64url without padding (86 chars). */
  sign(msg: Uint8Array): string
}

export function deviceKeyFromSeed(seed: Uint8Array): DeviceKey {
  if (seed.length !== 32) throw new Error('agentLive: bad device key seed')
  const key = seed.slice()
  return {
    publicKey: b64urlEncode(ed25519.getPublicKey(key)),
    sign: msg => b64urlEncode(ed25519.sign(msg, key)),
  }
}

type JoinClaims = {room: string; identity: string; jti: string}

/** The claims a proof covers, read from the token itself; null if it has none. */
export function joinClaimsOf(token: string): JoinClaims | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const c = JSON.parse(new TextDecoder().decode(b64urlDecode(part))) as {
      sub?: unknown
      jti?: unknown
      video?: {room?: unknown}
    }
    const room = c.video?.room
    if (
      typeof room !== 'string' ||
      typeof c.sub !== 'string' ||
      typeof c.jti !== 'string'
    ) {
      return null
    }
    return {room, identity: c.sub, jti: c.jti}
  } catch {
    return null
  }
}

export function joinProofMessage({
  room,
  identity,
  jti,
}: JoinClaims): Uint8Array {
  return new TextEncoder().encode(
    `ao-live-join-pop/v1\n${room}\n${identity}\n${jti}`,
  )
}

/** The proof for `token`, or null when the token carries no claims to sign. */
export function joinProof(key: DeviceKey, token: string): string | null {
  const claims = joinClaimsOf(token)
  return claims ? key.sign(joinProofMessage(claims)) : null
}

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function b64urlEncode(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n =
      (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63]
    if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63]
    if (i + 2 < bytes.length) out += ALPHABET[n & 63]
  }
  return out
}

export function b64urlDecode(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  const out: number[] = []
  let buf = 0
  let bits = 0
  for (const ch of clean) {
    const v = ALPHABET.indexOf(ch)
    if (v < 0) throw new Error('agentLive: bad base64url')
    buf = (buf << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((buf >> bits) & 0xff)
    }
  }
  return Uint8Array.from(out)
}
