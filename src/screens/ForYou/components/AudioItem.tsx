import {View} from 'react-native'
import {Image} from 'expo-image'
import {LinearGradient} from 'expo-linear-gradient'

import {atoms as a} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {Play_Filled_Corner2_Rounded as PlayIcon} from '#/components/icons/Play'
import {Text} from '#/components/Typography'
import {openItemLink} from '../actions'
import {useFeedSignals} from '../FeedSignalsProvider'
import {useForYouInsets} from '../insets'
import {type FeedItem, type FeedMediaAudio} from '../types'
import {SourceChip} from './ItemFooter'

function formatDuration(sec?: number): string | undefined {
  if (!sec || sec <= 0) return undefined
  const m = Math.round(sec / 60)
  return `${m} min`
}

/** Full-frame AUDIO / PODCAST card: full-bleed artwork + scrim + title + listen. */
export function AudioItem({
  item,
  media,
}: {
  item: FeedItem
  media: FeedMediaAudio
}) {
  const {bottom} = useForYouInsets()
  const {record} = useFeedSignals()
  const duration = formatDuration(media.durationSec)
  const artwork = media.artworkUrl ?? item.thumbnailUrl

  return (
    <View style={[a.flex_1, {backgroundColor: '#120f1f'}]}>
      {artwork ? (
        <Image
          source={{uri: artwork}}
          style={[a.absolute, a.inset_0]}
          contentFit="cover"
          blurRadius={2}
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <LinearGradient
        colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.9)']}
        style={[a.absolute, a.inset_0]}
      />

      <View
        style={[a.flex_1, a.align_center, a.justify_center, a.px_xl, {gap: 20}]}>
        {artwork ? (
          <Image
            source={{uri: artwork}}
            style={[a.rounded_md, {width: 200, height: 200}]}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : null}
      </View>

      <View
        style={[a.absolute, a.w_full, a.px_xl, a.gap_sm, {left: 0, right: 0, bottom}]}>
        <SourceChip item={item} />
        <Text
          emoji
          numberOfLines={3}
          style={[a.text_xl, a.font_bold, a.leading_tight, {color: '#fff'}]}>
          {item.title}
        </Text>
        <View style={[a.flex_row]}>
          <Button
            label="Listen to episode"
            size="large"
            variant="solid"
            color="primary"
            onPress={() => {
              record(item, 'tapThrough')
              void openItemLink(item)
            }}>
            <ButtonIcon icon={PlayIcon} />
            <ButtonText>{duration ? `Listen · ${duration}` : 'Listen'}</ButtonText>
          </Button>
        </View>
      </View>
    </View>
  )
}
