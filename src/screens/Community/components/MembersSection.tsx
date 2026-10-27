import {View} from 'react-native'
import {plural} from '@lingui/core/macro'
import {Trans} from '@lingui/react/macro'

import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {Loader} from '#/components/Loader'
import {Text} from '#/components/Typography'
import {type CommunityDescriptor} from '../descriptor'
import {useCommunityMembersQuery} from '../queries'

/**
 * The Members tab. A public-tier community lists its members through the
 * group AppView. A walled community shows its count only: the runtime has no
 * member-list route yet, and a non-member must not see who is inside.
 */
export function MembersSection({community}: {community: CommunityDescriptor}) {
  const t = useTheme()
  const {data, isLoading} = useCommunityMembersQuery({community})
  const members = data?.pages.flatMap(page => page.members) ?? []

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
      {community.tier !== 'public' ? (
        <Text style={[a.px_lg, a.text_md, t.atoms.text_contrast_medium]}>
          {community.isMember ? (
            <Trans>The member list isn’t available yet.</Trans>
          ) : (
            <Trans>Only members can see who else is in this community.</Trans>
          )}
        </Text>
      ) : isLoading ? (
        <View style={[a.align_center, a.py_xl]}>
          <Loader size="xl" />
        </View>
      ) : members.length === 0 ? (
        <Text style={[a.px_lg, a.text_md, t.atoms.text_contrast_medium]}>
          <Trans>No members to show yet.</Trans>
        </Text>
      ) : (
        members.map(m => (
          <View
            key={m.subject.did}
            style={[a.flex_row, a.align_center, a.gap_sm, a.px_lg, a.py_sm]}>
            <UserAvatar type="user" size={36} avatar={m.subject.avatar} />
            <Text emoji style={[a.flex_1, a.text_md]} numberOfLines={1}>
              {m.subject.displayName || m.subject.handle}
            </Text>
          </View>
        ))
      )}
    </View>
  )
}
