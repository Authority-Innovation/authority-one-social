import {useEffect} from 'react'
import {ActivityIndicator, View} from 'react-native'
import {Trans} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {openPicker} from '#/lib/media/picker'
import {describeConclusion} from '#/lib/photoContext/derive'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {usePhotoContext} from '#/state/photoContext/usePhotoContext'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {CircleInfo_Stroke2_Corner0_Rounded as InfoIcon} from '#/components/icons/CircleInfo'
import * as Layout from '#/components/Layout'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {IS_NATIVE} from '#/env'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'PhotoContextSettings'>

/**
 * Photo Context (v1) — OPT-IN, OFF by default, METADATA-ONLY. Reads only today's photo
 * metadata (count + time window + EXIF location) on-device, derives a coarse conclusion,
 * and syncs the conclusion to the agent. The ONLY place an actual image moves is the
 * explicit "share a photo with Bob" action, which routes a chosen photo through the
 * images-in-chat vision path. Nothing is read while the setting is off.
 */
export function PhotoContextSettingsScreen({}: Props) {
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

  // On-open scan: when the screen opens and Photo Context is active, refresh today's
  // conclusion so Bob is caught up. scanNow self-gates (does nothing when off/unpermitted).
  useEffect(() => {
    if (active) scanNow()
  }, [active, scanNow])

  // Explicit per-photo share: pick one photo, hand it to the chat composer (the
  // already-built images-in-chat vision path) for the owner to review + send.
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
    <Layout.Screen>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>Photo Context</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>

      <Layout.Content>
        <View style={[a.p_lg, a.gap_lg]}>
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
                When on, this reads only the METADATA of today’s photos on your device —
                how many, roughly when, and a coarse place from photo location — and
                turns it into a conclusion like “12 photos, near a venue this afternoon.”
                Your photos are never read or uploaded. The only time an actual image is
                shared is when you tap “Share a photo with Bob” below and pick one
                yourself. We recommend granting LIMITED access (selected photos).
              </Trans>
            </Text>
          </View>

          {/* One-tap on/off */}
          <Button
            label={prefs.enabled ? 'Turn off Photo Context' : 'Turn on Photo Context'}
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
          <View style={[a.gap_sm, a.pt_lg, a.border_t, t.atoms.border_contrast_low]}>
            <Text style={[a.text_md, a.font_bold, a.pt_lg, t.atoms.text]}>
              <Trans>Share a specific photo</Trans>
            </Text>
            <Text style={[a.text_sm, a.leading_snug, t.atoms.text_contrast_medium]}>
              <Trans>
                Hand Bob one photo to actually look at. You pick it; it opens in your
                chat so you can review and send it. This is the only action that shares
                an image.
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
      </Layout.Content>
    </Layout.Screen>
  )
}
