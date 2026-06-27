import {useEffect, useRef, useState} from 'react'
import {Pressable, View} from 'react-native'
import {Image} from 'expo-image'
import {createVideoPlayer, VideoView} from 'expo-video'

import {atoms as a} from '#/alf'
import {SpeakerVolumeFull_Stroke2_Corner0_Rounded as SpeakerIcon} from '#/components/icons/Speaker'
import {useFeedSignals} from '../FeedSignalsProvider'
import {completionPct} from '../signals'
import {type FeedItem, type FeedMediaVideo} from '../types'
import {YouTubePlayer} from './YouTubePlayer'

/**
 * Full-screen VIDEO renderer with watch tracking.
 *  - YouTube highlight -> in-app IFrame player (not re-hosted), fallback card when
 *    embedding is disallowed.
 *  - Direct mp4/HLS  -> expo-video: autoplays when focused, pauses/mutes off-screen,
 *    loops, mute toggle.
 * Watch position + duration are aggregated and recorded as a 'watch' signal (with
 * completion %) when the item is recycled.
 */
export function VideoItem({
  item,
  media,
  active,
}: {
  item: FeedItem
  media: FeedMediaVideo
  active: boolean
}) {
  const {record} = useFeedSignals()
  const watchedRef = useRef(0)
  const durationRef = useRef(0)

  const onProgress = (positionSec: number, durationSec: number) => {
    if (positionSec > watchedRef.current) watchedRef.current = positionSec
    if (durationSec > 0) durationRef.current = durationSec
  }
  const onEnded = () => {
    watchedRef.current = durationRef.current
  }

  // Record watch completion when this item is recycled out of the pager.
  useEffect(() => {
    return () => {
      if (durationRef.current > 0) {
        record(item, 'watch', completionPct(watchedRef.current, durationRef.current))
      }
    }
  }, [item, record])

  if (media.embed?.provider === 'youtube') {
    if (!active) return <Poster url={media.posterUrl} />
    return (
      <YouTubePlayer
        videoId={media.embed.videoId}
        active={active}
        posterUrl={media.posterUrl}
        link={item.link}
        onProgress={onProgress}
        onEnded={onEnded}
      />
    )
  }
  if (media.url) {
    return (
      <DirectVideo
        url={media.url}
        posterUrl={media.posterUrl}
        active={active}
        onProgress={onProgress}
      />
    )
  }
  return <Poster url={media.posterUrl} />
}

function DirectVideo({
  url,
  posterUrl,
  active,
  onProgress,
}: {
  url: string
  posterUrl?: string
  active: boolean
  onProgress: (positionSec: number, durationSec: number) => void
}) {
  const [muted, setMuted] = useState(true)
  // Plain createVideoPlayer (not the useVideoPlayer hook) + property mutation in the
  // render body: lint-clean expo-video idiom (mirrors src/screens/VideoFeed).
  const player = createVideoPlayer(url)
  player.loop = true
  player.muted = muted

  useEffect(() => {
    if (active) player.play()
    else player.pause()
  }, [player, active])

  useEffect(() => {
    return () => player.release()
  }, [player])

  // Poll playback position while focused for watch tracking.
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => {
      onProgress(player.currentTime, player.duration)
    }, 1000)
    return () => clearInterval(id)
  }, [player, active, onProgress])

  return (
    <View style={[a.flex_1, {backgroundColor: '#000'}]}>
      {posterUrl ? (
        <Image
          source={{uri: posterUrl}}
          style={[a.absolute, a.inset_0]}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <VideoView
        player={player}
        style={[a.flex_1]}
        contentFit="contain"
        nativeControls={false}
        allowsFullscreen={false}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={muted ? 'Unmute' : 'Mute'}
        accessibilityHint="Toggles audio for this video"
        onPress={() => setMuted(v => !v)}
        hitSlop={12}
        style={[
          a.absolute,
          a.rounded_full,
          a.p_sm,
          {top: 16, right: 12, backgroundColor: 'rgba(0,0,0,0.5)'},
        ]}>
        <SpeakerIcon width={20} fill="#fff" style={{opacity: muted ? 0.45 : 1}} />
      </Pressable>
    </View>
  )
}

/** Poster frame shown for off-screen / source-less video. No placeholder glyph. */
function Poster({url}: {url?: string}) {
  return (
    <View style={[a.flex_1, {backgroundColor: '#000'}]}>
      {url ? (
        <Image
          source={{uri: url}}
          style={[a.absolute, a.inset_0]}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : null}
    </View>
  )
}
