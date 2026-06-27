import {type FeedItem} from './types'

/** Which full-screen renderer a normalized item maps to. */
export type RendererKind = 'video' | 'image' | 'audio' | 'score' | 'textlink'

/**
 * Pure mapping from a FeedItem to its renderer. A structured `score` wins (designed
 * score card). Otherwise dispatch on media type; a declared media type whose `media`
 * payload is missing/mismatched degrades to the text/link card rather than crashing.
 */
export function rendererKindFor(item: FeedItem): RendererKind {
  if (item.score) return 'score'
  switch (item.type) {
    case 'video':
      return item.media?.kind === 'video' ? 'video' : 'textlink'
    case 'image':
      return item.media?.kind === 'image' ? 'image' : 'textlink'
    case 'audio':
      return item.media?.kind === 'audio' ? 'audio' : 'textlink'
    case 'text':
    case 'link':
    default:
      return 'textlink'
  }
}

/**
 * Whether the renderer needs the shared bottom gradient footer overlaid by the
 * parent. Only the bare full-bleed media kinds (video/image) do; score/audio/
 * textlink cards render their own full-frame caption.
 */
export function showsMediaFooter(kind: RendererKind): boolean {
  return kind === 'video' || kind === 'image'
}
