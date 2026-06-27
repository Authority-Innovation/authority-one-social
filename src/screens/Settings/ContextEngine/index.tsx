import {View} from 'react-native'
import {Trans} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {useContextEngine} from '#/state/contextEngine/ContextEngineProvider'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {CircleInfo_Stroke2_Corner0_Rounded as InfoIcon} from '#/components/icons/CircleInfo'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'
import {IS_NATIVE} from '#/env'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'ContextEngineSettings'>

/**
 * Context Engine (Phase 1, location-only) — OPT-IN, OFF by default. Clear privacy
 * copy, a visible active indicator, and one-tap off. Location permission is only
 * requested when the user opts in.
 */
export function ContextEngineSettingsScreen({}: Props) {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const {
    prefs,
    active,
    permissionGranted,
    setEnabled,
    setHome,
    setWork,
    backgroundSupported,
    backgroundActive,
    backgroundPermissionGranted,
    setBackgroundEnabled,
  } = useContextEngine()

  return (
    <Layout.Screen>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>Context Engine</Trans>
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
              active ? {backgroundColor: t.palette.positive_50} : t.atoms.bg_contrast_25,
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
                <Trans>Active — recognizing coarse places</Trans>
              ) : prefs.enabled && !permissionGranted ? (
                <Trans>On, but location permission is needed</Trans>
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
                Phase 1 uses your location ONLY, only while the app is open. It runs
                on-device and stores CONCLUSIONS (like “home”, “a venue”, or how long
                you stayed) — never your raw location, and never audio, microphone, or
                camera. You can view and delete everything below.
              </Trans>
            </Text>
          </View>

          {/* One-tap on/off */}
          <Button
            label={prefs.enabled ? 'Turn off Context Engine' : 'Turn on Context Engine'}
            size="large"
            variant="solid"
            color={prefs.enabled ? 'secondary' : 'primary'}
            onPress={() => setEnabled(!prefs.enabled)}>
            <ButtonText>
              {prefs.enabled ? <Trans>Turn off</Trans> : <Trans>Turn on</Trans>}
            </ButtonText>
          </Button>
          {prefs.enabled && !permissionGranted && IS_NATIVE ? (
            <Button
              label="Grant location permission"
              size="small"
              variant="outline"
              color="primary"
              onPress={() => setEnabled(true)}>
              <ButtonText>
                <Trans>Grant location permission</Trans>
              </ButtonText>
            </Button>
          ) : null}

          {/* ── Phase 1.5: all-day BACKGROUND place context — a SEPARATE, higher
              opt-in. OFF by default; independent of the when-in-use toggle above. ── */}
          {backgroundSupported ? (
            <View
              style={[
                a.gap_md,
                a.pt_lg,
                a.mt_sm,
                a.border_t,
                t.atoms.border_contrast_low,
              ]}>
              <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
                <Trans>All-day place context</Trans>
              </Text>

              {/* Background active indicator */}
              <View
                style={[
                  a.flex_row,
                  a.align_center,
                  a.gap_sm,
                  a.rounded_md,
                  a.p_md,
                  backgroundActive
                    ? {backgroundColor: t.palette.positive_50}
                    : t.atoms.bg_contrast_25,
                ]}>
                <View
                  style={[
                    a.rounded_full,
                    {
                      width: 10,
                      height: 10,
                      backgroundColor: backgroundActive
                        ? t.palette.positive_500
                        : t.palette.contrast_400,
                    },
                  ]}
                />
                <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
                  {backgroundActive ? (
                    <Trans>On — recognizing places all day in the background</Trans>
                  ) : prefs.backgroundEnabled && !backgroundPermissionGranted ? (
                    <Trans>On, but “Always” location permission is needed</Trans>
                  ) : (
                    <Trans>Off</Trans>
                  )}
                </Text>
              </View>

              {/* Transparency copy for the higher opt-in */}
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
                    This goes further than Phase 1: it uses “Always” location so it can
                    notice the places you go even when the app is closed. It still runs
                    battery-light, still stores ONLY conclusions (place + how long) —
                    never a GPS trail — and still no audio, microphone, or camera. Leave
                    it off to keep location to when-the-app-is-open only.
                  </Trans>
                </Text>
              </View>

              {/* Distinct background on/off */}
              <Button
                label={
                  prefs.backgroundEnabled
                    ? 'Turn off all-day place context'
                    : 'Turn on all-day place context'
                }
                size="large"
                variant="solid"
                color={prefs.backgroundEnabled ? 'secondary' : 'primary'}
                onPress={() => setBackgroundEnabled(!prefs.backgroundEnabled)}>
                <ButtonText>
                  {prefs.backgroundEnabled ? (
                    <Trans>Turn off all-day context</Trans>
                  ) : (
                    <Trans>Turn on all-day context</Trans>
                  )}
                </ButtonText>
              </Button>
              {prefs.backgroundEnabled &&
              !backgroundPermissionGranted &&
              IS_NATIVE ? (
                <Button
                  label="Grant Always location permission"
                  size="small"
                  variant="outline"
                  color="primary"
                  onPress={() => setBackgroundEnabled(true)}>
                  <ButtonText>
                    <Trans>Grant “Always” location permission</Trans>
                  </ButtonText>
                </Button>
              ) : null}
            </View>
          ) : null}
        </View>

        <SettingsList.Container>
          <SettingsList.Group iconInset={false}>
            <SettingsList.ItemText>
              <Trans>Anchors (stored on-device only)</Trans>
            </SettingsList.ItemText>
            <View style={[a.flex_row, a.gap_sm, a.pt_xs]}>
              <Button
                label="Set current location as Home"
                size="small"
                variant="solid"
                color="secondary"
                disabled={!IS_NATIVE}
                onPress={() => setHome()}>
                <ButtonText>
                  {prefs.home ? <Trans>Update Home</Trans> : <Trans>Set Home</Trans>}
                </ButtonText>
              </Button>
              <Button
                label="Set current location as Work"
                size="small"
                variant="solid"
                color="secondary"
                disabled={!IS_NATIVE}
                onPress={() => setWork()}>
                <ButtonText>
                  {prefs.work ? <Trans>Update Work</Trans> : <Trans>Set Work</Trans>}
                </ButtonText>
              </Button>
            </View>
            <Text style={[a.text_xs, t.atoms.text_contrast_medium, a.pt_xs]}>
              {prefs.home ? '✓ Home set · ' : 'Home not set · '}
              {prefs.work ? '✓ Work set' : 'Work not set'}
            </Text>
          </SettingsList.Group>

          <SettingsList.PressableItem
            label="View context log"
            onPress={() => navigation.navigate('ContextLog')}>
            <SettingsList.ItemText>
              <Trans>View context log</Trans>
            </SettingsList.ItemText>
            <SettingsList.Chevron />
          </SettingsList.PressableItem>
        </SettingsList.Container>
      </Layout.Content>
    </Layout.Screen>
  )
}
