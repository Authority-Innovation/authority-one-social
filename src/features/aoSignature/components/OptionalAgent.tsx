import {useState} from 'react'
import {View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'

import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Text} from '#/components/Typography'
import {type AORecord} from '../store'
import {AOAgentPicker} from './AgentPicker'

/**
 * Community members are person-only (Signature rollout, 2026-11-26): an AO
 * session with no primary agent is NOT sent to the picker. The picker is
 * offered here instead, and the person can close it again. Nothing renders
 * once the session has a primary.
 *
 * Mount with `key={record.sid}` so an open picker never carries over to
 * another session.
 */
export function AOOptionalAgent({record}: {record: AORecord}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const [open, setOpen] = useState(false)

  if (!record.needsAgent) return null

  if (open) {
    return (
      <View style={[a.gap_sm]} testID="aoOptionalAgentPicker">
        <AOAgentPicker token={record.token} sid={record.sid} />
        <Button
          testID="aoOptionalAgentClose"
          label={l`Not now`}
          color="secondary"
          size="large"
          onPress={() => setOpen(false)}>
          <ButtonText>
            <Trans>Not now</Trans>
          </ButtonText>
        </Button>
      </View>
    )
  }

  return (
    <View style={[a.gap_sm]} testID="aoOptionalAgent">
      <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
        <Trans>
          You don't need an agent to take part in your communities. You can
          add one any time.
        </Trans>
      </Text>
      <Button
        testID="aoOptionalAgentOpen"
        label={l`Choose an agent`}
        color="secondary"
        size="large"
        onPress={() => setOpen(true)}>
        <ButtonText>
          <Trans>Choose an agent</Trans>
        </ButtonText>
      </Button>
    </View>
  )
}
