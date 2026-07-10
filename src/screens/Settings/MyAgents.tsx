import {ActivityIndicator, Pressable, View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {type OwnerAgent} from '#/lib/agent-runtime'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {sanitizeHandle} from '#/lib/strings/handles'
import {
  useOwnerAgentsQuery,
  usePauseOwnerAgentMutation,
} from '#/state/queries/agents'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {Pause_Stroke2_Corner0_Rounded as PauseIcon} from '#/components/icons/Pause'
import {Play_Stroke2_Corner0_Rounded as PlayIcon} from '#/components/icons/Play'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import * as Layout from '#/components/Layout'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'MyAgents'>

/**
 * ALL the agents this owner runs (GET /app/agents, enriched rows): display name,
 * SMS line, live/paused state, and a pause toggle. Tapping a row opens the persona
 * editor SCOPED to that agent (PersonaSettings with the agent's FULL handle).
 */
export function MyAgentsScreen({}: Props) {
  const {t: l} = useLingui()
  const {data, isLoading} = useOwnerAgentsQuery()
  const pause = usePauseOwnerAgentMutation()
  const navigation = useNavigation<NavigationProp>()

  const agents = data?.agents ?? []

  const onToggle = (agent: OwnerAgent) => {
    const nextPaused = agent.paused !== true
    pause.mutate(
      {agent: agent.handle, paused: nextPaused},
      {
        onSuccess: res => {
          if (res.ok) return
          Toast.show(
            res.code === 'not-your-agent'
              ? l`That agent isn’t linked to your account.`
              : (res.error ?? l`Could not update the agent.`),
            {type: 'error'},
          )
        },
      },
    )
  }

  return (
    <Layout.Screen>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>My Agents</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>

      <Layout.Content>
        <SettingsList.Container>
          {isLoading ? (
            <View style={[a.py_2xl, a.align_center]}>
              <ActivityIndicator />
            </View>
          ) : data?.signedOut ? (
            <Notice
              title={l`Sign in to manage your agents`}
              body={l`Your agents appear here once you're signed in and the agent runtime is reachable.`}
            />
          ) : agents.length === 0 ? (
            <Notice
              title={l`No agents yet`}
              body={l`Create an agent to give it a persona, a phone number, and a life of its own.`}
            />
          ) : (
            agents.map(agent => (
              <AgentRow
                key={agent.handle}
                agent={agent}
                toggling={pause.isPending}
                onOpen={() =>
                  navigation.navigate('PersonaSettings', {agent: agent.handle})
                }
                onToggle={() => onToggle(agent)}
              />
            ))
          )}

          <SettingsList.Divider />
          <View style={[a.px_lg, a.py_sm]}>
            <Button
              label={l`View usage`}
              size="large"
              variant="outline"
              color="secondary"
              onPress={() => navigation.navigate('AgentUsage')}>
              <ButtonText>
                <Trans>Usage</Trans>
              </ButtonText>
            </Button>
          </View>
          <View style={[a.px_lg, a.py_sm]}>
            <Button
              label={l`Plan and billing`}
              size="large"
              variant="outline"
              color="secondary"
              onPress={() => navigation.navigate('AgentBilling')}>
              <ButtonText>
                <Trans>Plan & Billing</Trans>
              </ButtonText>
            </Button>
          </View>
          <View style={[a.px_lg, a.py_sm]}>
            <Button
              label={l`Create a new agent`}
              size="large"
              variant="solid"
              color="primary"
              onPress={() => navigation.navigate('NewAgent')}>
              <ButtonIcon icon={PlusIcon} />
              <ButtonText>
                <Trans>Create a new agent</Trans>
              </ButtonText>
            </Button>
          </View>
        </SettingsList.Container>
      </Layout.Content>
    </Layout.Screen>
  )
}

function AgentRow({
  agent,
  toggling,
  onOpen,
  onToggle,
}: {
  agent: OwnerAgent
  toggling: boolean
  onOpen: () => void
  onToggle: () => void
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const title = agent.displayName || agent.handle
  const paused = agent.paused === true
  return (
    <SettingsList.Item>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={l`Manage ${title}`}
        accessibilityHint={l`Opens this agent's persona settings`}
        onPress={onOpen}
        style={[a.flex_1, a.gap_2xs]}>
        <View style={[a.flex_row, a.align_center, a.gap_sm]}>
          <Text
            emoji
            style={[a.text_md, a.font_bold, t.atoms.text]}
            numberOfLines={1}>
            {title}
          </Text>
          <StatusBadge agent={agent} />
        </View>
        <Text
          style={[a.text_xs, t.atoms.text_contrast_medium]}
          numberOfLines={1}>
          {sanitizeHandle(agent.handle, '@')}
        </Text>
        {agent.number ? (
          <Text
            style={[a.text_xs, t.atoms.text_contrast_medium]}
            numberOfLines={1}>
            {agent.number}
          </Text>
        ) : null}
      </Pressable>

      <Button
        label={paused ? l`Resume ${title}` : l`Pause ${title}`}
        size="small"
        variant="solid"
        color="secondary"
        disabled={toggling}
        onPress={onToggle}>
        <ButtonIcon icon={paused ? PlayIcon : PauseIcon} />
        <ButtonText>
          {paused ? <Trans>Resume</Trans> : <Trans>Pause</Trans>}
        </ButtonText>
      </Button>
      <SettingsList.Chevron />
    </SettingsList.Item>
  )
}

/** Live (green) / Paused (muted) pill. Nothing when the runtime row isn't enriched. */
function StatusBadge({agent}: {agent: OwnerAgent}) {
  const t = useTheme()
  if (agent.paused === true) {
    return (
      <View
        style={[
          a.rounded_full,
          a.px_sm,
          {paddingVertical: 2, backgroundColor: t.palette.contrast_100},
        ]}>
        <Text style={[a.text_xs, a.font_bold, {color: t.palette.contrast_600}]}>
          <Trans>Paused</Trans>
        </Text>
      </View>
    )
  }
  if (agent.live === true) {
    return (
      <View
        style={[
          a.rounded_full,
          a.px_sm,
          {paddingVertical: 2, backgroundColor: t.palette.positive_50},
        ]}>
        <Text style={[a.text_xs, a.font_bold, {color: t.palette.positive_700}]}>
          <Trans>Live</Trans>
        </Text>
      </View>
    )
  }
  return null
}

function Notice({title, body}: {title: string; body: string}) {
  const t = useTheme()
  return (
    <View style={[a.px_lg, a.py_2xl, a.gap_sm]}>
      <Text style={[a.text_md, a.font_bold, t.atoms.text]}>{title}</Text>
      <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>{body}</Text>
    </View>
  )
}
