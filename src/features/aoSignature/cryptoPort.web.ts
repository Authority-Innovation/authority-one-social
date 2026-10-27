// Web crypto for PKCE: the browser's own WebCrypto (secure contexts only — the
// web app is served over https).
import {type AOCryptoPort} from './pkce'

export function getCryptoPort(): AOCryptoPort {
  return {
    randomBytes(n) {
      const out = new Uint8Array(n)
      globalThis.crypto.getRandomValues(out)
      return out
    },
    async sha256(input) {
      const digest = await globalThis.crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(input),
      )
      return new Uint8Array(digest)
    },
  }
}
