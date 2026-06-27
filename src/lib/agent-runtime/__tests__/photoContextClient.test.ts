import {afterEach, describe, expect, it, jest} from '@jest/globals'

import {type PhotoContextConclusion} from '#/lib/photoContext/types'
import {getSupabaseAccessToken} from '../authToken'
import {postPhotoContext} from '../photoContextClient'

jest.mock('../authToken', () => ({getSupabaseAccessToken: jest.fn()}))

const mockToken = jest.mocked(getSupabaseAccessToken)
const realFetch = global.fetch
afterEach(() => {
  global.fetch = realFetch
  mockToken.mockReset()
})

const conclusion: PhotoContextConclusion = {
  id: 'c1',
  source: 'photos',
  date: '2024-06-09',
  count: 12,
  firstAt: 100,
  lastAt: 400,
  place: 'venue',
  placeRef: 'Zoo',
}

describe('postPhotoContext', () => {
  it('no-ops (no fetch) when signed out; never throws', async () => {
    mockToken.mockResolvedValue(null)
    global.fetch = jest.fn(() =>
      Promise.resolve({ok: true, status: 200}),
    ) as unknown as typeof fetch
    await expect(postPhotoContext(conclusion)).resolves.toBeUndefined()
    expect((global.fetch as unknown as jest.Mock).mock.calls).toHaveLength(0)
  })

  it('POSTs { events: [conclusion] } with source:photos to /app/context/events', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() =>
      Promise.resolve({ok: true, status: 200}),
    ) as unknown as typeof fetch
    await postPhotoContext(conclusion)
    const call = (global.fetch as unknown as jest.Mock).mock.calls[0]
    expect(String(call[0])).toContain('/app/context/events')
    const init = call[1] as {headers: Record<string, string>; body: string}
    expect(init.headers.Authorization).toBe('Bearer tok')
    const body = JSON.parse(String(init.body)) as {
      events: PhotoContextConclusion[]
    }
    expect(body.events).toHaveLength(1)
    expect(body.events[0].source).toBe('photos')
    expect(body.events[0]).toEqual(conclusion)
  })

  it('never throws on network error', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() => Promise.reject(new Error('offline')))
    await expect(postPhotoContext(conclusion)).resolves.toBeUndefined()
  })
})
