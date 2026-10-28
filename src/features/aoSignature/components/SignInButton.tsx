import {View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {atoms as a} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {FormError} from '#/components/forms/FormError'
import {Loader} from '#/components/Loader'
import {AO_SIGNATURE_CONFIG} from '../config'
import {startAOSignature} from '../controller'
import {useAOSignatureState} from '../hooks'
import {clearAONotice} from '../store'
import {useAOAction} from './useAOAction'

/** "Sign in with Authority Signature" on the sign-in screen. Null while dark. */
export function AOSignatureSignInButton() {
  if (AO_SIGNATURE_CONFIG === null) return null
  return <ArmedSignInButton />
}

function ArmedSignInButton() {
  const {_, i18n} = useLingui()
  const {notice} = useAOSignatureState()
  const {run, busy, error} = useAOAction()
  const shown = error ?? notice
  return (
    <View style={[a.pt_lg, a.gap_sm]}>
      {shown ? <FormError error={i18n._(shown)} /> : null}
      <Button
        testID="aoSignatureSignInButton"
        label={_(msg`Sign in with Authority Signature`)}
        color="secondary"
        size="large"
        disabled={busy}
        onPress={() => {
          clearAONotice()
          void run(() => startAOSignature(null))
        }}>
        <ButtonText>
          <Trans>Sign in with Authority Signature</Trans>
        </ButtonText>
        {busy && <ButtonIcon icon={Loader} />}
      </Button>
    </View>
  )
}
