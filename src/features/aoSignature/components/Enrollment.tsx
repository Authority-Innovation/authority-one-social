import {useEffect, useState} from 'react'
import {Linking, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {FormError} from '#/components/forms/FormError'
import * as Toggle from '#/components/forms/Toggle'
import {Loader} from '#/components/Loader'
import {Text} from '#/components/Typography'
import {aoClient} from '../controller'
import {aoSignatureErrorWords} from '../errors'
import {adoptEnrollment} from '../session'
import {type AOEnrollmentAsk} from '../wire'

/**
 * Community's OWN terms (Signature rollout P1, per-app enrollment, Elliott D6:
 * "each has seperate tick box"). Shown after a Signature sign-in until the
 * runtime holds Community's acceptance; nothing else of Community is reachable
 * before. Two SEPARATE boxes (terms, privacy), both unticked; optional consents
 * (marketing) unticked and never required. The versions sent are exactly the
 * ones the runtime showed, so a stale screen can't accept newer terms.
 */
export function AOEnrollment({token, sid}: {token: string; sid: string}) {
  const t = useTheme()
  const {_, i18n} = useLingui()
  const [ask, setAsk] = useState<AOEnrollmentAsk | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [terms, setTerms] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const [consents, setConsents] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    const c = aoClient()
    if (!c) return
    c.enrollment(token).then(
      r => {
        if (!live) return
        if (r.enrolled) void adoptEnrollment(sid)
        else setAsk(r.ask)
      },
      e => live && setError(e),
    )
    return () => {
      live = false
    }
  }, [token, sid, attempt])

  const accept = async () => {
    const c = aoClient()
    if (!c || !ask || !terms || !privacy) return
    setBusy(true)
    setError(null)
    try {
      await c.enroll(token, {ask, consents})
      await adoptEnrollment(sid)
    } catch (e) {
      setError(e)
      // A stale screen (terms changed meanwhile): load the new ask, untick.
      setTerms(false)
      setPrivacy(false)
      setAttempt(n => n + 1)
    } finally {
      setBusy(false)
    }
  }

  if (!ask) {
    return (
      <View style={[a.p_xl, a.gap_md]} testID="aoEnrollmentLoading">
        {error ? (
          <>
            <FormError error={i18n._(aoSignatureErrorWords(error))} />
            <Button
              label={_(msg`Try again`)}
              color="secondary"
              size="large"
              onPress={() => {
                setError(null)
                setAttempt(n => n + 1)
              }}>
              <ButtonText>
                <Trans>Try again</Trans>
              </ButtonText>
            </Button>
          </>
        ) : (
          <Loader size="xl" />
        )}
      </View>
    )
  }

  return (
    <View style={[a.p_xl, a.gap_lg]} testID="aoEnrollment">
      <Text style={[a.text_2xl, a.font_bold]}>
        <Trans>Before you use Community</Trans>
      </Text>
      <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
        <Trans>
          Signing in with Authority Signature tells Community who you are. It
          doesn't accept anything for you: Community asks for its own terms.
        </Trans>
      </Text>
      {error ? (
        <FormError error={i18n._(aoSignatureErrorWords(error))} />
      ) : null}
      <Toggle.Item
        name="terms"
        type="checkbox"
        value={terms}
        onChange={setTerms}
        label={_(msg`I agree to Community's terms of service`)}
        style={[a.gap_sm]}>
        <Toggle.Checkbox />
        <Toggle.LabelText style={[a.flex_1]}>
          <Trans>
            I agree to Community's{' '}
            <Text
              accessibilityRole="link"
              style={[
                t.atoms.text_contrast_high,
                {textDecorationLine: 'underline'},
              ]}
              onPress={() => void Linking.openURL(ask.termsUrl)}>
              terms of service
            </Text>
          </Trans>
        </Toggle.LabelText>
      </Toggle.Item>
      <Toggle.Item
        name="privacy"
        type="checkbox"
        value={privacy}
        onChange={setPrivacy}
        label={_(msg`I agree to Community's privacy policy`)}
        style={[a.gap_sm]}>
        <Toggle.Checkbox />
        <Toggle.LabelText style={[a.flex_1]}>
          <Trans>
            I agree to Community's{' '}
            <Text
              accessibilityRole="link"
              style={[
                t.atoms.text_contrast_high,
                {textDecorationLine: 'underline'},
              ]}
              onPress={() => void Linking.openURL(ask.privacyUrl)}>
              privacy policy
            </Text>
          </Trans>
        </Toggle.LabelText>
      </Toggle.Item>
      {ask.consents.some(c => c.name === 'marketing') ? (
        <Toggle.Item
          name="marketing"
          type="checkbox"
          value={consents.marketing === true}
          onChange={v => setConsents(cs => ({...cs, marketing: v}))}
          label={_(msg`Send me occasional news about Community (optional)`)}
          style={[a.gap_sm]}>
          <Toggle.Checkbox />
          <Toggle.LabelText style={[a.flex_1]}>
            <Trans>Send me occasional news about Community (optional)</Trans>
          </Toggle.LabelText>
        </Toggle.Item>
      ) : null}
      <Button
        testID="aoEnrollmentAccept"
        label={_(msg`Continue`)}
        color="primary"
        size="large"
        disabled={!terms || !privacy || busy}
        onPress={() => void accept()}>
        <ButtonText>
          <Trans>Continue</Trans>
        </ButtonText>
      </Button>
    </View>
  )
}
