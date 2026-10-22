import {useState} from 'react'
import {ScrollView, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {LoggedOut} from '#/view/com/auth/LoggedOut'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Loader} from '#/components/Loader'
import {Text} from '#/components/Typography'
import {useAOSignatureState} from '../hooks'
import {AOAccountActions} from './AccountActions'
import {AOAgentPicker} from './AgentPicker'

/**
 * What a person signed in ONLY with Authority Signature sees (no PDS session in
 * the social app), and the first-run picker for anyone whose AO session has no
 * agent yet. The social timeline needs the person's PDS session, which this
 * lane deliberately never hands to the device (see the P2b report, open items).
 */
export function AOSignatureShell({gate}: {gate: 'loading' | 'shell'}) {
  const t = useTheme()
  const {_} = useLingui()
  const insets = useSafeAreaInsets()
  const {record} = useAOSignatureState()
  const [showHandleSignIn, setShowHandleSignIn] = useState(false)

  if (gate === 'loading' || !record) {
    return (
      <View style={[a.flex_1, a.align_center, a.justify_center, t.atoms.bg]}>
        <Loader size="xl" />
      </View>
    )
  }
  if (showHandleSignIn) {
    return <LoggedOut onDismiss={() => setShowHandleSignIn(false)} />
  }

  return (
    <ScrollView
      testID="aoSignatureShell"
      style={[a.flex_1, t.atoms.bg]}
      contentContainerStyle={{
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}>
      {record.needsAgent ? (
        <AOAgentPicker token={record.token} />
      ) : (
        <View style={[a.p_xl, a.gap_lg]}>
          <Text style={[a.text_2xl, a.font_bold]}>
            <Trans>You're signed in to Authority One</Trans>
          </Text>
          <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
            <Trans>
              Your agent is ready. The social timeline still needs your
              Authority One handle sign-in for now.
            </Trans>
          </Text>
          <Button
            label={_(msg`Sign in with your handle`)}
            color="primary"
            size="large"
            onPress={() => setShowHandleSignIn(true)}>
            <ButtonText>
              <Trans>Sign in with your handle</Trans>
            </ButtonText>
          </Button>
        </View>
      )}
      <View style={[a.px_xl, a.pb_xl]}>
        <AOAccountActions />
      </View>
    </ScrollView>
  )
}
