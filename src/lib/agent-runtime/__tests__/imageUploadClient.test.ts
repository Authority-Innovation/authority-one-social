import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals'

import {getSupabaseAccessToken} from '../authToken'
import {uploadChatImage} from '../imageUploadClient'

jest.mock('../authToken', () => ({getSupabaseAccessToken: jest.fn()}))

const mockToken = jest.mocked(getSupabaseAccessToken)
const realFetch = global.fetch
const realXHR = global.XMLHttpRequest

// Minimal XMLHttpRequest stub: readImageBlob() reads the local file URI via XHR
// (Android can't fetch() file:// URIs). The stub resolves with a fake blob body so we
// can assert what gets POSTed without touching the filesystem.
class MockXHR {
  response: unknown = {__fakeBlob: true}
  responseType = ''
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  open() {}
  send() {
    this.onload?.()
  }
}

beforeEach(() => {
  global.XMLHttpRequest = MockXHR as unknown as typeof XMLHttpRequest
})
afterEach(() => {
  global.fetch = realFetch
  global.XMLHttpRequest = realXHR
  mockToken.mockReset()
})

const image = {uri: 'file:///photo.jpg', mime: 'image/jpeg'}

describe('uploadChatImage', () => {
  it('returns null (no fetch) when signed out', async () => {
    mockToken.mockResolvedValue(null)
    global.fetch = jest.fn(() =>
      Promise.resolve({ok: true, json: () => Promise.resolve({url: 'x'})}),
    ) as unknown as typeof fetch
    expect(await uploadChatImage(image)).toBeNull()
    expect((global.fetch as unknown as jest.Mock).mock.calls).toHaveLength(0)
  })

  it('POSTs raw bytes with the image Content-Type and returns the hosted URL', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({url: 'https://r2/p.jpg'}),
      }),
    ) as unknown as typeof fetch
    const url = await uploadChatImage(image)
    expect(url).toBe('https://r2/p.jpg')
    const call = (global.fetch as unknown as jest.Mock).mock.calls[0]
    // Raw-bytes endpoint, not the old multipart /app/chat/image route.
    expect(String(call[0])).toContain('/app/media/upload')
    const init = call[1] as {
      method: string
      headers: Record<string, string>
      body: unknown
    }
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer tok')
    // The image MIME must be sent explicitly (the runtime gates on it).
    expect(init.headers['Content-Type']).toBe('image/jpeg')
    // The body is the raw blob, not a FormData envelope.
    expect(init.body).toEqual({__fakeBlob: true})
  })

  it('returns null on a non-ok response (degrades gracefully)', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() =>
      Promise.resolve({ok: false, status: 500}),
    ) as unknown as typeof fetch
    expect(await uploadChatImage(image)).toBeNull()
  })

  it('returns null when the response omits a url', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() =>
      Promise.resolve({ok: true, json: () => Promise.resolve({})}),
    ) as unknown as typeof fetch
    expect(await uploadChatImage(image)).toBeNull()
  })

  it('never throws on network error', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() => Promise.reject(new Error('offline')))
    expect(await uploadChatImage(image)).toBeNull()
  })

  it('returns null when the file cannot be read', async () => {
    mockToken.mockResolvedValue('tok')
    class FailingXHR extends MockXHR {
      send() {
        this.onerror?.()
      }
    }
    global.XMLHttpRequest = FailingXHR as unknown as typeof XMLHttpRequest
    global.fetch = jest.fn(() =>
      Promise.resolve({ok: true, json: () => Promise.resolve({url: 'x'})}),
    ) as unknown as typeof fetch
    expect(await uploadChatImage(image)).toBeNull()
    // The upload POST must not happen if we couldn't read the bytes.
    expect((global.fetch as unknown as jest.Mock).mock.calls).toHaveLength(0)
  })
})
