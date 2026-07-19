import {useState} from 'react'
import {Image, ScrollView, View} from 'react-native'

import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Text} from '#/components/Typography'
import {type SceneFrame} from '../types'

/**
 * STORY MODE game pane — the narrative scene surface that replaces the board:
 * scene illustration on top, title + narrative text under it, and tappable
 * CHOICE buttons for authored branch points. The chat lane next to it is the
 * primary play surface (conversing with the agent GM); choices are the
 * structured beats. Purely presentational: taps report the choice id up.
 *
 * Strings are plain literals — custom (non-Bluesky) surface, so nothing here
 * rides the Lingui catalog.
 */
export function ScenePane({
  scene,
  chosenId,
  onChoose,
}: {
  /** Current scene, or null while waiting for the engine's first frame. */
  scene: SceneFrame | null
  /** The choice already picked for THIS scene (disables the buttons until the
   *  next scene arrives), or null. */
  chosenId: string | null
  onChoose: (id: string) => void
}) {
  const t = useTheme()
  // Per-image load failure -> graceful placeholder block instead of a hole.
  const [brokenImage, setBrokenImage] = useState<string | null>(null)

  if (!scene) {
    return (
      <View style={[a.flex_1, a.align_center, a.justify_center, a.p_xl]}>
        <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
          Setting the scene…
        </Text>
      </View>
    )
  }

  const choices = scene.choices ?? []
  const imageBroken = scene.image != null && brokenImage === scene.image

  return (
    <ScrollView
      style={[a.flex_1, a.w_full]}
      contentContainerStyle={[a.p_lg, a.gap_md]}
      testID="scenePane">
      {scene.image && !imageBroken ? (
        <Image
          testID="sceneImage"
          source={{uri: scene.image}}
          onError={() => setBrokenImage(scene.image ?? null)}
          accessibilityIgnoresInvertColors
          accessibilityLabel={scene.title ?? 'Scene illustration'}
          accessibilityHint=""
          style={[
            a.w_full,
            a.rounded_md,
            t.atoms.bg_contrast_25,
            {aspectRatio: 16 / 9},
          ]}
          resizeMode="cover"
        />
      ) : (
        <View
          style={[
            a.w_full,
            a.rounded_md,
            a.align_center,
            a.justify_center,
            t.atoms.bg_contrast_25,
            {aspectRatio: 16 / 9},
          ]}>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            {imageBroken ? 'Illustration unavailable' : 'No illustration'}
          </Text>
        </View>
      )}

      {scene.title ? (
        <Text
          testID="sceneTitle"
          style={[a.text_xl, a.font_bold, t.atoms.text]}
          accessibilityRole="header">
          {scene.title}
        </Text>
      ) : null}

      <Text
        testID="sceneText"
        style={[a.text_md, a.leading_normal, t.atoms.text_contrast_high]}
        // New narration is what a screen reader should hear next.
        accessibilityLiveRegion="polite">
        {scene.text}
      </Text>

      {choices.length > 0 ? (
        <View style={[a.gap_sm, a.pt_sm]}>
          {choices.map(choice => (
            <Button
              key={choice.id}
              testID={`choice-${choice.id}`}
              label={choice.label}
              color={chosenId === choice.id ? 'primary' : 'secondary'}
              size="large"
              disabled={chosenId !== null}
              onPress={() => onChoose(choice.id)}>
              <ButtonText>{choice.label}</ButtonText>
            </Button>
          ))}
          {chosenId !== null ? (
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              Waiting for the story…
            </Text>
          ) : null}
        </View>
      ) : (
        <Text style={[a.text_sm, a.pt_sm, t.atoms.text_contrast_medium]}>
          Talk to the game master in the chat to continue.
        </Text>
      )}
    </ScrollView>
  )
}
