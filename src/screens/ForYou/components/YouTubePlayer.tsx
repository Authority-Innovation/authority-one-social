import {useEffect, useRef, useState} from 'react'
import {View} from 'react-native'
import {WebView} from 'react-native-webview'

import {atoms as a} from '#/alf'
import {
  isEmbeddableError,
  parsePlayerMessage,
  YOUTUBE_ORIGIN,
  youtubePlayerHtml,
} from '../youtube'
import {YouTubeFallback} from './YouTubeFallback'

/**
 * In-app YouTube player via the IFrame Player API (WebView). Stays playing in-app
 * (no tap-through). The HTML is served from the youtube.com origin (WebView
 * `baseUrl`) with `enablejsapi`/`playsinline`/`origin` set — this is the error-153
 * fix. Playback is instrumented: play/pause/ended + currentTime are posted back and
 * surfaced via `onProgress`/`onEnded` for watch-duration + completion tracking.
 */
export function YouTubePlayer({
  videoId,
  active,
  posterUrl,
  link,
  onProgress,
  onEnded,
}: {
  videoId: string
  active: boolean
  posterUrl?: string
  link?: string
  onProgress?: (positionSec: number, durationSec: number) => void
  onEnded?: () => void
}) {
  const webRef = useRef<WebView>(null)
  const [errored, setErrored] = useState(false)
  // Stable HTML for this mount (autoplay on — the player is only mounted while focused).
  const [html] = useState(() => youtubePlayerHtml(videoId, true))

  useEffect(() => {
    webRef.current?.injectJavaScript(
      active
        ? 'window.__play && window.__play(); true;'
        : 'window.__pause && window.__pause(); true;',
    )
  }, [active])

  if (errored) return <YouTubeFallback posterUrl={posterUrl} link={link} />

  return (
    <View style={[a.flex_1, a.justify_center, {backgroundColor: '#000'}]}>
      <View style={{width: '100%', aspectRatio: 16 / 9}}>
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          source={{html, baseUrl: YOUTUBE_ORIGIN}}
          style={{flex: 1, backgroundColor: '#000'}}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          onMessage={e => {
            const msg = parsePlayerMessage(e.nativeEvent.data)
            if (!msg) return
            if (msg.type === 'time') onProgress?.(msg.position, msg.duration)
            else if (msg.type === 'ended') onEnded?.()
            else if (msg.type === 'error' && isEmbeddableError(msg.code)) {
              setErrored(true)
            }
          }}
        />
      </View>
    </View>
  )
}
