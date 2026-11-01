/**
 * The owner's consent sheet, before any media (design r2 §6 step 3, §4.3).
 * One switch per kind the runtime asks about, all off until the owner turns
 * them on; "don't record" is a valid answer. Going live needs AI processing,
 * because without it the agent can't hear or see the owner at all.
 */
import {useState} from 'react'
import {ScrollView, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {Trans, useLingui} from '@lingui/react/macro'

import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Toggle from '#/components/forms/Toggle'
import {Text} from '#/components/Typography'
import {
  canGoLive,
  type ConsentChoices,
  initialChoices,
} from '#/features/agentLive/consent'

export function ConsentSheet({
  required,
  recordPolicy,
  busy = false,
  onSubmit,
  onCancel,
}: {
  required: string[]
  recordPolicy: string
  busy?: boolean
  onSubmit: (choices: ConsentChoices) => void
  onCancel: () => void
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const insets = useSafeAreaInsets()
  const [choices, setChoices] = useState<ConsentChoices>(() =>
    initialChoices(required),
  )
  const ready = canGoLive(required, choices)

  const words = (kind: string): {title: string; detail: string} => {
    switch (kind) {
      case 'ai_process':
        return {
          title: l`Let your agent hear and see you`,
          detail: l`Needed to go live. Your agent processes your voice and anything you show it, only during this session.`,
        }
      case 'record_audio':
        return {
          title: l`Record my voice`,
          detail: l`Keep a recording of what you say in this session.`,
        }
      case 'record_video':
        return {
          title: l`Record my video`,
          detail: l`Keep a recording of your camera if you turn it on.`,
        }
      case 'transcribe':
        return {
          title: l`Transcribe what I say`,
          detail: l`Keep a written transcript of your words.`,
        }
      case 'remember':
        return {
          title: l`Let my agent remember this session`,
          detail: l`Your agent may keep what it learns here for later.`,
        }
      default:
        // A kind this build has no words for: the owner still decides it.
        return {title: kind, detail: l`Another use of this session.`}
    }
  }

  return (
    <View testID="agentLiveConsentSheet" style={[a.flex_1, t.atoms.bg]}>
      <ScrollView
        contentContainerStyle={[
          a.px_lg,
          a.gap_lg,
          // Below the status bar (it overlapped the title on the simulator).
          {paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16},
        ]}>
        <View style={[a.gap_sm]}>
          <Text style={[a.text_xl, a.font_bold, t.atoms.text]}>
            <Trans>Before you go live</Trans>
          </Text>
          <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
            <Trans>
              Choose what this session may do. Nothing is shared until you go
              live, and anything you leave off is not allowed.
            </Trans>
          </Text>
          {recordPolicy !== 'off' ? (
            <Text
              testID="agentLiveConsentRecordingNote"
              style={[a.text_sm, a.font_bold, t.atoms.text]}>
              <Trans>
                This session is recorded for each person who allows it.
              </Trans>
            </Text>
          ) : null}
        </View>

        {required.map(kind => {
          const {title, detail} = words(kind)
          return (
            <Toggle.Item
              key={kind}
              name={kind}
              label={title}
              value={choices[kind] === true}
              disabled={busy}
              onChange={on => setChoices(c => ({...c, [kind]: on}))}
              style={[a.w_full, a.flex_row, a.align_center, a.gap_md]}>
              <View style={[a.flex_1, a.gap_2xs]}>
                <Toggle.LabelText style={[a.text_md, a.font_bold]}>
                  {title}
                </Toggle.LabelText>
                <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                  {detail}
                </Text>
              </View>
              <Toggle.Platform />
            </Toggle.Item>
          )
        })}

        {!ready ? (
          <Text
            testID="agentLiveConsentNeedsAi"
            style={[a.text_sm, t.atoms.text_contrast_medium]}>
            <Trans>
              To go live, turn on “Let your agent hear and see you”.
            </Trans>
          </Text>
        ) : null}

        <View style={[a.gap_sm]}>
          <Button
            testID="agentLiveConsentSubmit"
            label={l`Go live`}
            color="primary"
            size="large"
            disabled={!ready || busy}
            onPress={() => onSubmit(choices)}>
            <ButtonText>
              {l({message: 'Go live', context: 'Button'})}
            </ButtonText>
          </Button>
          <Button
            testID="agentLiveConsentCancel"
            label={l`Cancel and end the session`}
            color="secondary"
            size="large"
            disabled={busy}
            onPress={onCancel}>
            <ButtonText>
              <Trans>Cancel</Trans>
            </ButtonText>
          </Button>
        </View>
      </ScrollView>
    </View>
  )
}
