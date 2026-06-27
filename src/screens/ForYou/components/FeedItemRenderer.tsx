import {View} from 'react-native'

import {atoms as a} from '#/alf'
import {rendererKindFor, showsMediaFooter} from '../renderer'
import {type FeedItem} from '../types'
import {AudioItem} from './AudioItem'
import {ImageItem} from './ImageItem'
import {ItemFooter} from './ItemFooter'
import {OverlayActions} from './OverlayActions'
import {ScoreCard} from './ScoreCard'
import {TextLinkItem} from './TextLinkItem'
import {VideoItem} from './VideoItem'

/**
 * Polymorphic full-screen item: dispatches on the normalized media type (score card
 * wins when an item carries structured score), overlays the action rail (always)
 * and the gradient footer (bare full-bleed media only — other cards render their
 * own full-frame caption). `active` = focused page (drives video autoplay).
 */
export function FeedItemRenderer({
  item,
  active,
}: {
  item: FeedItem
  active: boolean
}) {
  const kind = rendererKindFor(item)
  return (
    <View style={[a.flex_1, {backgroundColor: '#000'}]}>
      {kind === 'score' && item.score ? (
        <ScoreCard item={item} score={item.score} />
      ) : kind === 'video' && item.media?.kind === 'video' ? (
        <VideoItem item={item} media={item.media} active={active} />
      ) : kind === 'image' && item.media?.kind === 'image' ? (
        <ImageItem media={item.media} />
      ) : kind === 'audio' && item.media?.kind === 'audio' ? (
        <AudioItem item={item} media={item.media} />
      ) : (
        <TextLinkItem item={item} />
      )}

      {showsMediaFooter(kind) ? <ItemFooter item={item} /> : null}
      <OverlayActions item={item} />
    </View>
  )
}
