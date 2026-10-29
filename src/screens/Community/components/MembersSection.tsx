import {View} from 'react-native'
import {plural} from '@lingui/core/macro'
import {Trans} from '@lingui/react/macro'

import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {useProfileQuery} from '#/state/queries/profile'
import {useSession} from '#/state/session'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {Loader} from '#/components/Loader'
import {Text} from '#/components/Typography'
import {type CommunityDescriptor, postsSource} from '../descriptor'
import {
  useCommunityRosterQueries,
  useCommunityTimelineQuery,
} from '../queries'
import {type RosterRow, topLevelPostIds, toRosterRows} from '../roster'

/**
 * The Members tab. For a member of a walled community it lists the people in
 * the runtime's thread rosters for the posts already loaded, plus the
 * community agent (see `../roster.ts`). Names and avatars come from the
 * profile cache. A non-member is never shown who is inside, and nothing is
 * read for them. A public-tier list belongs to the group AppView, which the
 * app cannot reach yet (see `queries.ts`), so nothing is read for it either.
 */
export function MembersSection({community}: {community: CommunityDescriptor}) {
  const t = useTheme()

  return (
    <View testID="communityMembersSection" style={[a.py_md]}>
      {community.memberCount !== undefined ? (
        <Text style={[a.px_lg, a.pb_md, a.text_md, a.font_semi_bold]}>
          {plural(community.memberCount, {
            one: '# member',
            other: '# members',
          })}
        </Text>
      ) : null}
      {postsSource(community) === 'runtime' ? (
        <MembersRoster community={community} />
      ) : community.tier !== 'public' ? (
        <Text style={[a.px_lg, a.text_md, t.atoms.text_contrast_medium]}>
          <Trans>Only members can see who else is in this community.</Trans>
        </Text>
      ) : (
        <Text
          testID="communityPublicMembersUnavailable"
          style={[a.px_lg, a.text_md, t.atoms.text_contrast_medium]}>
          <Trans>The member list isn’t available yet.</Trans>
        </Text>
      )}
    </View>
  )
}

function MembersRoster({community}: {community: CommunityDescriptor}) {
  const t = useTheme()
  const viewerHandle = useSession().currentAccount?.handle
  const timeline = useCommunityTimelineQuery({community})
  const postIds = topLevelPostIds(timeline.data?.pages)
  const rosters = useCommunityRosterQueries({community, postIds})

  const loaded = rosters.flatMap(r => (r.data ? [r.data] : []))
  const rows = toRosterRows(loaded, {
    agentDid: community.agentDid,
    viewerHandle,
    viewerIsAdmin: community.viewerIsAdmin,
    sponsorHandle: community.agent?.sponsorHandle,
  })
  const pending =
    timeline.isLoading || rosters.some(r => r.isLoading && !r.data)
  const failed =
    timeline.isError ||
    (rosters.length > 0 && rosters.every(r => r.isError))

  if (rows.length === 0) {
    if (pending) {
      return (
        <View style={[a.align_center, a.py_xl]}>
          <Loader size="lg" />
        </View>
      )
    }
    return (
      <Text
        testID={failed ? 'communityRosterError' : 'communityRosterEmpty'}
        style={[a.px_lg, a.text_md, t.atoms.text_contrast_medium]}>
        {failed ? (
          <Trans>Couldn’t load the member list.</Trans>
        ) : (
          <Trans>No one has posted here yet.</Trans>
        )}
      </Text>
    )
  }

  return (
    <View testID="communityRoster">
      {rows.map(row => (
        <RosterMemberRow key={row.id} row={row} />
      ))}
    </View>
  )
}

function RosterMemberRow({row}: {row: RosterRow}) {
  const t = useTheme()
  const {data: profile} = useProfileQuery({did: row.actor})
  const handle = profile?.handle ?? row.handle
  const name =
    profile?.displayName?.trim() ||
    (handle ? sanitizeHandle(handle, '@') : '') ||
    row.id

  return (
    <View
      testID={`communityRosterRow-${row.id}`}
      style={[
        a.flex_row,
        a.align_center,
        a.gap_sm,
        a.px_lg,
        a.py_sm,
        a.border_b,
        t.atoms.border_contrast_low,
      ]}>
      <UserAvatar
        type={row.isAgent ? 'algo' : 'user'}
        size={40}
        avatar={profile?.avatar}
      />
      <View style={[a.flex_1, a.gap_2xs]}>
        <View style={[a.flex_row, a.align_center, a.gap_xs]}>
          <Text
            testID="communityRosterName"
            emoji
            style={[a.flex_shrink, a.text_md, a.font_bold]}
            numberOfLines={1}>
            {sanitizeDisplayName(name)}
          </Text>
          {row.isAgent ? (
            <Text
              testID="communityRosterAgentLabel"
              style={[a.text_xs, a.font_bold, {color: t.palette.primary_500}]}>
              <Trans context="label shown next to an AI agent's name">
                ◆ Agent
              </Trans>
            </Text>
          ) : null}
          {row.isAdmin ? (
            <Text
              testID="communityRosterAdminBadge"
              style={[
                a.text_xs,
                a.font_bold,
                t.atoms.text_contrast_medium,
              ]}>
              <Trans context="badge shown next to a community admin's name">
                ADMIN
              </Trans>
            </Text>
          ) : null}
        </View>
        {handle && profile?.displayName?.trim() ? (
          <Text
            style={[a.text_sm, t.atoms.text_contrast_medium]}
            numberOfLines={1}>
            {sanitizeHandle(handle, '@')}
          </Text>
        ) : null}
      </View>
    </View>
  )
}
