import {View} from 'react-native'
import {plural} from '@lingui/core/macro'
import {Trans} from '@lingui/react/macro'

import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'
import {type CommunityDescriptor} from '../descriptor'

/**
 * The Members tab. It shows the count only. A walled community has no
 * runtime member-list route yet, and a non-member must not see who is inside.
 * A public-tier list belongs to the group AppView, which the app cannot reach
 * yet (see `queries.ts`), so nothing is read for it either.
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
      {community.tier !== 'public' ? (
        <Text style={[a.px_lg, a.text_md, t.atoms.text_contrast_medium]}>
          {community.isMember ? (
            <Trans>The member list isn’t available yet.</Trans>
          ) : (
            <Trans>Only members can see who else is in this community.</Trans>
          )}
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
