import {useState} from 'react'
import {View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {type CreatedAgent} from '#/lib/agent-runtime'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {sanitizeHandle} from '#/lib/strings/handles'
import {useCreateOwnerAgentMutation} from '#/state/queries/agents'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as TextField from '#/components/forms/TextField'
import * as Toggle from '#/components/forms/Toggle'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'NewAgent'>

/**
 * Create a new agent under the logged-in owner (POST /app/agents on the runtime; the
 * owner DID is resolved server-side from the session). Optionally provisions a dedicated
 * phone number in the same call. On success we stay on-screen to show the new handle and
 * number, then Done returns to wherever the user came from (usually the "Add an agent"
 * picker, whose owner-agents list has already been refreshed by the mutation).
 */
export function NewAgentScreen({}: Props) {
  const t = useTheme()
  const {t: l} = useLingui()
  const navigation = useNavigation<NavigationProp>()
  const create = useCreateOwnerAgentMutation()

  const [name, setName] = useState('')
  const [wantsNumber, setWantsNumber] = useState(false)
  const [areaCode, setAreaCode] = useState('')
  const [created, setCreated] = useState<CreatedAgent | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onCreate = () => {
    const targetHandle = name.trim().toLowerCase()
    if (!targetHandle || create.isPending) return
    setError(null)
    create.mutate(
      {
        targetHandle,
        provisionNumber: wantsNumber,
        areaCode: wantsNumber ? areaCode.trim() || undefined : undefined,
      },
      {
        onSuccess: res => {
          if (res.ok && res.data) {
            setCreated(res.data)
          } else if (res.errorKind === 'limit') {
            setError(
              'You have reached your plan’s agent limit. Upgrade to add more agents.',
            )
          } else if (res.errorKind === 'did-required') {
            setError(
              'Your session is missing its network identity. Sign in with your One account and try again.',
            )
          } else if (res.signedOut || res.errorKind === 'auth') {
            setError('Sign in to create an agent.')
          } else {
            setError(res.error ?? 'Could not create the agent.')
          }
        },
        onError: () => setError('Could not create the agent.'),
      },
    )
  }

  return (
    <Layout.Screen>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>New agent</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        {/* Text action goes directly in Outer, not the fixed icon-width Header.Slot
            (which collapses a text label into a vertical letter stack). */}
        {created ? (
          <Button
            label="Done"
            size="small"
            variant="solid"
            color="primary"
            onPress={() => navigation.goBack()}>
            <ButtonText>
              <Trans>Done</Trans>
            </ButtonText>
          </Button>
        ) : null}
      </Layout.Header.Outer>

      <Layout.Content>
        <View style={[a.p_lg, a.gap_lg]}>
          {!created ? (
            <>
              <View style={[a.gap_xs]}>
                <TextField.LabelText>
                  <Trans>Agent name</Trans>
                </TextField.LabelText>
                <TextField.Root>
                  <TextField.Input
                    label="Agent name"
                    placeholder="e.g. ada"
                    defaultValue={name}
                    onChangeText={setName}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </TextField.Root>
                <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                  <Trans>
                    A short name becomes the agent’s full handle automatically.
                  </Trans>
                </Text>
              </View>

              <Toggle.Item
                name="provision_number"
                value={wantsNumber}
                onChange={setWantsNumber}
                label={l`Give this agent its own phone number`}
                style={[
                  a.w_full,
                  a.p_md,
                  a.rounded_lg,
                  a.border,
                  t.atoms.border_contrast_low,
                  t.atoms.bg_contrast_50,
                ]}>
                <Toggle.LabelText style={[a.flex_1, a.text_md, a.font_medium]}>
                  <Trans>Give this agent its own phone number</Trans>
                </Toggle.LabelText>
                <Toggle.Platform />
              </Toggle.Item>

              {wantsNumber ? (
                <View style={[a.gap_xs]}>
                  <TextField.LabelText>
                    <Trans>Preferred area code (optional)</Trans>
                  </TextField.LabelText>
                  <TextField.Root>
                    <TextField.Input
                      label="Preferred area code"
                      placeholder="e.g. 415"
                      defaultValue={areaCode}
                      onChangeText={setAreaCode}
                      keyboardType="number-pad"
                      maxLength={3}
                    />
                  </TextField.Root>
                </View>
              ) : null}

              {error ? (
                <Text style={[a.text_sm, {color: t.palette.negative_500}]}>
                  {error}
                </Text>
              ) : null}

              <Button
                label="Create agent"
                size="large"
                variant="solid"
                color="primary"
                disabled={!name.trim() || create.isPending}
                onPress={onCreate}>
                <ButtonText>
                  {create.isPending ? (
                    <Trans>Creating…</Trans>
                  ) : (
                    <Trans>Create agent</Trans>
                  )}
                </ButtonText>
              </Button>
            </>
          ) : (
            <>
              <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
                <Trans>Your new agent is ready</Trans>
              </Text>
              <View
                style={[
                  a.gap_xs,
                  a.p_md,
                  a.rounded_lg,
                  a.border,
                  t.atoms.border_contrast_low,
                  t.atoms.bg_contrast_25,
                ]}>
                <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
                  {sanitizeHandle(created.handle, '@')}
                </Text>
                {created.number ? (
                  <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                    <Trans>Phone number:</Trans> {created.number}
                  </Text>
                ) : null}
              </View>
              {!created.number && wantsNumber ? (
                <Text style={[a.text_sm, {color: t.palette.negative_500}]}>
                  {/* The number step failed but the agent itself exists. The status
                      code is composed OUTSIDE <Trans> (see NewGroupScreen) so a
                      missing catalog entry can't render the placeholder literally. */}
                  <Trans>
                    The agent was created, but its phone number could not be set
                    up.
                  </Trans>
                  {created.numberStatus ? ` (${created.numberStatus})` : ''}{' '}
                  <Trans>You can try adding a number later.</Trans>
                </Text>
              ) : null}
              <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                <Trans>
                  You can now add this agent to your group chats from the “Add
                  an agent” picker.
                </Trans>
              </Text>
            </>
          )}
        </View>
      </Layout.Content>
    </Layout.Screen>
  )
}
