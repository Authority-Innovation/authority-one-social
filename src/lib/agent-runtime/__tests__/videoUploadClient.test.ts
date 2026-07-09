import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals'

import {getSupabaseAccessToken} from '../authToken'
import {fetchVideoEmbedSource, uploadAuthorityVideo} from '../videoUploadClient'

jest.mock('../authToken', () => ({getSupabaseAccessToken: jest.fn()}))

const mockToken = jest.mocked(getSupabaseAccessToken)
const realXHR = global.XMLHttpRequest

// The POST XHRs get recorded so tests can assert headers/body.
let postXHRs: MockXHR[] = []
let nextStatus = 200
let nextBody = JSON.stringify({
  videoId: 'vid_1',
  status: 'processing',
  originalUrl: 'https://r2/v.mp4',
})
// The fake blob size readVideoBlob() resolves with (bytes read from the file URI).
let blobSize = 2 * 1024 * 1024

class MockXHR {
  method = ''
  url = ''
  status = 200
  responseText = ''
  response: unknown = {size: blobSize}
  responseType = ''
  headers: Record<string, string> = {}
  upload: {onprogress: ((e: {lengthComputable: boolean; loaded: number; total: number}) => void) | null} =
    {onprogress: null}
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v
  }
  abort() {}
  send() {
    if (this.method === 'GET') {
      // readVideoBlob(): resolve with a fake blob carrying a size.
      this.response = {size: blobSize}
      this.onload?.()
      return
    }
    // POST /app/media/video
    postXHRs.push(this)
    this.upload.onprogress?.({lengthComputable: true, loaded: 5, total: 10})
    this.status = nextStatus
    this.responseText = nextBody
    this.onload?.()
  }
}

beforeEach(() => {
  postXHRs = []
  nextStatus = 200
  nextBody = JSON.stringify({
    videoId: 'vid_1',
    status: 'processing',
    originalUrl: 'https://r2/v.mp4',
  })
  blobSize = 2 * 1024 * 1024
  global.XMLHttpRequest = MockXHR as unknown as typeof XMLHttpRequest
})
afterEach(() => {
  global.XMLHttpRequest = realXHR
  mockToken.mockReset()
})

const video = {uri: 'file:///clip.mp4', mime: 'video/mp4', size: 2 * 1024 * 1024}

describe('uploadAuthorityVideo', () => {
  it('rejects an unsupported mime before touching the network', async () => {
    mockToken.mockResolvedValue('tok')
    const res = await uploadAuthorityVideo({uri: 'file:///a.avi', mime: 'video/x-msvideo'})
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('unsupported-type')
    expect(postXHRs).toHaveLength(0)
  })

  it('rejects an over-size file (known size) without uploading', async () => {
    mockToken.mockResolvedValue('tok')
    const res = await uploadAuthorityVideo({
      uri: 'file:///big.mp4',
      mime: 'video/mp4',
      size: 200 * 1024 * 1024,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('too-large')
    expect(postXHRs).toHaveLength(0)
  })

  it('returns signed-out and does not upload when there is no token', async () => {
    mockToken.mockResolvedValue(null)
    const res = await uploadAuthorityVideo(video)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('signed-out')
    expect(postXHRs).toHaveLength(0)
  })

  it('POSTs raw bytes with the video Content-Type + bearer, returns the videoId', async () => {
    mockToken.mockResolvedValue('tok')
    const res = await uploadAuthorityVideo(video)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.videoId).toBe('vid_1')
      expect(res.status).toBe('processing')
    }
    expect(postXHRs).toHaveLength(1)
    expect(postXHRs[0].method).toBe('POST')
    expect(postXHRs[0].url).toContain('/app/media/video')
    expect(postXHRs[0].headers.Authorization).toBe('Bearer tok')
    expect(postXHRs[0].headers['Content-Type']).toBe('video/mp4')
  })

  it('reports upload progress', async () => {
    mockToken.mockResolvedValue('tok')
    const seen: number[] = []
    await uploadAuthorityVideo(video, {onProgress: p => seen.push(p)})
    expect(seen).toContain(0.5)
  })

  it('maps a 503 to the unconfigured code (Stream not set up yet)', async () => {
    mockToken.mockResolvedValue('tok')
    nextStatus = 503
    nextBody = JSON.stringify({error: 'video hosting is not configured', code: 'video-unconfigured'})
    const res = await uploadAuthorityVideo(video)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('unconfigured')
  })

  it('maps a 413 to too-large', async () => {
    mockToken.mockResolvedValue('tok')
    nextStatus = 413
    nextBody = JSON.stringify({error: 'video too large'})
    const res = await uploadAuthorityVideo(video)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('too-large')
  })

  it('surfaces a server error message on other non-2xx', async () => {
    mockToken.mockResolvedValue('tok')
    nextStatus = 502
    nextBody = JSON.stringify({error: 'video pipeline registration failed'})
    const res = await uploadAuthorityVideo(video)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.code).toBe('server')
      expect(res.error).toContain('registration failed')
    }
  })

  it('rejects an over-size blob discovered at read time', async () => {
    mockToken.mockResolvedValue('tok')
    blobSize = 200 * 1024 * 1024
    const res = await uploadAuthorityVideo({uri: 'file:///clip.mp4', mime: 'video/mp4'})
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('too-large')
    expect(postXHRs).toHaveLength(0)
  })
})

describe('fetchVideoEmbedSource', () => {
  const realFetch = global.fetch
  afterEach(() => {
    global.fetch = realFetch
    mockToken.mockReset()
  })

  const b64 = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj), 'utf-8').toString('base64')

  function fakeRes({
    ok = true,
    status = 200,
    headers = {},
    bytes = new Uint8Array([1, 2, 3]),
    jsonBody,
  }: {
    ok?: boolean
    status?: number
    headers?: Record<string, string>
    bytes?: Uint8Array
    jsonBody?: unknown
  }) {
    return {
      ok,
      status,
      headers: {get: (k: string) => headers[k.toLowerCase()] ?? null},
      arrayBuffer: () =>
        Promise.resolve(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
        ),
      json: () => Promise.resolve(jsonBody ?? {}),
    }
  }

  it('returns signed-out and never fetches when there is no token', async () => {
    mockToken.mockResolvedValue(null)
    const spy = jest.fn()
    global.fetch = spy as unknown as typeof fetch
    const res = await fetchVideoEmbedSource('vid_1')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('signed-out')
    expect(spy).not.toHaveBeenCalled()
  })

  it('returns the original bytes + decoded embed metadata (unicode-safe, no blob)', async () => {
    mockToken.mockResolvedValue('tok')
    const embed = {
      $type: 'app.bsky.embed.video',
      alt: 'café 🎬 déjà',
      aspectRatio: {width: 1920, height: 1080},
      onePlayback: {uid: 'u1', playlist: 'https://cf/x.m3u8', thumbnail: null},
    }
    global.fetch = jest.fn((url: unknown, init: unknown) => {
      expect(String(url)).toContain('/app/media/video/vid_1/embed-source')
      expect((init as {headers: Record<string, string>}).headers.Authorization).toBe('Bearer tok')
      return Promise.resolve(
        fakeRes({
          headers: {
            'content-type': 'video/mp4',
            'x-one-video-embed': b64(embed),
            'x-one-video-stream-state': 'ready',
          },
          bytes: new Uint8Array([9, 8, 7]),
        }),
      )
    }) as unknown as typeof fetch
    const res = await fetchVideoEmbedSource('vid_1')
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.contentType).toBe('video/mp4')
      expect(res.streamState).toBe('ready')
      expect(new Uint8Array(res.bytes)).toEqual(new Uint8Array([9, 8, 7]))
      expect(res.embed.alt).toBe('café 🎬 déjà')
      expect((res.embed as {video?: unknown}).video).toBeUndefined()
      expect((res.embed.onePlayback as {uid: string}).uid).toBe('u1')
    }
  })

  it('maps a non-OK body to a tagged error (code + message)', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() =>
      Promise.resolve(
        fakeRes({
          ok: false,
          status: 409,
          jsonBody: {error: 'video original is not available yet', code: 'video-missing'},
        }),
      ),
    ) as unknown as typeof fetch
    const res = await fetchVideoEmbedSource('vid_1')
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.code).toBe('video-missing')
      expect(res.error).toContain('not available')
    }
  })

  it('never throws on a network error', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() => Promise.reject(new Error('boom')))
    const res = await fetchVideoEmbedSource('vid_1')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('network')
  })

  it('falls back to a bare embed when the metadata header is absent', async () => {
    mockToken.mockResolvedValue('tok')
    global.fetch = jest.fn(() =>
      Promise.resolve(fakeRes({headers: {'content-type': 'video/mp4'}})),
    ) as unknown as typeof fetch
    const res = await fetchVideoEmbedSource('vid_1')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.embed.$type).toBe('app.bsky.embed.video')
  })
})
