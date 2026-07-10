import {useCallback} from 'react'
import {type ImagePickerAsset} from 'expo-image-picker'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {atoms as a, useTheme} from '#/alf'
import {Button} from '#/components/Button'
import {VideoClip_Stroke2_Corner0_Rounded as VideoClipIcon} from '#/components/icons/VideoClip'
import {getVideoMetadata} from './pickVideo'

/**
 * Dedicated VIDEO button for the composer toolbar (web). Opens a native file
 * dialog constrained to video types and hands the picked asset up; the composer
 * uploads it to the runtime video pipeline (Option A). Mutually exclusive with
 * images/GIF (enforced by the composer).
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

  const onPress = useCallback(() => {
    const input = document.createElement('input')
    input.style.display = 'none'
    input.setAttribute('type', 'file')
    // Video-only file dialog (the dedicated button, unlike the unified picker).
    input.setAttribute('accept', 'video/mp4,video/quicktime,video/webm')
    input.setAttribute('id', String(Math.random()))
    document.body.appendChild(input)

    input.addEventListener('change', () => {
      void (async () => {
        try {
          const file = input.files?.[0]
          if (file) {
            const asset = await getVideoMetadata(file)
            onPickVideo(asset)
          }
        } finally {
          document.body.removeChild(input)
        }
      })()
    })

    input.dispatchEvent(new MouseEvent('click'))
  }, [onPickVideo])

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
          message: `Opens a file dialog to select a single video.`,
          comment: `Accessibility hint for the composer video button.`,
        }),
      )}
      style={a.p_sm}
      variant="ghost"
      shape="round"
      color="primary"
      disabled={disabled}>
      <VideoClipIcon size="lg" style={disabled && t.atoms.text_contrast_low} />
    </Button>
  )
}
