import {Pressable, View} from 'react-native'
import {Image} from 'expo-image'
import {LinearGradient} from 'expo-linear-gradient'

import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'
import {openItemLink} from '../actions'
import {useFeedSignals} from '../FeedSignalsProvider'
import {useForYouInsets} from '../insets'
import {type FeedItem} from '../types'
import {SourceChip} from './ItemFooter'

/**
 * Full-screen TEXT / LINK card. When the article has a lead image it's FULL-BLEED
 * with the headline + source overlaid at the bottom over a gradient scrim (TikTok
 * style — not image-on-top, text-below). Without an image it's a designed
 * full-frame brand gradient. Tapping opens the source (records tapThrough).
 */
export function TextLinkItem({item}: {item: FeedItem}) {
  const t = useTheme()
  const {bottom} = useForYouInsets()
  const {record} = useFeedSignals()
  const hasImage = !!item.thumbnailUrl
  const isLink = item.type === 'link'

  const onTap = () => {
    if (!item.link) return
    record(item, 'tapThrough')
    void openItemLink(item)
  }

  return (
    <Pressable
      accessibilityRole={item.link ? 'link' : 'none'}
      accessibilityLabel={item.title}
      accessibilityHint={item.link ? 'Opens the article' : undefined}
      onPress={onTap}
      style={[a.flex_1, {backgroundColor: '#0b0b0b'}]}>
      {hasImage ? (
        <Image
          source={{uri: item.thumbnailUrl}}
          style={[a.absolute, a.inset_0]}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <LinearGradient
          colors={[t.palette.primary_600, '#0b0b0b']}
          start={{x: 0, y: 0}}
          end={{x: 1, y: 1}}
          style={[a.absolute, a.inset_0]}
        />
      )}

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.88)']}
        style={[a.absolute, a.w_full, {left: 0, right: 0, bottom: 0, paddingTop: 140}]}>
        <View style={[a.px_xl, a.gap_sm, {paddingBottom: bottom, paddingRight: 72}]}>
          <SourceChip item={item} />
          <Text
            emoji
            numberOfLines={hasImage ? 3 : 5}
            style={[a.text_2xl, a.font_bold, a.leading_tight, {color: '#fff'}]}>
            {item.title}
          </Text>
          {item.summary ? (
            <Text
              emoji
              numberOfLines={3}
              style={[a.text_md, a.leading_snug, {color: 'rgba(255,255,255,0.85)'}]}>
              {item.summary}
            </Text>
          ) : null}
          {item.link ? (
            <Text style={[a.text_sm, a.font_bold, {color: '#fff', opacity: 0.95}]}>
              {isLink ? 'Tap to read more →' : 'Tap to open →'}
            </Text>
          ) : null}
        </View>
      </LinearGradient>
    </Pressable>
  )
}
