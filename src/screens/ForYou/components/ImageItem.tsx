import {useState} from 'react'
import {FlatList, View} from 'react-native'
import {useSafeAreaFrame} from 'react-native-safe-area-context'
import {Image} from 'expo-image'

import {atoms as a} from '#/alf'
import {useForYouInsets} from '../insets'
import {type FeedMediaImages} from '../types'

/** Full-bleed IMAGE renderer; horizontal swipe carousel with dots when >1 image. */
export function ImageItem({media}: {media: FeedMediaImages}) {
  const {width} = useSafeAreaFrame()
  const {bottom} = useForYouInsets()
  const [index, setIndex] = useState(0)
  const images = media.images

  if (images.length <= 1) {
    return (
      <View style={[a.flex_1, {backgroundColor: '#000'}]}>
        <Image
          source={{uri: images[0]?.url}}
          style={[a.flex_1]}
          contentFit="cover"
          alt={images[0]?.alt}
          accessibilityIgnoresInvertColors
        />
      </View>
    )
  }

  return (
    <View style={[a.flex_1, {backgroundColor: '#000'}]}>
      <FlatList
        data={images}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => String(i)}
        onMomentumScrollEnd={e =>
          setIndex(Math.round(e.nativeEvent.contentOffset.x / width))
        }
        renderItem={({item}) => (
          <Image
            source={{uri: item.url}}
            style={{width, height: '100%'}}
            contentFit="cover"
            alt={item.alt}
            accessibilityIgnoresInvertColors
          />
        )}
      />
      <View
        style={[
          a.absolute,
          a.flex_row,
          a.justify_center,
          a.gap_xs,
          {left: 0, right: 0, bottom: bottom + 96},
        ]}>
        {images.map((_, i) => (
          <View
            key={i}
            style={[
              a.rounded_full,
              {
                width: 6,
                height: 6,
                backgroundColor:
                  i === index ? '#ffffff' : 'rgba(255,255,255,0.4)',
              },
            ]}
          />
        ))}
      </View>
    </View>
  )
}
