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
import {AOConnectCommunity} from './ConnectCommunity'
import {AOEnrollment} from './Enrollment'
import {AOOptionalAgent} from './OptionalAgent'

/**
 * What a person signed in ONLY with Authority Signature sees (no PDS session in
 * the social app), and Community's terms for an AO session that has not
 * accepted them. An agent is optional (person-only members): it is offered,
 * never required. The social timeline needs the person's PDS session, which
 * this lane deliberately never hands to the device (see the P2b report, open
 * items).
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
      {!record.enrolled ? (
        // Community's own terms come first (per-app enrollment): keyed by the
        // session so a new sign-in never inherits an earlier screen's ticks.
        <AOEnrollment key={record.sid} token={record.token} sid={record.sid} />
      ) : (
        // Community members are person-only: no primary agent is NOT a
        // gate. The community comes first; the picker is an offer.
        <View style={[a.p_xl, a.gap_lg]}>
          <Text style={[a.text_2xl, a.font_bold]}>
            <Trans>You're signed in to Community</Trans>
          </Text>
          <AOConnectCommunity key={record.sid} record={record} />
          <AOOptionalAgent
            // One offer (and picker) per AO session: a session swap (new
            // sign-in, reverify) remounts it, so no state or in-flight answer
            // from the previous session survives.
            key={`agent-${record.sid}`}
            record={record}
          />
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
