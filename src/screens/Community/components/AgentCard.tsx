import {View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'

import {atoms as a, useTheme} from '#/alf'
import {Sparkle_Stroke2_Corner0_Rounded as SparkleIcon} from '#/components/icons/Sparkle'
import {Text} from '#/components/Typography'
import {type CommunityDescriptor} from '../descriptor'

/**
 * The community agent: who it is, who is accountable for it, and what it can
 * see. Rendered only when the community config names both an agent and its
 * sponsor (N1) - the descriptor drops `agent` otherwise. The label comes from
 * the config, never from a handle.
 */
export function AgentCard({community}: {community: CommunityDescriptor}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const agent = community.agent
  if (!agent) return null

  const name = agent.name ?? l`Community agent`
  const sponsor = agent.sponsorName ?? community.runBy

  return (
    <View
      testID="communityAgentCard"
      style={[
        a.flex_row,
        a.gap_md,
        a.p_md,
        a.mx_lg,
        a.my_md,
        a.rounded_md,
        a.border,
        t.atoms.border_contrast_low,
        t.atoms.bg_contrast_25,
      ]}>
      <SparkleIcon size="lg" fill={t.palette.primary_500} />
      <View style={[a.flex_1, a.gap_2xs]}>
        <View style={[a.flex_row, a.align_center, a.gap_xs]}>
          <Text emoji style={[a.text_md, a.font_bold]}>
            {name}
          </Text>
          <Text
            style={[a.text_xs, a.font_bold, {color: t.palette.primary_500}]}>
            <Trans context="label shown next to an AI agent's name">
              ◆ Agent
            </Trans>
          </Text>
        </View>
        <Text
          testID="communityAgentSponsor"
          emoji
          style={[a.text_sm, t.atoms.text_contrast_medium]}>
          {sponsor ? (
            <Trans>AI agent · sponsor: {sponsor}</Trans>
          ) : (
            <Trans>AI agent · sponsored by this community</Trans>
          )}
        </Text>
        <Text testID="communityAgentScope" style={[a.text_sm]}>
          {agent.scope ?? (
            <Trans>
              Sees posts in this community only. It can’t see your profile or
              your other communities.
            </Trans>
          )}
        </Text>
      </View>
    </View>
  )
}
