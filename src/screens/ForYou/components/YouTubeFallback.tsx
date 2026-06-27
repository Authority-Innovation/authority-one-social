import {Linking, Pressable, View} from 'react-native'
import {Image} from 'expo-image'
import {LinearGradient} from 'expo-linear-gradient'

import {atoms as a} from '#/alf'
import {Play_Filled_Corner2_Rounded as PlayIcon} from '#/components/icons/Play'
import {Text} from '#/components/Typography'

/**
 * Shown when a video disallows embedding (IFrame error 101/150 etc.) — a graceful
 * card with the poster + a "Watch on YouTube" tap-out instead of a broken player.
 */
export function YouTubeFallback({
  posterUrl,
  link,
}: {
  posterUrl?: string
  link?: string
}) {
  const open = () => {
    if (link) void Linking.openURL(link)
  }
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="Watch on YouTube"
      accessibilityHint="Opens the video on YouTube"
      onPress={open}
      style={[a.flex_1, a.align_center, a.justify_center, {backgroundColor: '#000'}]}>
      {posterUrl ? (
        <Image
          source={{uri: posterUrl}}
          style={[a.absolute, a.inset_0]}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <LinearGradient
        colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0.65)']}
        style={[a.absolute, a.inset_0]}
      />
      <View
        style={[
          a.align_center,
          a.justify_center,
          a.rounded_full,
          {width: 72, height: 72, backgroundColor: 'rgba(255,255,255,0.18)'},
        ]}>
        <PlayIcon width={32} fill="#fff" />
      </View>
      <Text style={[a.text_md, a.font_bold, a.mt_md, {color: '#fff'}]}>
        Watch on YouTube
      </Text>
    </Pressable>
  )
}
