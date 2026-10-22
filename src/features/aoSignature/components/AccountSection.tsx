import {View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {FormError} from '#/components/forms/FormError'
import {Loader} from '#/components/Loader'
import {Text} from '#/components/Typography'
import {AO_SIGNATURE_CONFIG} from '../config'
import {startAOSignature} from '../controller'
import {useAOSignatureState, usePdsPort} from '../hooks'
import {AOAccountActions} from './AccountActions'
import {useAOAction} from './useAOAction'

/**
 * Account settings: "Link Authority Signature" for the PDS account signed in
 * now (the owner link ceremony), or — once this account has an AO session —
 * the Signature account actions. Null while dark.
 */
export function AOSignatureAccountSection() {
  if (AO_SIGNATURE_CONFIG === null) return null
  return <ArmedAccountSection />
}

function ArmedAccountSection() {
  const t = useTheme()
  const {_, i18n} = useLingui()
  const {currentAccount} = useSession()
  const {record, notice} = useAOSignatureState()
  const pds = usePdsPort()
  const {run, busy, error} = useAOAction()
  if (!currentAccount) return null
  const linkedHere = record?.did === currentAccount.did
  const shown = error ?? notice

  return (
    <View
      style={[a.px_xl, a.py_md, a.gap_sm]}
      testID="aoSignatureAccountSection">
      <Text style={[a.text_lg, a.font_bold]}>
        <Trans>Authority Signature</Trans>
      </Text>
      {linkedHere ? (
        <AOAccountActions />
      ) : (
        <>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            <Trans>
              Link your Signature identity to this account, then sign in with
              Authority Signature from now on. Your agents stay as they are.
            </Trans>
          </Text>
          {shown ? <FormError error={i18n._(shown)} /> : null}
          <Button
            label={_(msg`Link Authority Signature`)}
            color="secondary"
            size="large"
            disabled={busy}
            onPress={() => void run(() => startAOSignature(pds))}>
            <ButtonText>
              <Trans>Link Authority Signature</Trans>
            </ButtonText>
            {busy && <ButtonIcon icon={Loader} />}
          </Button>
        </>
      )}
    </View>
  )
}
