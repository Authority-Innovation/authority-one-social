import {useEffect, useState} from 'react'
import {View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {DEFAULT_SERVICE} from '#/lib/constants'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {FormError} from '#/components/forms/FormError'
import * as TextField from '#/components/forms/TextField'
import {Loader} from '#/components/Loader'
import {Text} from '#/components/Typography'
import {aoClient, aoPdsBroker} from '../controller'
import {aoSignatureErrorWords} from '../errors'
import {connectCommunityAccount, needsCommunityConnect} from '../pdsBroker'
import {type AORecord} from '../store'

type Phase =
  | {name: 'checking'}
  | {name: 'ready'}
  | {name: 'connect'}
  | {name: 'failed'; error: unknown}

/**
 * The Community timeline for a Signature-only person: asks the runtime for a
 * short-lived PDS session. An account the runtime holds no credential for gets
 * "Connect your Community account": one full password sign-in, handed to the
 * runtime for that single call and then ended. Nothing typed here is kept.
 */
export function AOConnectCommunity({record}: {record: AORecord}) {
  const t = useTheme()
  const {_, i18n} = useLingui()
  const [phase, setPhase] = useState<Phase>({name: 'checking'})
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    const b = aoPdsBroker()
    if (!b) return
    b.get(record).then(
      () => live && setPhase({name: 'ready'}),
      e => {
        if (!live) return
        setPhase(
          needsCommunityConnect(e)
            ? {name: 'connect'}
            : {name: 'failed', error: e},
        )
      },
    )
    return () => {
      live = false
    }
  }, [record, attempt])

  const connect = async () => {
    const c = aoClient()
    const b = aoPdsBroker()
    if (!c || !b || !identifier || !password) return
    setBusy(true)
    setError(null)
    try {
      await connectCommunityAccount({
        client: c,
        record,
        service: DEFAULT_SERVICE,
        identifier,
        password,
        doFetch: (url, init) => fetch(url, init),
        broker: b,
      })
      setPassword('')
      setPhase({name: 'checking'})
      setAttempt(n => n + 1)
    } catch (e) {
      setPassword('')
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  if (phase.name === 'checking') return <Loader size="lg" />
  if (phase.name === 'ready') {
    return (
      <Text
        style={[a.text_md, t.atoms.text_contrast_medium]}
        testID="aoCommunityReady">
        <Trans>Your Community account is connected.</Trans>
      </Text>
    )
  }
  if (phase.name === 'failed') {
    return (
      <View style={[a.gap_sm]}>
        <FormError error={i18n._(aoSignatureErrorWords(phase.error))} />
        <Button
          label={_(msg`Try again`)}
          color="secondary"
          size="large"
          onPress={() => {
            setPhase({name: 'checking'})
            setAttempt(n => n + 1)
          }}>
          <ButtonText>
            <Trans>Try again</Trans>
          </ButtonText>
        </Button>
      </View>
    )
  }
  return (
    <View style={[a.gap_md]} testID="aoConnectCommunity">
      <Text style={[a.text_lg, a.font_bold]}>
        <Trans>Connect your Community account</Trans>
      </Text>
      <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
        <Trans>
          Sign in once with your handle and account password. Community keeps a
          separate key for your timeline; your password isn't stored.
        </Trans>
      </Text>
      {error ? (
        <FormError error={i18n._(aoSignatureErrorWords(error))} />
      ) : null}
      <TextField.Root>
        <TextField.Input
          testID="aoConnectIdentifier"
          label={_(msg`Handle`)}
          value={identifier}
          onChangeText={setIdentifier}
          editable={!busy}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </TextField.Root>
      <TextField.Root>
        <TextField.Input
          testID="aoConnectPassword"
          label={_(msg`Account password`)}
          value={password}
          onChangeText={setPassword}
          editable={!busy}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
      </TextField.Root>
      <Button
        label={_(msg`Connect`)}
        color="primary"
        size="large"
        disabled={busy || !identifier || !password}
        onPress={() => void connect()}>
        <ButtonText>
          <Trans>Connect</Trans>
        </ButtonText>
      </Button>
    </View>
  )
}
