import {useState} from 'react'
import {ActivityIndicator, View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {type OwnerAgent} from '#/lib/agent-runtime'
import {type NavigationProp} from '#/lib/routes/types'
import {sanitizeHandle} from '#/lib/strings/handles'
import {useOwnerAgentsQuery} from '#/state/queries/agents'
import {
  useGroupOpMutation,
  useThreadMembersQuery,
} from '#/state/queries/threads'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {Text} from '#/components/Typography'

/**
 * CHOOSE an agent to add to a group chat. Lists the owner's own agents (GET /app/agents)
 * and adds the selected one as an ACTIVE participant (group op `add`, memberKind:'agent').
 * Agents are deliberately chosen here — never auto-added — and, once added, show up in the
 * roster (membersView surfaces kind:'agent' with isAgent) and respond in the group.
 *
 * An agent already in the group shows "In chat" instead of an Add button (idempotent at the
 * runtime too). Degrades gracefully: no agents / unreachable → a quiet empty state.
 */
export function AddAgents({threadId}: {threadId: string}) {
  const {t: l} = useLingui()
  const agentsQuery = useOwnerAgentsQuery()
  const membersQuery = useThreadMembersQuery(threadId)
  const op = useGroupOpMutation()

  // Local "added" set so a row flips to "In chat" immediately without waiting for refetch.
  const [added, setAdded] = useState<Record<string, boolean>>({})

  const agents = agentsQuery.data?.agents ?? []
  // Agent handles already in the roster (lowercased) — from the members endpoint.
  const inGroup = new Set(
    (membersQuery.data?.members ?? [])
      .filter(m => m.isAgent || m.kind === 'agent')
      .map(m => (m.handle ?? m.id).toLowerCase()),
  )

  const act = (agent: OwnerAgent) => {
    op.mutate(
      {threadId, op: 'add', memberId: agent.handle, memberKind: 'agent'},
      {onSuccess: () => setAdded(prev => ({...prev, [agent.handle]: true}))},
    )
  }

  if (agentsQuery.isLoading) {
    return (
      <View style={[a.py_md, a.align_center]}>
        <ActivityIndicator />
      </View>
    )
  }

  if (agents.length === 0) {
    return (
      <View style={[a.gap_xs]}>
        <Empty text={l`You don't have any agents to add yet.`} />
        <CreateAgentButton />
      </View>
    )
  }

  return (
    <View style={[a.gap_2xs, a.pt_2xs]}>
      {agents.map(agent => {
        const isIn =
          inGroup.has(agent.handle.toLowerCase()) || added[agent.handle]
        return (
          <AgentRow
            key={agent.handle}
            agent={agent}
            done={!!isIn}
            pending={op.isPending}
            onPress={() => act(agent)}
          />
        )
      })}
      <CreateAgentButton />
    </View>
  )
}

/** Entry point to the new-agent flow. The owner-agents list is refreshed by the create
 *  mutation, so the new agent appears here when the user comes back from that screen. */
function CreateAgentButton() {
  const {t: l} = useLingui()
  const navigation = useNavigation<NavigationProp>()
  return (
    <View style={[a.flex_row, a.pt_xs]}>
      <Button
        label={l`Create a new agent`}
        size="small"
        variant="outline"
        color="secondary"
        onPress={() => navigation.navigate('NewAgent')}>
        <ButtonIcon icon={PlusIcon} />
        <ButtonText>
          <Trans>Create a new agent</Trans>
        </ButtonText>
      </Button>
    </View>
  )
}

function Empty({text}: {text: string}) {
  const t = useTheme()
  return (
    <Text style={[a.text_sm, a.py_xs, t.atoms.text_contrast_low]}>{text}</Text>
  )
}

function AgentRow({
  agent,
  done,
  pending,
  onPress,
}: {
  agent: OwnerAgent
  done: boolean
  pending: boolean
  onPress: () => void
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const title = agent.displayName || agent.handle
  return (
    <View style={[a.flex_row, a.align_center, a.gap_sm, a.py_xs]}>
      <View style={[a.flex_1]}>
        <Text
          emoji
          style={[a.text_md, a.font_bold, t.atoms.text]}
          numberOfLines={1}>
          {title}
        </Text>
        <Text
          style={[a.text_xs, t.atoms.text_contrast_medium]}
          numberOfLines={1}>
          {`${sanitizeHandle(agent.handle, '@')} · ${l`Agent`}`}
        </Text>
      </View>
      {done ? (
        <Text style={[a.text_sm, a.font_bold, {color: t.palette.positive_600}]}>
          <Trans>In chat</Trans>
        </Text>
      ) : (
        <Button
          label={`${l`Add`} ${title}`}
          size="small"
          variant="solid"
          color="secondary"
          disabled={pending}
          onPress={onPress}>
          <ButtonText>
            <Trans>Add</Trans>
          </ButtonText>
        </Button>
      )}
    </View>
  )
}
