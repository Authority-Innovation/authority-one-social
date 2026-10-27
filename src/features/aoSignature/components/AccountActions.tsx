import {View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {FormError} from '#/components/forms/FormError'
import * as Prompt from '#/components/Prompt'
import {Text} from '#/components/Typography'
import {aoClient, startAOSignature} from '../controller'
import {useAOSignatureState} from '../hooks'
import {signOutAO, signOutEverywhereAO, unlinkAO} from '../session'
import {useAOAction} from './useAOAction'

/**
 * Signed in with Authority Signature: who, and the account actions — sign out
 * (this device), sign out everywhere, unlink — plus "Continue with Authority
 * Signature" when the runtime asked for a fresh Janus sign-in.
 */
export function AOAccountActions() {
  const t = useTheme()
  const {_, i18n} = useLingui()
  const {record} = useAOSignatureState()
  const {run, busy, error} = useAOAction()
  const unlinkPrompt = Prompt.usePromptControl()
  const everywherePrompt = Prompt.usePromptControl()
  if (!record) return null
  const client = aoClient()
  // The runtime asked for a fresh Janus sign-in (the token still works until
  // its exp; it just can't slide any more).
  const reverify = record.reverify

  return (
    <View style={[a.gap_sm]}>
      <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
        <Trans>Signed in with Authority Signature</Trans>
        {record.handle ? ` · @${record.handle}` : ''}
      </Text>
      {record.primary ? (
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          <Trans>Your agent: {record.primary}</Trans>
        </Text>
      ) : null}
      {error ? <FormError error={i18n._(error)} /> : null}
      {reverify ? (
        <Button
          label={_(msg`Continue with Authority Signature`)}
          color="primary"
          size="large"
          disabled={busy}
          onPress={() => void run(() => startAOSignature(null))}>
          <ButtonText>
            <Trans>Continue with Authority Signature</Trans>
          </ButtonText>
        </Button>
      ) : null}
      <Button
        label={_(msg`Sign out of Authority Signature`)}
        color="secondary"
        size="large"
        disabled={busy || !client}
        onPress={() =>
          void run(async () => {
            if (client) await signOutAO(client)
          })
        }>
        <ButtonText>
          <Trans>Sign out of Authority Signature</Trans>
        </ButtonText>
      </Button>
      <Button
        label={_(msg`Sign out everywhere`)}
        color="secondary"
        size="large"
        disabled={busy || !client}
        onPress={() => everywherePrompt.open()}>
        <ButtonText>
          <Trans>Sign out everywhere</Trans>
        </ButtonText>
      </Button>
      <Button
        label={_(msg`Unlink Authority Signature`)}
        color="negative_subtle"
        size="large"
        disabled={busy || !client}
        onPress={() => unlinkPrompt.open()}>
        <ButtonText>
          <Trans>Unlink Authority Signature</Trans>
        </ButtonText>
      </Button>

      <Prompt.Basic
        control={everywherePrompt}
        title={_(msg`Sign out everywhere?`)}
        description={_(
          msg`Every device signed in with Authority Signature is signed out at once.`,
        )}
        confirmButtonCta={_(msg`Sign out everywhere`)}
        onConfirm={() =>
          void run(async () => {
            if (client) await signOutEverywhereAO(client)
          })
        }
        confirmButtonColor="negative"
      />
      <Prompt.Basic
        control={unlinkPrompt}
        title={_(msg`Unlink Authority Signature?`)}
        description={_(
          msg`This Signature identity will no longer sign you in to this account, and every Signature session ends. Linking it again needs support.`,
        )}
        confirmButtonCta={_(msg`Unlink`)}
        onConfirm={() =>
          void run(async () => {
            if (client) await unlinkAO(client)
          })
        }
        confirmButtonColor="negative"
      />
    </View>
  )
}
