import {useState} from 'react'
import {Pressable, View} from 'react-native'

import {atoms as a} from '#/alf'
import {ArrowShareRight_Stroke2_Corner2_Rounded as ShareIcon} from '#/components/icons/ArrowShareRight'
import {ChainLink_Stroke2_Corner0_Rounded as LinkIcon} from '#/components/icons/ChainLink'
import {
  Heart2_Filled_Stroke2_Corner0_Rounded as HeartFilled,
  Heart2_Stroke2_Corner0_Rounded as HeartOutline,
} from '#/components/icons/Heart2'
import {Text} from '#/components/Typography'
import {openItemLink, shareItem} from '../actions'
import {useFeedSignals} from '../FeedSignalsProvider'
import {useForYouInsets} from '../insets'
import {type FeedItem} from '../types'

/**
 * Right-side action rail over a full-screen item: like (local toggle), share, and
 * tap-through to the source. INSET above the tab bar + home indicator. Each action
 * records an engagement signal. Skip = the next vertical swipe (tracked by the pager).
 */
export function OverlayActions({item}: {item: FeedItem}) {
  const [liked, setLiked] = useState(false)
  const {bottom} = useForYouInsets()
  const {record} = useFeedSignals()
  return (
    <View
      style={[a.absolute, a.align_center, a.gap_lg, {right: 12, bottom: bottom + 56}]}>
      <Action
        label={liked ? 'Unlike' : 'Like'}
        hint="Likes this item"
        onPress={() => {
          setLiked(v => !v)
          if (!liked) record(item, 'like')
        }}
        icon={
          liked ? (
            <HeartFilled width={32} fill="#ff3b5c" />
          ) : (
            <HeartOutline width={32} fill="#ffffff" />
          )
        }
      />
      <Action
        label="Share"
        hint="Shares this item"
        onPress={() => {
          void shareItem(item)
        }}
        icon={<ShareIcon width={30} fill="#ffffff" />}
      />
      {item.link ? (
        <Action
          label="Open source"
          hint="Opens the original source"
          onPress={() => {
            record(item, 'openSource')
            void openItemLink(item)
          }}
          icon={<LinkIcon width={28} fill="#ffffff" />}
        />
      ) : null}
    </View>
  )
}

function Action({
  label,
  hint,
  onPress,
  icon,
}: {
  label: string
  hint: string
  onPress: () => void
  icon: React.ReactNode
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
      hitSlop={12}
      style={[a.align_center, a.gap_xs]}>
      {icon}
      <Text style={[a.text_xs, a.font_bold, {color: '#ffffff'}]}>{label}</Text>
    </Pressable>
  )
}
