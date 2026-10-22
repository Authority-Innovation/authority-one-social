import {useEffect, useState} from 'react'
import {View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {FormError} from '#/components/forms/FormError'
import * as TextField from '#/components/forms/TextField'
import {Loader} from '#/components/Loader'
import {Text} from '#/components/Typography'
import {aoClient} from '../controller'
import {aoPickerErrorWords} from '../errors'
import {adoptPrimary} from '../session'
import {usePickerMachine} from './usePickerMachine'

/**
 * First-run agent picker: "Create my agent" or "Use an agent you've been
 * given" (an agent an operator attached to this person — the Steve case).
 * Shown until the runtime has a primary for this person.
 */
export function AOAgentPicker({token, sid}: {token: string; sid: string}) {
  const t = useTheme()
  const {_, i18n} = useLingui()
  const [state, dispatch] = usePickerMachine(token, aoClient())
  const [name, setName] = useState('')

  useEffect(() => {
    if (state.phase.name === 'done') void adoptPrimary(sid, state.phase.primary)
  }, [state.phase, sid])

  const phase = state.phase
  const busy = phase.name === 'creating' || phase.name === 'selecting'

  if (phase.name === 'loading' || phase.name === 'done') {
    return (
      <View style={[a.flex_1, a.align_center, a.justify_center, a.p_xl]}>
        <Loader size="xl" />
      </View>
    )
  }

  if (phase.name === 'failed') {
    return (
      <View style={[a.p_xl, a.gap_md]}>
        <FormError error={i18n._(aoPickerErrorWords(phase.error))} />
        <Button
          label={_(msg`Try again`)}
          color="secondary"
          size="large"
          onPress={() => dispatch({type: 'retry'})}>
          <ButtonText>
            <Trans>Try again</Trans>
          </ButtonText>
        </Button>
      </View>
    )
  }

  return (
    <View style={[a.p_xl, a.gap_lg]} testID="aoAgentPicker">
      <Text style={[a.text_2xl, a.font_bold]}>
        <Trans>Choose your agent</Trans>
      </Text>
      {state.note ? (
        <FormError error={i18n._(aoPickerErrorWords(state.note))} />
      ) : null}

      {state.agents.length > 0 ? (
        <View style={[a.gap_sm]}>
          <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
            <Trans>Use an agent you've been given</Trans>
          </Text>
          {state.agents.map(agent => (
            <Button
              key={agent.handle}
              label={_(msg`Use ${agent.displayName ?? agent.handle}`)}
              color="secondary"
              size="large"
              disabled={busy}
              onPress={() => dispatch({type: 'select', handle: agent.handle})}>
              <ButtonText>{agent.displayName ?? agent.handle}</ButtonText>
              {phase.name === 'selecting' && phase.handle === agent.handle && (
                <ButtonIcon icon={Loader} />
              )}
            </Button>
          ))}
        </View>
      ) : null}

      <View style={[a.gap_sm]}>
        <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
          <Trans>Create my agent</Trans>
        </Text>
        <TextField.Root>
          <TextField.Input
            testID="aoAgentPickerName"
            label={_(msg`Agent name`)}
            value={name}
            onChangeText={setName}
            editable={!busy}
            autoCapitalize="words"
          />
        </TextField.Root>
        <Button
          label={_(msg`Create my agent`)}
          color="primary"
          size="large"
          disabled={busy || !name.trim()}
          onPress={() => dispatch({type: 'create', name})}>
          <ButtonText>
            <Trans>Create my agent</Trans>
          </ButtonText>
          {phase.name === 'creating' && <ButtonIcon icon={Loader} />}
        </Button>
      </View>
    </View>
  )
}
