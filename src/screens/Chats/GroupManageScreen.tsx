import {useState} from 'react'
import {ActivityIndicator, View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {isCreatorIdentity, type ThreadMember} from '#/lib/agent-runtime'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {
  useDeleteThreadMutation,
  useGroupOpMutation,
  useRemoveThreadMemberMutation,
  useRenameThreadMutation,
  useThreadMembersQuery,
} from '#/state/queries/threads'
import {useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as TextField from '#/components/forms/TextField'
import {PersonGroup_Stroke2_Corner2_Rounded as GroupIcon} from '#/components/icons/Person'
import * as Layout from '#/components/Layout'
import * as Prompt from '#/components/Prompt'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {AddPeople} from './AddPeople'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'GroupManage'>

/**
 * Manage a group: see the roster, add people, and (for the CREATOR only) rename the
 * group, remove members, and delete the group. The creator is identified by the roster's
 * `creatorDid`; a non-creator sees only Leave. Admin actions stay hidden until the roster
 * endpoint returns a creatorDid (so the screen degrades gracefully before it's deployed).
 */
export function GroupManageScreen({route}: Props) {
  const t = useTheme()
  const {t: l} = useLingui()
  const navigation = useNavigation<NavigationProp>()
  const {currentAccount} = useSession()
  const {threadId, title} = route.params
  const op = useGroupOpMutation()
  const rename = useRenameThreadMutation()
  const removeMember = useRemoveThreadMemberMutation()
  const del = useDeleteThreadMutation()
  const leavePrompt = Prompt.usePromptControl()
  const deletePrompt = Prompt.usePromptControl()

  const membersQuery = useThreadMembersQuery(threadId)
  const roster = membersQuery.data ?? {members: []}
  const members = roster.members
  // The runtime returns creatorDid as a DID *or* a handle (actor identity is resolved
  // handle > did > sub), so match the current user against BOTH their did and handle —
  // otherwise a creator stored by handle never matches their did:plc and loses admin.
  const isCreator = isCreatorIdentity(roster.creatorDid, {
    did: currentAccount?.did,
    handle: currentAccount?.handle,
  })

  // Locally-shown group name (header + rename field); updated on a successful rename so
  // the screen reflects it immediately without waiting for the list to refetch.
  const [name, setName] = useState(title ?? '')
  const [draftName, setDraftName] = useState(title ?? '')
  const trimmedName = draftName.trim()
  const canRename =
    trimmedName.length > 0 && trimmedName !== name && !rename.isPending

  const onRename = () => {
    if (!canRename) return
    rename.mutate(
      {threadId, name: trimmedName},
      {
        onSuccess: () => {
          setName(trimmedName)
          Toast.show(l`Group renamed.`, {type: 'success'})
        },
        onError: () =>
          Toast.show(l`Could not rename the group.`, {type: 'error'}),
      },
    )
  }

  const onRemove = (member: ThreadMember) => {
    removeMember.mutate(
      {threadId, did: member.id},
      {
        onError: () =>
          Toast.show(l`Could not remove the member.`, {type: 'error'}),
      },
    )
  }

  return (
    <Layout.Screen>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>{name}</Layout.Header.TitleText>
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
                {members.map(m => {
                  // The creator can remove any member but themselves — including stuck
                  // NON-person rows (legacy persona members: @default / @p_<uuid> added
                  // before personas were barred from the roster), so they can be cleaned
                  // up from the UI. The creator row may be identified by did OR handle, so
                  // match on both.
                  const memberIsCreator = isCreatorIdentity(roster.creatorDid, {
                    did: m.id,
                    handle: m.handle,
                  })
                  // Is this row the current user? Match my did OR handle against the
                  // member's did OR handle, so we can render "You" instead of a raw DID.
                  const isSelf =
                    isCreatorIdentity(currentAccount?.did, {
                      did: m.id,
                      handle: m.handle,
                    }) ||
                    isCreatorIdentity(currentAccount?.handle, {
                      did: m.id,
                      handle: m.handle,
                    })
                  return (
                    <MemberRow
                      key={`${m.kind}:${m.id}`}
                      member={m}
                      isSelf={isSelf}
                      onRemove={
                        isCreator && !memberIsCreator
                          ? () => onRemove(m)
                          : undefined
                      }
                      removing={removeMember.isPending}
                    />
                  )
                })}
              </View>
            ) : (
              <Text style={[a.text_sm, a.py_xs, t.atoms.text_contrast_low]}>
                <Trans>We can't show who's in this group yet.</Trans>
              </Text>
            )}
          </View>

          {/* Creator-only: rename the group. */}
          {isCreator ? (
            <View
              style={[
                a.gap_xs,
                a.pt_lg,
                a.border_t,
                t.atoms.border_contrast_low,
              ]}>
              <TextField.LabelText>
                <Trans>Group name</Trans>
              </TextField.LabelText>
              <View style={[a.flex_row, a.gap_sm]}>
                <View style={[a.flex_1]}>
                  <TextField.Root>
                    <TextField.Input
                      label={l`Group name`}
                      defaultValue={name}
                      onChangeText={setDraftName}
                      onSubmitEditing={onRename}
                    />
                  </TextField.Root>
                </View>
                <Button
                  label={l`Rename group`}
                  size="small"
                  variant="solid"
                  color="primary"
                  disabled={!canRename}
                  onPress={onRename}>
                  <ButtonText>
                    <Trans>Rename</Trans>
                  </ButtonText>
                </Button>
              </View>
            </View>
          ) : null}

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

          {/* Destructive: creator deletes the group; everyone else leaves it. */}
          <View style={[a.pt_lg, a.border_t, t.atoms.border_contrast_low]}>
            {isCreator ? (
              <Button
                label={l`Delete group`}
                size="large"
                variant="solid"
                color="negative"
                disabled={del.isPending}
                onPress={() => deletePrompt.open()}>
                <ButtonText>
                  <Trans>Delete group</Trans>
                </ButtonText>
              </Button>
            ) : (
              <Button
                label={l`Leave group`}
                size="large"
                variant="solid"
                color="negative"
                disabled={op.isPending}
                onPress={() => leavePrompt.open()}>
                <ButtonText>
                  <Trans>Leave group</Trans>
                </ButtonText>
              </Button>
            )}
          </View>
        </View>
      </Layout.Content>

      <Prompt.Basic
        control={leavePrompt}
        title={l`Leave this group?`}
        description={l`You'll stop receiving its messages. You can be re-invited later.`}
        confirmButtonCta={l`Leave`}
        confirmButtonColor="negative"
        onConfirm={() => {
          op.mutate(
            {threadId, op: 'leave'},
            {onSuccess: () => navigation.navigate('ChatList')},
          )
        }}
      />

      <Prompt.Basic
        control={deletePrompt}
        title={l`Delete this group?`}
        description={l`This permanently deletes the group for everyone. This can't be undone.`}
        confirmButtonCta={l`Delete`}
        confirmButtonColor="negative"
        onConfirm={() => {
          del.mutate(
            {threadId},
            {
              onSuccess: () => navigation.navigate('ChatList'),
              onError: () =>
                Toast.show(l`Could not delete the group.`, {type: 'error'}),
            },
          )
        }}
      />
    </Layout.Screen>
  )
}

/** A bare DID identifier (e.g. did:plc:…) — never shown to the user. */
function isDid(s?: string): boolean {
  return !!s && s.startsWith('did:')
}

function MemberRow({
  member,
  isSelf,
  onRemove,
  removing,
}: {
  member: ThreadMember
  isSelf?: boolean
  onRemove?: () => void
  removing?: boolean
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const isPerson = member.kind === 'person'
  // Friendly label, NEVER a raw did:plc string. "You" for the current account; otherwise
  // the display name / handle; and a generic fallback for a bare-DID member the runtime
  // didn't resolve a name for (see the runtime note in the handover).
  const handleLabel =
    member.handle && !isDid(member.handle)
      ? sanitizeHandle(member.handle, '@')
      : undefined
  const idLabel = !isDid(member.id) ? member.id : undefined
  const title = isSelf
    ? l`You`
    : member.name
      ? sanitizeDisplayName(member.name)
      : (handleLabel ?? idLabel ?? l`Member`)
  const subtitle = isPerson ? handleLabel : l`Agent persona`
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
      {onRemove ? (
        <Button
          label={`${l`Remove`} ${title}`}
          size="tiny"
          variant="ghost"
          color="negative"
          disabled={removing}
          onPress={onRemove}>
          <ButtonText>
            <Trans>Remove</Trans>
          </ButtonText>
        </Button>
      ) : null}
    </View>
  )
}
