import {View} from 'react-native'
import {useQueryClient} from '@tanstack/react-query'

import {useSession} from '#/state/session'
import {atoms as a} from '#/alf'
import {COMMUNITIES_ENABLED} from '#/env'
import {AgentGrantRow} from '#/features/communityAgent'
import {type CommunityDescriptor} from '../descriptor'
import {
  createCommunityAgentGrantQueryKey,
  useCommunityAgentGrantQuery,
} from '../queries'

/**
 * The caller's per-community settings: today only the community agent's
 * grant. Shown to a member of a community that has an agent, and only with
 * EXPO_PUBLIC_COMMUNITIES_ENABLED on. The row waits for the runtime's current
 * value so it never shows "off" over a grant that is on. If that read fails
 * the row is not shown, rather than guessing.
 */
export function AgentGrantSection({
  community,
}: {
  community: CommunityDescriptor
}) {
  const queryClient = useQueryClient()
  const viewer = useSession().currentAccount?.did ?? ''
  const {data: on} = useCommunityAgentGrantQuery({community})

  if (!COMMUNITIES_ENABLED) return null
  if (!community.isMember || !community.agent) return null
  if (on === undefined) return null

  return (
    <View testID="communityAgentGrantSection" style={[a.px_lg, a.pb_md]}>
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
