import {View} from 'react-native'
import {Trans} from '@lingui/react/macro'

import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {PhotoContextSection} from '#/screens/Settings/ContextEngine/PhotoContextSection'
import {atoms as a} from '#/alf'
import * as Layout from '#/components/Layout'

type Props = NativeStackScreenProps<
  CommonNavigatorParams,
  'PhotoContextSettings'
>

/**
 * Photo Context now lives as a SECTION inside the Context Engine hub
 * (/settings/context-engine). This standalone screen is retained only so the
 * /settings/photo-context deep link keeps working — it renders the same shared section.
 * It is no longer surfaced from the Settings menu.
 */
export function PhotoContextSettingsScreen({}: Props) {
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
          <PhotoContextSection />
        </View>
      </Layout.Content>
    </Layout.Screen>
  )
}
