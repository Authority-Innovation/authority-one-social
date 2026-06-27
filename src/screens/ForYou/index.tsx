import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  View,
  type ViewToken,
} from 'react-native'
import {useSafeAreaFrame, useSafeAreaInsets} from 'react-native-safe-area-context'
import {useNavigation} from '@react-navigation/native'

import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {useFeedProfileQuery} from '#/state/queries/feedProfile'
import {atoms as a} from '#/alf'
import {ArrowLeft_Stroke2_Corner0_Rounded as ArrowLeft} from '#/components/icons/Arrow'
import {Text} from '#/components/Typography'
import {FeedItemRenderer} from './components/FeedItemRenderer'
import {shouldAutoplay} from './feedPager'
import {FeedSignalsProvider, useFeedSignals} from './FeedSignalsProvider'
import {type ForYouInsets, ForYouInsetsProvider, overlayBottomInset} from './insets'
import {rankFeed} from './ranking'
import {isSkip} from './signals'
import {type FeedItem} from './types'
import {useForYouFeed} from './useForYouFeed'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'ForYou'>

/**
 * "For You" / Discover — a TikTok-style vertical snap feed of localized Raleigh
 * sports content. Media is FULL-BLEED behind the persistent tab bar; overlays are
 * inset above it. Items are ranked by the engagement profile (M2) with a
 * round-robin fallback, and engagement is captured per item.
 */
export function ForYouScreen({}: Props) {
  const insets = useSafeAreaInsets()
  const forYouInsets: ForYouInsets = {
    bottom: overlayBottomInset(insets.bottom),
    top: insets.top + 4,
  }
  return (
    <FeedSignalsProvider>
      <ForYouInsetsProvider value={forYouInsets}>
        <Feed topInset={forYouInsets.top} />
      </ForYouInsetsProvider>
    </FeedSignalsProvider>
  )
}

function Feed({topInset}: {topInset: number}) {
  const {height, width} = useSafeAreaFrame()
  const navigation = useNavigation<NavigationProp>()
  const {data: blended, isLoading} = useForYouFeed()
  const {data: weights} = useFeedProfileQuery()
  const {record} = useFeedSignals()

  // Stable "now" captured once at mount (recency is relative to it) — avoids the
  // impure Date.now() in render and keeps the ranking stable across re-renders.
  const [now] = useState(() => Date.now())
  // Rank once per data/weights change. Falls back to the round-robin blend when empty.
  const items = useMemo(
    () => rankFeed(blended ?? [], weights, now),
    [blended, weights, now],
  )

  const [focusIndex, setFocusIndex] = useState(0)

  // Dwell + skip capture: when focus moves off an item, record how long it was shown.
  const prevFocusRef = useRef<number | null>(null)
  const focusStartRef = useRef(0)
  useEffect(() => {
    const now = Date.now()
    const prev = prevFocusRef.current
    if (prev != null && prev !== focusIndex && items[prev]) {
      const dwell = now - focusStartRef.current
      record(items[prev], 'dwell', dwell)
      if (isSkip(dwell)) record(items[prev], 'skip', dwell)
    }
    prevFocusRef.current = focusIndex
    focusStartRef.current = now
  }, [focusIndex, items, record])

  const viewabilityConfig = {itemVisiblePercentThreshold: 60}
  const onViewableItemsChanged = ({
    viewableItems,
  }: {
    viewableItems: ViewToken[]
  }) => {
    const first = viewableItems.find(v => v.isViewable)
    if (first?.index != null) setFocusIndex(first.index)
  }

  const renderItem = useCallback(
    ({item, index}: {item: FeedItem; index: number}) => (
      <View style={{height, width}}>
        <FeedItemRenderer item={item} active={shouldAutoplay(index, focusIndex)} />
      </View>
    ),
    [height, width, focusIndex],
  )

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({length: height, offset: height * index, index}),
    [height],
  )

  return (
    <View style={[a.flex_1, {backgroundColor: '#000'}]}>
      {isLoading ? (
        <View style={[a.flex_1, a.align_center, a.justify_center]}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          pagingEnabled
          snapToInterval={height}
          snapToAlignment="start"
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          windowSize={3}
          maxToRenderPerBatch={2}
          initialNumToRender={2}
          removeClippedSubviews
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
        />
      )}

      {/* Immersive overlay header: back + title (inset below the notch). */}
      <View
        style={[
          a.absolute,
          a.flex_row,
          a.align_center,
          a.gap_sm,
          a.px_md,
          {top: topInset, left: 0},
        ]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Returns to the previous screen"
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={[a.p_xs]}>
          <ArrowLeft width={24} fill="#fff" />
        </Pressable>
        <Text style={[a.text_lg, a.font_bold, {color: '#fff'}]}>For You</Text>
      </View>
    </View>
  )
}
