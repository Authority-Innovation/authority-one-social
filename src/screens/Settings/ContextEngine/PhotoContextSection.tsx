import {useEffect} from 'react'
import {ActivityIndicator, View} from 'react-native'
import {Trans} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {openPicker} from '#/lib/media/picker'
import {describeConclusion} from '#/lib/photoContext/derive'
import {type NavigationProp} from '#/lib/routes/types'
import {usePhotoContext} from '#/state/photoContext/usePhotoContext'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {CircleInfo_Stroke2_Corner0_Rounded as InfoIcon} from '#/components/icons/CircleInfo'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {IS_NATIVE} from '#/env'

/**
 * Photo Context as a self-contained SECTION (indicator + privacy copy + on/off + today's
 * conclusion + explicit per-photo share). Used inside the Context Engine hub so all
 * context capabilities live on one screen, and reused by the standalone deep-link screen.
 * Independently toggleable; metadata-only; opt-in state lives in the shared photo store
 * (so consolidating the UI preserves any prior opt-in). No heading/outer border — the
 * parent frames it.
 */
export function PhotoContextSection() {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const {
    prefs,
    supported,
    active,
    permissionGranted,
    scanning,
    lastConclusion,
    setEnabled,
    scanNow,
  } = usePhotoContext()

  // On-mount scan when active so the conclusion is fresh. scanNow self-gates (no-op off).
  useEffect(() => {
    if (active) scanNow()
  }, [active, scanNow])

  const sharePhotoWithBob = async () => {
    try {
      const picked = await openPicker({selectionLimit: 1})
      const img = picked?.[0]
      if (!img) return
      navigation.navigate('AgentChat', {
        sharedPhotoUri: img.path,
        sharedPhotoMime: img.mime,
      })
    } catch {
      Toast.show('Could not open the photo picker.', {type: 'warning'})
    }
  }

  return (
    <View style={[a.gap_lg]}>
      {/* Active indicator */}
      <View
        style={[
          a.flex_row,
          a.align_center,
          a.gap_sm,
          a.rounded_md,
          a.p_md,
          active
            ? {backgroundColor: t.palette.positive_50}
            : t.atoms.bg_contrast_25,
        ]}>
        <View
          style={[
            a.rounded_full,
            {
              width: 10,
              height: 10,
              backgroundColor: active
                ? t.palette.positive_500
                : t.palette.contrast_400,
            },
          ]}
        />
        <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
          {active ? (
            <Trans>On — summarizing today’s photos (metadata only)</Trans>
          ) : prefs.enabled && !permissionGranted ? (
            <Trans>On, but photo permission is needed</Trans>
          ) : (
            <Trans>Off</Trans>
          )}
        </Text>
      </View>

      {/* Privacy copy */}
      <View style={[a.flex_row, a.gap_sm]}>
        <InfoIcon size="sm" fill={t.atoms.text_contrast_medium.color} />
        <Text
          style={[
            a.flex_1,
            a.text_sm,
            a.leading_snug,
            t.atoms.text_contrast_medium,
          ]}>
          <Trans>
            When on, this reads only the METADATA of today’s photos on your
            device — how many, roughly when, and a coarse place from photo
            location — and turns it into a conclusion like “12 photos, near a
            venue this afternoon.” Your photos are never read or uploaded. The
            only time an actual image is shared is when you tap “Share a photo
            with Bob” below and pick one yourself. We recommend granting LIMITED
            access (selected photos).
          </Trans>
        </Text>
      </View>

      {/* One-tap on/off */}
      <Button
        label={
          prefs.enabled ? 'Turn off Photo Context' : 'Turn on Photo Context'
        }
        size="large"
        variant="solid"
        color={prefs.enabled ? 'secondary' : 'primary'}
        disabled={!supported && !prefs.enabled}
        onPress={() => setEnabled(!prefs.enabled)}>
        <ButtonText>
          {prefs.enabled ? <Trans>Turn off</Trans> : <Trans>Turn on</Trans>}
        </ButtonText>
      </Button>
      {prefs.enabled && !permissionGranted && IS_NATIVE ? (
        <Button
          label="Grant photo permission"
          size="small"
          variant="outline"
          color="primary"
          onPress={() => setEnabled(true)}>
          <ButtonText>
            <Trans>Grant photo permission</Trans>
          </ButtonText>
        </Button>
      ) : null}

      {/* Today's conclusion + manual rescan */}
      {active ? (
        <View style={[a.gap_sm, a.pt_sm]}>
          <View style={[a.flex_row, a.align_center, a.gap_sm]}>
            <Text style={[a.flex_1, a.text_sm, t.atoms.text]}>
              {scanning ? (
                <Trans>Scanning today’s photos…</Trans>
              ) : lastConclusion ? (
                describeConclusion(lastConclusion)
              ) : (
                <Trans>No photos found for today yet.</Trans>
              )}
            </Text>
            {scanning ? <ActivityIndicator /> : null}
          </View>
          <Button
            label="Scan today's photos now"
            size="small"
            variant="solid"
            color="secondary"
            disabled={scanning}
            onPress={() => scanNow()}>
            <ButtonText>
              <Trans>Scan today’s photos</Trans>
            </ButtonText>
          </Button>
        </View>
      ) : null}

      {/* Explicit per-photo vision share */}
      <View style={[a.gap_sm]}>
        <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
          <Trans>Share a specific photo</Trans>
        </Text>
        <Text style={[a.text_sm, a.leading_snug, t.atoms.text_contrast_medium]}>
          <Trans>
            Hand Bob one photo to actually look at. You pick it; it opens in
            your chat so you can review and send it. This is the only action
            that shares an image.
          </Trans>
        </Text>
        <Button
          label="Share a photo with Bob"
          size="large"
          variant="solid"
          color="primary"
          disabled={!IS_NATIVE}
          onPress={() => {
            void sharePhotoWithBob()
          }}>
          <ButtonText>
            <Trans>Share a photo with Bob</Trans>
          </ButtonText>
        </Button>
      </View>
    </View>
  )
}
