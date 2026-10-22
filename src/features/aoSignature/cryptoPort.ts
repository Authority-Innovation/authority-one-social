// Native crypto for PKCE: expo-crypto, required LAZILY so the module is only
// ever loaded once the lane is armed and a sign-in actually starts.
import type * as ExpoCryptoModule from 'expo-crypto'

import {type AOCryptoPort} from './pkce'

type ExpoCrypto = typeof ExpoCryptoModule

function expoCrypto(): ExpoCrypto {
  // Lazy native module: never loaded while the lane is dark.
  return require('expo-crypto') as ExpoCrypto
}

export function getCryptoPort(): AOCryptoPort {
  return {
    randomBytes(n) {
      return expoCrypto().getRandomBytes(n)
    },
    async sha256(input) {
      const c = expoCrypto()
      const digest = await c.digest(
        c.CryptoDigestAlgorithm.SHA256,
        new TextEncoder().encode(input),
      )
      return new Uint8Array(digest)
    },
  }
}
