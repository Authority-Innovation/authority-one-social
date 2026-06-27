import {ActivityIndicator, View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {type ThreadMember} from '#/lib/agent-runtime'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {
  useGroupOpMutation,
  useThreadMembersQuery,
} from '#/state/queries/threads'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {PersonGroup_Stroke2_Corner2_Rounded as GroupIcon} from '#/components/icons/Person'
import * as Layout from '#/components/Layout'
import * as Prompt from '#/components/Prompt'
import {Text} from '#/components/Typography'
import {AddPeople} from './AddPeople'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'GroupManage'>

/**
 * Manage a group: see who's in it (roster), add more people (friends -> add, others ->
 * invite, personas -> add), and leave. Member-level remove/admin ops are available via
 * the group client once a member-list endpoint surfaces them; roster + add + leave are
 * the v1 surface here.
 */
export function GroupManageScreen({route}: Props) {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const {threadId, title} = route.params
  const op = useGroupOpMutation()
  const leavePrompt = Prompt.usePromptControl()
  const membersQuery = useThreadMembersQuery(threadId)
  const members = membersQuery.data ?? []

  return (
    <Layout.Screen>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>{title}</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>

      <Layout.Content>
        <View style={[a.p_lg, a.gap_lg]}>
          {/* Roster — who's in this group. */}
          <View style={[a.gap_xs]}>
            <View style={[a.flex_row, a.align_center, a.gap_sm]}>
              <GroupIcon size="sm" fill={t.atoms.text_contrast_medium.color} />
              <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
                <Trans>In this group</Trans>
              </Text>
            </View>
            {membersQuery.isLoading ? (
              <View style={[a.py_md, a.align_center]}>
                <ActivityIndicator />
              </View>
            ) : members.length > 0 ? (
              <View style={[a.gap_2xs, a.pt_2xs]}>
                {members.map(m => (
                  <MemberRow key={`${m.kind}:${m.id}`} member={m} />
                ))}
              </View>
            ) : (
              <Text style={[a.text_sm, a.py_xs, t.atoms.text_contrast_low]}>
                <Trans>We can't show who's in this group yet.</Trans>
              </Text>
            )}
          </View>

          {/* Add people. */}
          <View
            style={[
              a.gap_md,
              a.pt_lg,
              a.border_t,
              t.atoms.border_contrast_low,
            ]}>
            <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
              <Trans>Add people</Trans>
            </Text>
            <AddPeople threadId={threadId} />
          </View>

          <View style={[a.pt_lg, a.border_t, t.atoms.border_contrast_low]}>
            <Button
              label="Leave group"
              size="large"
              variant="solid"
              color="negative"
              disabled={op.isPending}
              onPress={() => leavePrompt.open()}>
              <ButtonText>
                <Trans>Leave group</Trans>
              </ButtonText>
            </Button>
          </View>
        </View>
      </Layout.Content>

      <Prompt.Basic
        control={leavePrompt}
        title="Leave this group?"
        description="You’ll stop receiving its messages. You can be re-invited later."
        confirmButtonCta="Leave"
        confirmButtonColor="negative"
        onConfirm={() => {
          op.mutate(
            {threadId, op: 'leave'},
            {onSuccess: () => navigation.navigate('ChatList')},
          )
        }}
      />
    </Layout.Screen>
  )
}

function MemberRow({member}: {member: ThreadMember}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const isPerson = member.kind === 'person'
  const title = member.name
    ? sanitizeDisplayName(member.name)
    : member.handle
      ? sanitizeHandle(member.handle, '@')
      : member.id
  const subtitle = isPerson
    ? member.handle
      ? sanitizeHandle(member.handle, '@')
      : undefined
    : l`Agent persona`
  const roleLabel =
    member.role === 'owner'
      ? l`Owner`
      : member.role === 'admin'
        ? l`Admin`
        : member.role === 'pending'
          ? l`Invited`
          : undefined

  return (
    <View style={[a.flex_row, a.align_center, a.gap_sm, a.py_xs]}>
      <View style={[a.flex_1]}>
        <Text
          emoji
          style={[a.text_md, a.font_bold, t.atoms.text]}
          numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[a.text_xs, t.atoms.text_contrast_medium]}
            numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {roleLabel ? (
        <Text style={[a.text_xs, a.font_bold, t.atoms.text_contrast_medium]}>
          {roleLabel}
        </Text>
      ) : null}
    </View>
  )
}
