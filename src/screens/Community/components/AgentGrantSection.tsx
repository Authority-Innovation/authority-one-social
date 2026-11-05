import {View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'
import {useQueryClient} from '@tanstack/react-query'

import {useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Text} from '#/components/Typography'
import {COMMUNITIES_ENABLED} from '#/env'
import {AgentGrantRow} from '#/features/communityAgent'
import {agentGrantSectionState} from '../agentGrantState'
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
 * it says so and offers a retry, rather than guessing or hiding: "you can turn
 * it off any time" has to stay true while a grant may be on.
 */
export function AgentGrantSection({
  community,
}: {
  community: CommunityDescriptor
}) {
  const t = useTheme()
  const queryClient = useQueryClient()
  const viewer = useSession().currentAccount?.did ?? ''
  const {t: l} = useLingui()
  const {data: on, isError, refetch} = useCommunityAgentGrantQuery({community})

  if (!COMMUNITIES_ENABLED) return null
  const state = agentGrantSectionState({
    isMember: community.isMember,
    agentDid: community.agentDid,
    on,
    isError,
  })
  if (state === 'hidden' || state === 'loading') return null

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
      {state === 'error' ? (
        <View testID="communityAgentGrantReadError" style={[a.gap_sm]}>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            <Trans>
              We couldn’t load whether this community’s agent has access to
              your content.
            </Trans>
          </Text>
          <Button
            label={l`Try again`}
            onPress={() => void refetch()}
            color="secondary"
            size="small">
            <ButtonText>
              <Trans>Try again</Trans>
            </ButtonText>
          </Button>
        </View>
      ) : (
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
      )}
    </View>
  )
}
