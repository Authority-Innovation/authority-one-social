import {beforeEach, describe, expect, it, jest} from '@jest/globals'

// Control the Supabase auth surface so we can exercise getFreshAccessToken's
// read + refresh logic without a network or real session.
const mockGetSession = jest.fn<(...args: any[]) => Promise<any>>()
const mockRefreshSession = jest.fn<(...args: any[]) => Promise<any>>()

// NB: createClient runs at `client.ts` import time, before the `const mock*`
// above are initialized. Reference them lazily (inside arrows) so the spies are
// resolved when the method is *called* in a test, not when the factory runs.
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      refreshSession: (...args: unknown[]) => mockRefreshSession(...args),
      onAuthStateChange: () => ({data: {subscription: {unsubscribe() {}}}}),
      startAutoRefresh: () => {},
      stopAutoRefresh: () => {},
    },
  }),
}))

import {getFreshAccessToken} from '../client'

const sessionExpiringAt = (epochSeconds: number) => ({
  data: {
    session: {
      access_token: 'CURRENT_TOKEN',
      refresh_token: 'r',
      expires_at: epochSeconds,
    },
  },
  error: null,
})

describe('getFreshAccessToken', () => {
  beforeEach(() => {
    mockGetSession.mockReset()
    mockRefreshSession.mockReset()
  })

  it('returns null when signed out (no session)', async () => {
    mockGetSession.mockResolvedValue({data: {session: null}, error: null})
    await expect(getFreshAccessToken()).resolves.toBeNull()
  })

  it('returns null when getSession reports an error', async () => {
    mockGetSession.mockResolvedValue({
      data: {session: null},
      error: {message: 'boom'},
    })
    await expect(getFreshAccessToken()).resolves.toBeNull()
  })

  it('returns the current access token for a healthy (non-expiring) session', async () => {
    const future = Math.floor(Date.now() / 1000) + 3600
    mockGetSession.mockResolvedValue(sessionExpiringAt(future))
    await expect(getFreshAccessToken()).resolves.toBe('CURRENT_TOKEN')
    expect(mockRefreshSession).not.toHaveBeenCalled()
  })

  it('refreshes and returns the rotated token when near expiry', async () => {
    const soon = Math.floor(Date.now() / 1000) + 10 // < 60s window
    mockGetSession.mockResolvedValue(sessionExpiringAt(soon))
    mockRefreshSession.mockResolvedValue({
      data: {session: {access_token: 'ROTATED_TOKEN'}},
      error: null,
    })
    await expect(getFreshAccessToken()).resolves.toBe('ROTATED_TOKEN')
    expect(mockRefreshSession).toHaveBeenCalledTimes(1)
  })

  it('falls back to the cached token if a near-expiry refresh fails', async () => {
    const soon = Math.floor(Date.now() / 1000) + 10
    mockGetSession.mockResolvedValue(sessionExpiringAt(soon))
    mockRefreshSession.mockResolvedValue({
      data: {session: null},
      error: {message: 'offline'},
    })
    await expect(getFreshAccessToken()).resolves.toBe('CURRENT_TOKEN')
  })
})
