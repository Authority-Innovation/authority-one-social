import {useCallback} from 'react'
import {Keyboard} from 'react-native'
import {type ImagePickerAsset} from 'expo-image-picker'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {useVideoLibraryPermission} from '#/lib/hooks/usePermissions'
import {atoms as a, useTheme} from '#/alf'
import {Button} from '#/components/Button'
import {VideoClip_Stroke2_Corner0_Rounded as VideoClipIcon} from '#/components/icons/VideoClip'
import * as toast from '#/components/Toast'
import {pickVideo} from './pickVideo'

/**
 * Dedicated VIDEO button for the composer toolbar (native). Sits alongside the
 * media/camera/GIF buttons. Picks a single video from the library and hands the
 * asset up; the composer uploads it to the runtime video pipeline (Option A).
 * Video is mutually exclusive with images/GIF — the composer disables this button
 * when other media is present, and disables the others when a video is attached.
 */
export function SelectVideoBtn({
  onPickVideo,
  disabled,
}: {
  onPickVideo: (asset: ImagePickerAsset) => void
  disabled?: boolean
}) {
  const {_} = useLingui()
  const t = useTheme()
  const {requestVideoAccessIfNeeded} = useVideoLibraryPermission()

  const onPress = useCallback(async () => {
    const access = await requestVideoAccessIfNeeded()
    if (!access) {
      toast.show(_(msg`You need to allow access to your media library.`), {
        type: 'error',
      })
      return
    }
    if (Keyboard.isVisible()) {
      Keyboard.dismiss()
    }
    const res = await pickVideo()
    if (res.canceled || !res.assets || res.assets.length === 0) return
    onPickVideo(res.assets[0])
  }, [_, requestVideoAccessIfNeeded, onPickVideo])

  return (
    <Button
      testID="openVideoBtn"
      onPress={onPress}
      label={_(
        msg({
          message: `Add a video to post`,
          comment: `Accessibility label for the button in the post composer that adds a video.`,
        }),
      )}
      accessibilityHint={_(
        msg({
          message: `Opens the video library to select a single video.`,
          comment: `Accessibility hint for the composer video button.`,
        }),
      )}
      style={a.p_sm}
      variant="ghost"
      shape="round"
      color="primary"
      disabled={disabled}>
      <VideoClipIcon
        size="lg"
        style={disabled && t.atoms.text_contrast_low}
      />
    </Button>
  )
}
