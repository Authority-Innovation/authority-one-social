import {describe, expect, it} from '@jest/globals'

import {parseEmbedPlayerFromUrl} from '../embed-player'

describe('parseEmbedPlayerFromUrl — YouTube (youtube-nocookie direct embed)', () => {
  it('maps youtu.be short links to a youtube-nocookie /embed URL', () => {
    const params = parseEmbedPlayerFromUrl('https://youtu.be/dQw4w9WgXcQ')
    expect(params).toBeDefined()
    expect(params?.source).toBe('youtube')
    expect(params?.type).toBe('youtube_video')
    expect(params?.playerUri).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=0&autoplay=1&playsinline=1',
    )
  })

  it('maps youtube.com/watch links to a youtube-nocookie /embed URL', () => {
    const params = parseEmbedPlayerFromUrl(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    )
    expect(params?.source).toBe('youtube')
    expect(params?.playerUri).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=0&autoplay=1&playsinline=1',
    )
  })

  it('preserves the seek (t) param', () => {
    const params = parseEmbedPlayerFromUrl(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s',
    )
    expect(params?.playerUri).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90&autoplay=1&playsinline=1',
    )
  })

  it('maps YouTube Shorts to a youtube-nocookie /embed URL', () => {
    const params = parseEmbedPlayerFromUrl(
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    )
    expect(params?.source).toBe('youtubeShorts')
    expect(params?.type).toBe('youtube_short')
    expect(params?.playerUri).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=0&autoplay=1&playsinline=1',
    )
  })

  it('NEVER routes YouTube through bsky.app or a self-hosted /iframe wrapper (the 404 bug)', () => {
    for (const url of [
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    ]) {
      const params = parseEmbedPlayerFromUrl(url)
      expect(params?.playerUri).not.toContain('bsky.app')
      expect(params?.playerUri).not.toContain('/iframe/youtube.html')
      expect(params?.playerUri).not.toContain('authority-one')
    }
  })

  it('leaves other external players pointed at their own hosts (unaffected)', () => {
    expect(
      parseEmbedPlayerFromUrl('https://vimeo.com/123456789')?.playerUri,
    ).toContain('player.vimeo.com')
    expect(
      parseEmbedPlayerFromUrl(
        'https://www.twitch.tv/videos/1234567890',
      )?.playerUri,
    ).toContain('player.twitch.tv')
  })
})
