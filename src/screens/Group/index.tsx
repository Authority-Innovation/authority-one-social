/**
 * Authority One Social — Group screens (SCAFFOLD, 2026-06-13).
 *
 * UI shell for create / view-timeline / members / join-leave, wired to
 * src/state/queries/group.ts. Layout intentionally minimal — copy structure
 * from the existing ProfileList screen (src/screens/.../ProfileList) which is
 * the nearest analog (a list + its feed + a members tab). Everything below is
 * TODO-marked; no production styling yet.
 *
 * Routes to add to src/routes.ts (do in a focused edit, kept out of this stub
 * to avoid touching the live router):
 *   Groups:       '/groups'                      // directory / my-groups
 *   Group:        '/groups/:owner/:rkey'         // owner handle + group rkey
 *   GroupMembers: '/groups/:owner/:rkey/members'
 * And the matching entries in lib/routes/types.ts + Navigation.tsx.
 */
import {View} from 'react-native'

import {
  useGroupMembersQuery,
  useGroupQuery,
  useGroupTimelineQuery,
  useJoinGroupMutation,
  useLeaveGroupMutation,
} from '#/state/queries/group'

// TODO(routes): type via NativeStackScreenProps<CommonNavigatorParams,'Group'>
export function GroupScreen({groupUri}: {groupUri: string}) {
  // Hooks are kept wired (queries/mutations subscribe) while the UI is a stub;
  // values are unused for now, hence the `_` prefix.
  const {data: _group, isLoading: _isLoading} = useGroupQuery(groupUri)
  const _timeline = useGroupTimelineQuery(groupUri)
  const _join = useJoinGroupMutation()
  const _leave = useLeaveGroupMutation()

  // TODO: header (avatar/banner/name/desc + member count)
  // TODO: join/leave button driven by group.viewer.canJoin / group.viewer.membership
  //       onJoin  -> join.mutate({group})
  //       onLeave -> leave.mutate({membershipUri: group.viewer.membership!})
  // TODO: visibility/admission badge (group.visibility / group.admissionPolicy)
  // TODO: if private && !member -> render groupViewBasic + "members only" empty state
  // TODO: tabs: Timeline (timeline pages) | Members (<GroupMembersTab/>)
  // TODO: composer entry that posts to this group (usePostToGroupMutation after post create)
  return <View />
}

export function GroupMembersTab({groupUri}: {groupUri: string}) {
  const _members = useGroupMembersQuery(groupUri)
  // TODO: list memberView rows; show role/status; admin actions (approve/ban)
  //       gated on viewer role (admin/owner) for request/invite groups.
  return <View />
}

// TODO: GroupComposerStep — create-group form bound to useCreateGroupMutation
//       (name, description, avatar, visibility, admissionPolicy, postingPolicy).
