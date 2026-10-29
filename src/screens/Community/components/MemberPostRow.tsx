import {View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'

import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {useProfileQuery} from '#/state/queries/profile'
import {TimeElapsed} from '#/view/com/util/TimeElapsed'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'
import {isCommunityAgentAuthor} from '#/features/communities/agentLabel'
import {type MemberPostRowData} from '../memberRows'

/**
 * One members-timeline item. The author's display name and avatar come from
 * the app's profile cache (`useProfileQuery`, keyed by the author DID, else
 * the handle); until that resolves, or when it cannot, the row shows what the
 * item carries: its display name, then the handle, then the DID.
 */
export function MemberPostRow({
  post,
  agentDid,
}: {
  post: MemberPostRowData
  agentDid?: string
}) {
  const t = useTheme()
  const {i18n} = useLingui()
  const {data: profile} = useProfileQuery({did: post.authorActor})
  // N1/R3: is_agent AND author.did matching the config's agent DID. An old
  // item (did null) or a community with no agent DID gets no label. The
  // profile is never consulted, so a display name can't claim the label.
  const isAgent = isCommunityAgentAuthor(post.author, agentDid)
  const created = new Date(post.createdAt)
  const hasTime = post.createdAt !== '' && !Number.isNaN(created.getTime())

  const handle = profile?.handle ?? post.authorHandle
  const name =
    profile?.displayName?.trim() ||
    (handle ? sanitizeHandle(handle, '@') : '') ||
    post.authorName
  const avatar = profile?.avatar ?? post.author.avatar

  return (
    <View
      testID={`communityPost-${post.id}`}
      style={[
        a.flex_row,
        a.gap_sm,
        a.px_lg,
        a.py_md,
        a.border_b,
        t.atoms.border_contrast_low,
      ]}>
      <UserAvatar
        type={isAgent ? 'algo' : 'user'}
        size={40}
        avatar={avatar}
      />
      <View style={[a.flex_1, a.gap_2xs]}>
        <View style={[a.flex_row, a.align_center, a.gap_xs]}>
          <Text
            testID="communityPostAuthorName"
            emoji
            style={[a.flex_shrink, a.text_md, a.font_bold]}
            numberOfLines={1}>
            {sanitizeDisplayName(name)}
          </Text>
          {isAgent ? (
            <Text
              testID="communityPostAgentLabel"
              style={[a.text_xs, a.font_bold, {color: t.palette.primary_500}]}>
              <Trans context="label shown next to an AI agent's name">
                ◆ Agent
              </Trans>
            </Text>
          ) : null}
          {hasTime ? (
            <TimeElapsed timestamp={post.createdAt}>
              {({timeElapsed}) => (
                <Text
                  testID="communityPostTime"
                  accessibilityLabel={i18n.date(created, {
                    dateStyle: 'long',
                    timeStyle: 'short',
                  })}
                  style={[a.text_sm, t.atoms.text_contrast_medium]}
                  numberOfLines={1}>
                  {`· ${timeElapsed}`}
                </Text>
              )}
            </TimeElapsed>
          ) : null}
        </View>
        <Text emoji style={[a.text_md, a.leading_snug]}>
          {post.text}
        </Text>
      </View>
    </View>
  )
}
