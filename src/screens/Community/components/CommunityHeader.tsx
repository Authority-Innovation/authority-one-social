import {View} from 'react-native'
import {Image} from 'expo-image'
import {plural} from '@lingui/core/macro'
import {Trans, useLingui} from '@lingui/react/macro'

import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {Lock_Stroke2_Corner0_Rounded as LockIcon} from '#/components/icons/Lock'
import {Text} from '#/components/Typography'
import {type CommunityDescriptor, type CommunityTier} from '../descriptor'

/**
 * The community header. The community's accent colour is applied here and
 * nowhere else (N3): the app theme is never changed for a community.
 */
export function CommunityHeader({
  community,
  onPressJoin,
}: {
  community: CommunityDescriptor
  onPressJoin: () => void
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const accent = community.accent

  return (
    <View
      testID="communityHeader"
      style={[
        t.atoms.border_contrast_low,
        a.border_b,
        accent ? {borderTopWidth: 4, borderTopColor: accent} : null,
      ]}>
      <View
        testID="communityHeaderBanner"
        style={[
          {height: 120},
          accent ? {backgroundColor: accent} : t.atoms.bg_contrast_25,
        ]}>
        {community.banner ? (
          <Image
            source={{uri: community.banner}}
            style={[a.flex_1]}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : null}
      </View>
      <View style={[a.gap_sm, a.px_lg, a.pb_lg, {marginTop: -32}]}>
        <UserAvatar type="list" size={64} avatar={community.avatar} />
        <Text emoji style={[a.text_2xl, a.font_bold, a.leading_tight]}>
          {community.name}
        </Text>
        <View style={[a.flex_row, a.flex_wrap, a.align_center, a.gap_sm]}>
          <TierBadge tier={community.tier} />
          {community.isMember ? (
            <View
              testID="communityMemberBadge"
              style={[a.flex_row, a.align_center, a.gap_2xs]}>
              <CheckIcon size="xs" fill={t.palette.positive_500} />
              <Text style={[a.text_sm, a.font_semi_bold]}>
                <Trans>Member</Trans>
              </Text>
            </View>
          ) : null}
        </View>
        <RunByLine community={community} />
        {community.description ? (
          <Text emoji style={[a.text_md, a.leading_snug]}>
            {community.description}
          </Text>
        ) : null}
        {!community.isMember ? (
          <View style={[a.gap_xs, a.pt_xs]}>
            <Button
              testID="communityJoinButton"
              label={l`Join community`}
              onPress={onPressJoin}
              color="primary"
              size="large">
              <ButtonText>
                <Trans>Join community</Trans>
              </ButtonText>
            </Button>
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              <Trans>You choose what to share before you join.</Trans>
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}

function TierBadge({tier}: {tier: CommunityTier}) {
  const t = useTheme()
  return (
    <View
      testID="communityTierBadge"
      style={[a.flex_row, a.align_center, a.gap_2xs]}>
      {tier !== 'public' ? (
        <LockIcon size="xs" fill={t.atoms.text_contrast_medium.color} />
      ) : null}
      <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
        {tier === 'public' ? (
          <Trans context="community tier">Public</Trans>
        ) : tier === 'paid' ? (
          <Trans context="community tier">Paid members only</Trans>
        ) : (
          <Trans context="community tier">Members only</Trans>
        )}
      </Text>
    </View>
  )
}

function RunByLine({community}: {community: CommunityDescriptor}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const count =
    community.memberCount !== undefined
      ? plural(community.memberCount, {
          one: '# member',
          other: '# members',
        })
      : undefined
  const runBy = community.runBy

  if (!runBy && !count) return null
  return (
    <Text emoji style={[a.text_sm, t.atoms.text_contrast_medium]}>
      {runBy && count
        ? l`Run by ${runBy} · ${count}`
        : runBy
          ? l`Run by ${runBy}`
          : count}
    </Text>
  )
}
