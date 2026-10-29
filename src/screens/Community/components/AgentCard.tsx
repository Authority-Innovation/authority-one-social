import {View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'

import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {useProfileQuery} from '#/state/queries/profile'
import {atoms as a, useTheme} from '#/alf'
import {Sparkle_Stroke2_Corner0_Rounded as SparkleIcon} from '#/components/icons/Sparkle'
import {Text} from '#/components/Typography'
import {type CommunityDescriptor} from '../descriptor'

/**
 * The community agent: who it is, who is accountable for it, and what it can
 * see. Rendered whenever the community names an agent DID. The sponsor line
 * reads "run by <handle>" only when the runtime sends the sponsor's handle
 * (`agentSponsor.handle`); otherwise it is just "AI agent". The sponsor's DID
 * and the community's name are never shown in its place. The agent's label
 * comes from the config, never from a handle. Its name is the config's, else
 * the display name in the profile cache for the config's agent DID.
 */
export function AgentCard({community}: {community: CommunityDescriptor}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const agent = community.agent
  const {data: profile} = useProfileQuery({did: agent?.did})
  if (!agent) return null

  const name =
    agent.name ??
    (profile?.displayName?.trim()
      ? sanitizeDisplayName(profile.displayName)
      : l`Community agent`)
  // No fallback to the sponsor DID or the community name: with no handle the
  // line is just "AI agent".
  const sponsorName = agent.sponsorName

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
          {sponsorName ? (
            <Trans>AI agent · run by {sponsorName}</Trans>
          ) : (
            <Trans>AI agent</Trans>
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
