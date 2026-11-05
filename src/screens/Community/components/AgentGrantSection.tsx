import {View} from 'react-native'
import {Trans} from '@lingui/react/macro'
import {useQueryClient} from '@tanstack/react-query'

import {useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'
import {COMMUNITIES_ENABLED} from '#/env'
import {AgentGrantRow} from '#/features/communityAgent'
import {type CommunityDescriptor} from '../descriptor'
import {
  createCommunityAgentGrantQueryKey,
  useCommunityAgentGrantQuery,
} from '../queries'

/**
 * "Your settings": the caller's per-community settings, as its own section on
 * the community home so it does not depend on the agent card. Today it holds
 * only the community agent's grant. Shown to a member of a community that
 * names an agent DID, and only with
 * EXPO_PUBLIC_COMMUNITIES_ENABLED on. The row waits for the runtime's current
 * value so it never shows "off" over a grant that is on. If that read fails
 * the row is not shown, rather than guessing.
 */
export function AgentGrantSection({
  community,
}: {
  community: CommunityDescriptor
}) {
  const t = useTheme()
  const queryClient = useQueryClient()
  const viewer = useSession().currentAccount?.did ?? ''
  const {data: on} = useCommunityAgentGrantQuery({community})

  if (!COMMUNITIES_ENABLED) return null
  if (!community.isMember || !community.agentDid) return null
  if (on === undefined) return null

  return (
    <View
      testID="communityAgentGrantSection"
      style={[
        a.gap_sm,
        a.px_lg,
        a.py_md,
        a.border_t,
        t.atoms.border_contrast_low,
      ]}>
      <Text
        testID="communityYourSettingsHeading"
        style={[a.text_md, a.font_bold]}>
        <Trans>Your settings</Trans>
      </Text>
      <AgentGrantRow
        communityId={community.id}
        initialValue={on}
        onSaved={next =>
          queryClient.setQueryData(
            createCommunityAgentGrantQueryKey({id: community.id, viewer}),
            next,
          )
        }
      />
    </View>
  )
}
