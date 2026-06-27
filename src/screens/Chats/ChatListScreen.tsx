import {ActivityIndicator, Pressable, View} from 'react-native'
import {Trans} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {type Thread} from '#/lib/agent-runtime'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {useGroupOpMutation,useThreadsQuery} from '#/state/queries/threads'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {ChevronRight_Stroke2_Corner0_Rounded as ChevronIcon} from '#/components/icons/Chevron'
import {Microphone_Stroke2_Corner0_Rounded as MicIcon} from '#/components/icons/Microphone'
import {PersonGroup_Stroke2_Corner2_Rounded as GroupIcon} from '#/components/icons/Person'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'ChatList'>

/**
 * Chat list — the front door to multi-chat. Always shows the default "Talk to Bob"
 * single chat (back-compat), plus any group threads from the live runtime. Degrades to
 * just Talk-to-Bob when /app/threads is unreachable, signed out, or empty.
 */
export function ChatListScreen({}: Props) {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const {data, isLoading} = useThreadsQuery()

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
        <Layout.Header.Slot>
          <Button
            label="New group"
            size="small"
            variant="solid"
            color="primary"
            onPress={() => navigation.navigate('NewGroup')}>
            <ButtonIcon icon={PlusIcon} />
            <ButtonText>
              <Trans>New</Trans>
            </ButtonText>
          </Button>
        </Layout.Header.Slot>
      </Layout.Header.Outer>

      <Layout.Content>
        <View style={[a.p_lg, a.gap_md]}>
          {/* Default Talk-to-Bob (existing single chat, no threadId). */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Talk to Bob"
            accessibilityHint="Opens your one-on-one chat"
            onPress={() => navigation.navigate('AgentChat', {})}
            style={[
              a.flex_row,
              a.align_center,
              a.gap_md,
              a.rounded_md,
              a.p_md,
              t.atoms.bg_contrast_25,
            ]}>
            <MicIcon size="lg" fill={t.atoms.text.color} />
            <View style={[a.flex_1]}>
              <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
                <Trans>Talk to Bob</Trans>
              </Text>
              <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                <Trans>Your one-on-one agent chat</Trans>
              </Text>
            </View>
            <ChevronIcon size="sm" fill={t.atoms.text_contrast_low.color} />
          </Pressable>

          {isLoading ? (
            <View style={[a.py_lg, a.align_center]}>
              <ActivityIndicator />
            </View>
          ) : null}

          {/* Pending invites — accept / decline. */}
          {pending.length > 0 ? (
            <View style={[a.gap_sm]}>
              <Text style={[a.text_sm, a.font_bold, t.atoms.text_contrast_medium]}>
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
              <Text style={[a.text_sm, a.font_bold, t.atoms.text_contrast_medium]}>
                <Trans>Groups</Trans>
              </Text>
              {joined.map(g => (
                <ThreadRow
                  key={g.id}
                  thread={g}
                  onOpen={() =>
                    navigation.navigate('AgentChat', {
                      threadId: g.id,
                      threadTitle: g.title,
                    })
                  }
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
          <Text style={[a.text_md, a.font_bold, t.atoms.text]} numberOfLines={1}>
            {thread.title}
          </Text>
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
        variant="ghost"
        color="secondary"
        shape="round"
        onPress={onManage}>
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
