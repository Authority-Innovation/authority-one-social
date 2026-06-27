import {describe, expect, it} from '@jest/globals'

import {rendererKindFor, showsMediaFooter} from '../renderer'
import {type FeedItem} from '../types'

function base(): Omit<FeedItem, 'type' | 'media'> {
  return {
    id: 'x',
    title: 't',
    source: {id: 's', name: 's', origin: 'sample'},
    createdAt: 0,
    tags: {},
  }
}

describe('rendererKindFor', () => {
  it('maps each media type to its renderer', () => {
    expect(
      rendererKindFor({...base(), type: 'video', media: {kind: 'video', url: 'u'}}),
    ).toBe('video')
    expect(
      rendererKindFor({
        ...base(),
        type: 'image',
        media: {kind: 'image', images: [{url: 'u'}]},
      }),
    ).toBe('image')
    expect(
      rendererKindFor({...base(), type: 'audio', media: {kind: 'audio', url: 'u'}}),
    ).toBe('audio')
    expect(rendererKindFor({...base(), type: 'text'})).toBe('textlink')
    expect(rendererKindFor({...base(), type: 'link'})).toBe('textlink')
  })

  it('degrades to textlink when the media payload is missing/mismatched', () => {
    expect(rendererKindFor({...base(), type: 'video'})).toBe('textlink')
    expect(
      rendererKindFor({
        ...base(),
        type: 'video',
        media: {kind: 'image', images: [{url: 'u'}]},
      }),
    ).toBe('textlink')
  })

  it('renders a designed score card when an item carries a structured score', () => {
    expect(
      rendererKindFor({
        ...base(),
        type: 'text',
        score: {home: 'Hurricanes', away: 'Capitals', homeScore: 4, awayScore: 2},
      }),
    ).toBe('score')
  })
})

describe('showsMediaFooter', () => {
  it('only full-bleed media gets the gradient footer (score/audio/textlink render their own)', () => {
    expect(showsMediaFooter('video')).toBe(true)
    expect(showsMediaFooter('image')).toBe(true)
    expect(showsMediaFooter('score')).toBe(false)
    expect(showsMediaFooter('audio')).toBe(false)
    expect(showsMediaFooter('textlink')).toBe(false)
  })
})
