import {describe, expect, it} from '@jest/globals'

import {
  buildPlayerVars,
  isEmbeddableError,
  parsePlayerMessage,
  YOUTUBE_ORIGIN,
  youtubePlayerHtml,
} from '../youtube'

describe('buildPlayerVars (error-153 fix config)', () => {
  it('sets enablejsapi/playsinline/origin/rel for valid inline embedding', () => {
    expect(buildPlayerVars(true)).toMatchObject({
      autoplay: 1,
      mute: 1,
      playsinline: 1,
      rel: 0,
      enablejsapi: 1,
      origin: YOUTUBE_ORIGIN,
    })
    expect(buildPlayerVars(false).autoplay).toBe(0)
  })
})

describe('youtubePlayerHtml', () => {
  const html = youtubePlayerHtml('abc123XYZ', true)
  it('uses the IFrame Player API (not a bare embed URL)', () => {
    expect(html).toContain('iframe_api')
    expect(html).toContain('onYouTubeIframeAPIReady')
  })
  it('injects the videoId and the 153-fix player vars', () => {
    expect(html).toContain('"abc123XYZ"')
    expect(html).toContain('"playsinline":1')
    expect(html).toContain('"enablejsapi":1')
    expect(html).toContain(YOUTUBE_ORIGIN)
  })
})

describe('isEmbeddableError', () => {
  it('flags embed-disallowed / invalid-id codes', () => {
    for (const c of [2, 5, 100, 101, 150]) expect(isEmbeddableError(c)).toBe(true)
    expect(isEmbeddableError(0)).toBe(false)
  })
})

describe('parsePlayerMessage', () => {
  it('parses time/ended/error/state and rejects junk', () => {
    expect(
      parsePlayerMessage('{"type":"time","position":5,"duration":10}'),
    ).toEqual({type: 'time', position: 5, duration: 10})
    expect(parsePlayerMessage('{"type":"ended"}')).toEqual({type: 'ended'})
    expect(parsePlayerMessage('{"type":"error","code":150}')).toEqual({
      type: 'error',
      code: 150,
    })
    expect(parsePlayerMessage('{"type":"state","state":1}')).toEqual({
      type: 'state',
      state: 1,
    })
    expect(parsePlayerMessage('not json')).toBeNull()
    expect(parsePlayerMessage('{"type":"time"}')).toBeNull()
    expect(parsePlayerMessage(null)).toBeNull()
  })
})
