import {describe, expect, it} from '@jest/globals'

import {getSupabaseAccessToken, setSupabaseTokenProvider} from '../authToken'

describe('agent-runtime token provider', () => {
  it('returns whatever the installed provider resolves (the live access token)', async () => {
    setSupabaseTokenProvider(() => Promise.resolve('ACCESS_TOKEN_XYZ'))
    await expect(getSupabaseAccessToken()).resolves.toBe('ACCESS_TOKEN_XYZ')
  })

  it('returns null when the installed provider reports no session', async () => {
    setSupabaseTokenProvider(() => Promise.resolve(null))
    await expect(getSupabaseAccessToken()).resolves.toBeNull()
  })

  it('reflects a later provider swap (module-load wiring is replaceable)', async () => {
    setSupabaseTokenProvider(() => Promise.resolve('first'))
    await expect(getSupabaseAccessToken()).resolves.toBe('first')
    setSupabaseTokenProvider(() => Promise.resolve('second'))
    await expect(getSupabaseAccessToken()).resolves.toBe('second')
  })
})
