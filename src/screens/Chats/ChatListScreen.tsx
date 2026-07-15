import {ActivityIndicator, Pressable, View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {type Thread} from '#/lib/agent-runtime'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {useMarkThreadReadMutation} from '#/state/queries/agent-conversations'
import {useOwnerAgentsQuery} from '#/state/queries/agents'
import {useGroupOpMutation, useThreadsQuery} from '#/state/queries/threads'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {ChevronRight_Stroke2_Corner0_Rounded as ChevronIcon} from '#/components/icons/Chevron'
import {PersonGroup_Stroke2_Corner2_Rounded as GroupIcon} from '#/components/icons/Person'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'
import {AgentGrid} from '#/features/agentGrid/AgentGrid'
import {LiveBadge} from '#/features/agentGrid/LiveBadge'
import {useAgentDirectory} from '#/features/agentGrid/useAgentDirectory'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'ChatList'>

/**
 * Chat list — the front door to multi-chat. Leads with the YOUR AGENTS roster
 * (one row per owned agent from GET /app/agents; tap -> that agent's AgentHub),
 * then any group threads from the live runtime. The old static "Talk to Bob" row
 * (and the create-a-group-of-one workaround it steered people toward) is retired;
 * each owned agent now has a real 1:1 entry. Degrades to an empty roster note
 * when the runtime is unreachable.
 */
export function ChatListScreen({}: Props) {
  const t = useTheme()
  const {t: l} = useLingui()
  const navigation = useNavigation<NavigationProp>()
  const {data, isLoading} = useThreadsQuery()
  const markRead = useMarkThreadReadMutation()

  // data === undefined -> unreachable/error (fall back). signedOut handled by the chat.
  const threads = data?.threads ?? []
  // Groups come from the runtime; the agent thread is represented by the synthetic
  // Talk-to-Bob row below (so it always works even if threads are unavailable).
  const groups = threads.filter(th => th.kind === 'group')
  const pending = groups.filter(g => g.membership === 'pending')
  const joined = groups.filter(g => g.membership !== 'pending')

  return (
    <Layout.Screen>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>Chats</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        {/* Text action goes DIRECTLY in Outer (the row), not Header.Slot — Slot is a
            fixed icon-width (33px) box that collapses a text label into a vertical
            stack. This matches the header text-button pattern (e.g. SavedFeeds). */}
        <Button
          label={l`New group`}
          size="small"
          variant="solid"
          color="primary"
          onPress={() => navigation.navigate('NewGroup')}>
          <ButtonIcon icon={PlusIcon} />
          <ButtonText>
            {/* Render the English literal directly — NOT <Trans>. This pill has
                repeatedly regressed to a raw Lingui message-id hash across builds
                (stale compiled catalog / Metro transform cache), and a one-word nav
                label must never garble. A literal can't depend on the catalog, so it
                can't become a hash. "New" stays translatable elsewhere (used in 3
                other components) and the a11y label above is still localized. */}
            New
          </ButtonText>
        </Button>
      </Layout.Header.Outer>

      <Layout.Content>
        <View style={[a.p_lg, a.gap_md]}>
          {/* YOUR AGENTS roster — one row per owned agent, tap -> AgentHub. */}
          <YourAgentsSection />

          {isLoading ? (
            <View style={[a.py_lg, a.align_center]}>
              <ActivityIndicator />
            </View>
          ) : null}

          {/* Pending invites — accept / decline. */}
          {pending.length > 0 ? (
            <View style={[a.gap_sm]}>
              <Text
                style={[a.text_sm, a.font_bold, t.atoms.text_contrast_medium]}>
                <Trans>Invites</Trans>
              </Text>
              {pending.map(g => (
                <InviteRow key={g.id} thread={g} />
              ))}
            </View>
          ) : null}

          {/* Group threads. */}
          {joined.length > 0 ? (
            <View style={[a.gap_sm]}>
              <Text
                style={[a.text_sm, a.font_bold, t.atoms.text_contrast_medium]}>
                <Trans>Groups</Trans>
              </Text>
              {joined.map(g => (
                <ThreadRow
                  key={g.id}
                  thread={g}
                  onOpen={() => {
                    // Opening clears the unread pill (POST /app/threads/:id/read).
                    if (g.unreadCount > 0) {
                      markRead.mutate({id: g.id})
                    }
                    navigation.navigate('AgentChat', {
                      threadId: g.id,
                      threadTitle: g.title,
                    })
                  }}
                  onManage={() =>
                    navigation.navigate('GroupManage', {
                      threadId: g.id,
                      title: g.title,
                    })
                  }
                />
              ))}
            </View>
          ) : !isLoading ? (
            <Text style={[a.text_sm, t.atoms.text_contrast_low, a.pt_xs]}>
              {data === undefined ? (
                <Trans>Groups are unavailable right now.</Trans>
              ) : (
                <Trans>No groups yet. Tap “New” to start one.</Trans>
              )}
            </Text>
          ) : null}
        </View>
      </Layout.Content>
    </Layout.Screen>
  )
}

/**
 * The YOUR AGENTS entry: the headshot grid ("Your agents" + "Chatting with"),
 * avatars enriched from the agents' atproto profiles. Tapping a tile opens that
 * agent's AgentHub (Groups tab first). Degrades to a quiet note when the runtime
 * is unreachable / signed out, and to a create-your-first-agent entry when the
 * roster is genuinely empty.
 */
function YourAgentsSection() {
  const t = useTheme()
  const {t: l} = useLingui()
  const navigation = useNavigation<NavigationProp>()
  const {data, isLoading} = useOwnerAgentsQuery()
  const {isEmpty} = useAgentDirectory()

  const newAgentButton = (
    <Button
      label={l`Create a new agent`}
      size="tiny"
      variant="ghost"
      color="secondary"
      onPress={() => navigation.navigate('NewAgent')}>
      <ButtonIcon icon={PlusIcon} />
      <ButtonText>
        <Trans>New agent</Trans>
      </ButtonText>
    </Button>
  )

  if (isEmpty) {
    return (
      <View style={[a.gap_sm]}>
        <View style={[a.flex_row, a.align_center]}>
          <Text
            style={[
              a.flex_1,
              a.text_sm,
              a.font_bold,
              t.atoms.text_contrast_medium,
            ]}>
            <Trans>Your agents</Trans>
          </Text>
          {newAgentButton}
        </View>
        {isLoading ? (
          <View style={[a.py_md, a.align_center]}>
            <ActivityIndicator />
          </View>
        ) : (
          <Text style={[a.text_sm, t.atoms.text_contrast_low]}>
            {data?.signedOut || data === undefined ? (
              <Trans>Your agents are unavailable right now.</Trans>
            ) : (
              <Trans>No agents yet. Create one to start chatting.</Trans>
            )}
          </Text>
        )}
      </View>
    )
  }

  return (
    <AgentGrid
      tileSize={64}
      ownedAccessory={newAgentButton}
      onPressAgent={entry =>
        navigation.navigate('AgentHub', {agent: entry.handle})
      }
    />
  )
}

function ThreadRow({
  thread,
  onOpen,
  onManage,
}: {
  thread: Thread
  onOpen: () => void
  onManage: () => void
}) {
  const t = useTheme()
  return (
    <View style={[a.flex_row, a.align_center, a.gap_sm]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${thread.title}`}
        accessibilityHint=""
        onPress={onOpen}
        style={[
          a.flex_1,
          a.flex_row,
          a.align_center,
          a.gap_md,
          a.rounded_md,
          a.p_md,
          t.atoms.bg_contrast_25,
        ]}>
        <GroupIcon size="lg" fill={t.atoms.text.color} />
        <View style={[a.flex_1]}>
          <View style={[a.flex_row, a.align_center, a.gap_sm]}>
            <Text
              style={[a.text_md, a.font_bold, t.atoms.text]}
              numberOfLines={1}>
              {thread.title}
            </Text>
            {thread.live === true ? <LiveBadge /> : null}
          </View>
          {thread.lastMessage ? (
            <Text
              style={[a.text_xs, t.atoms.text_contrast_medium]}
              numberOfLines={1}>
              {thread.lastMessage}
            </Text>
          ) : null}
        </View>
        {thread.unreadCount > 0 ? (
          <View
            style={[
              a.rounded_full,
              a.px_sm,
              {paddingVertical: 2, backgroundColor: t.palette.primary_500},
            ]}>
            <Text style={[a.text_xs, a.font_bold, {color: t.palette.white}]}>
              {thread.unreadCount > 99 ? '99+' : `${thread.unreadCount}`}
            </Text>
          </View>
        ) : null}
      </Pressable>
      <Button
        label={`Manage ${thread.title}`}
        size="small"
        variant="solid"
        color="secondary"
        onPress={onManage}>
        <ButtonText>
          <Trans>Manage</Trans>
        </ButtonText>
        <ButtonIcon icon={ChevronIcon} />
      </Button>
    </View>
  )
}

function InviteRow({thread}: {thread: Thread}) {
  const t = useTheme()
  const op = useGroupOpMutation()
  return (
    <View
      style={[
        a.flex_row,
        a.align_center,
        a.gap_sm,
        a.rounded_md,
        a.p_md,
        {backgroundColor: t.palette.primary_50},
      ]}>
      <View style={[a.flex_1]}>
        <Text style={[a.text_md, a.font_bold, t.atoms.text]} numberOfLines={1}>
          {thread.title}
        </Text>
        <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
          <Trans>Invited you to join</Trans>
        </Text>
      </View>
      <Button
        label="Accept invite"
        size="small"
        variant="solid"
        color="primary"
        disabled={op.isPending}
        onPress={() => op.mutate({threadId: thread.id, op: 'accept'})}>
        <ButtonText>
          <Trans>Accept</Trans>
        </ButtonText>
      </Button>
      <Button
        label="Decline invite"
        size="small"
        variant="ghost"
        color="secondary"
        disabled={op.isPending}
        onPress={() => op.mutate({threadId: thread.id, op: 'decline'})}>
        <ButtonText>
          <Trans>Decline</Trans>
        </ButtonText>
      </Button>
    </View>
  )
}
