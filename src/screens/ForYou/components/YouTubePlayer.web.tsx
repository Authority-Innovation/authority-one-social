import {View} from 'react-native'

import {atoms as a} from '#/alf'

/**
 * Web in-app YouTube player: an <iframe> with `enablejsapi`/`playsinline` and the
 * page `origin` set (the error-153 fix also applies on web). Plays inline; detailed
 * watch-tracking is handled on native (the iOS live-test target) via the IFrame API
 * WebView. Props mirror the native player; `onProgress`/`onEnded` are accepted but
 * unused on web.
 */
export function YouTubePlayer({
  videoId,
  active,
}: {
  videoId: string
  active: boolean
  posterUrl?: string
  link?: string
  onProgress?: (positionSec: number, durationSec: number) => void
  onEnded?: () => void
}) {
  const origin =
    typeof window !== 'undefined' && window.location
      ? window.location.origin
      : 'https://localhost'
  const src =
    `https://www.youtube.com/embed/${videoId}` +
    `?enablejsapi=1&autoplay=${active ? 1 : 0}&mute=1&playsinline=1` +
    `&rel=0&modestbranding=1&origin=${encodeURIComponent(origin)}`

  return (
    <View style={[a.flex_1, a.justify_center, {backgroundColor: '#000'}]}>
      <iframe
        title="YouTube video player"
        src={src}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        style={{width: '100%', aspectRatio: '16 / 9', border: 0, background: '#000'}}
      />
    </View>
  )
}
