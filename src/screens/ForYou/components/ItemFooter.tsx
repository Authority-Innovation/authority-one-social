import {Pressable, View} from 'react-native'
import {LinearGradient} from 'expo-linear-gradient'

import {atoms as a} from '#/alf'
import {Text} from '#/components/Typography'
import {openItemLink} from '../actions'
import {useFeedSignals} from '../FeedSignalsProvider'
import {useForYouInsets} from '../insets'
import {type FeedItem} from '../types'

/**
 * Bottom gradient footer over full-bleed media: source chip + title + summary,
 * INSET above the tab bar + home indicator so it's never occluded. Tapping the
 * caption opens the source (records a tapThrough signal).
 */
export function ItemFooter({item}: {item: FeedItem}) {
  const {bottom} = useForYouInsets()
  const {record} = useFeedSignals()
  const onTap = () => {
    if (!item.link) return
    record(item, 'tapThrough')
    void openItemLink(item)
  }
  return (
    <LinearGradient
      colors={['transparent', 'rgba(0,0,0,0.85)']}
      style={[a.absolute, a.w_full, {left: 0, right: 0, bottom: 0, paddingTop: 72}]}>
      <Pressable
        accessibilityRole={item.link ? 'link' : 'none'}
        accessibilityLabel={item.title}
        accessibilityHint={item.link ? 'Opens the source' : undefined}
        onPress={onTap}
        style={[a.px_lg, a.gap_xs, {paddingBottom: bottom, paddingRight: 72}]}>
        <SourceChip item={item} />
        <Text
          emoji
          numberOfLines={3}
          style={[a.text_lg, a.font_bold, a.leading_tight, {color: '#ffffff'}]}>
          {item.title}
        </Text>
        {item.summary ? (
          <Text
            emoji
            numberOfLines={2}
            style={[a.text_sm, a.leading_snug, {color: 'rgba(255,255,255,0.85)'}]}>
            {item.summary}
          </Text>
        ) : null}
      </Pressable>
    </LinearGradient>
  )
}

/** Source attribution + live/sample provenance — required for licensed content. */
export function SourceChip({item}: {item: FeedItem}) {
  return (
    <View style={[a.flex_row, a.align_center, a.gap_xs]}>
      <View
        style={[
          a.rounded_full,
          a.px_sm,
          a.py_2xs,
          {backgroundColor: 'rgba(255,255,255,0.18)'},
        ]}>
        <Text style={[a.text_xs, a.font_bold, {color: '#ffffff'}]}>
          {item.source.name}
        </Text>
      </View>
      {item.author?.name && item.author.name !== item.source.name ? (
        <Text style={[a.text_xs, {color: 'rgba(255,255,255,0.7)'}]}>
          {item.author.name}
        </Text>
      ) : null}
      {item.source.origin === 'sample' ? (
        <Text style={[a.text_2xs, {color: 'rgba(255,255,255,0.5)'}]}>· sample</Text>
      ) : null}
    </View>
  )
}
