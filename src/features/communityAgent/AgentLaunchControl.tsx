/**
 * "Launch community agent": lets a current admin of the community launch
 * (sponsor) its agent. Only a current admin may launch, never the agent
 * itself, and never an owner or moderator who is not an admin.
 *
 * The control gates itself rather than trusting its caller: it renders
 * nothing (not a disabled button) unless EXPO_PUBLIC_COMMUNITIES_ENABLED is on
 * and the runtime said `viewer_is_admin: true`. The runtime enforces the same
 * rule on POST /app/communities/:id/agent/launch. It also renders nothing while
 * the community already has an active agent (the door's `agent: {did,
 * is_agent: true}`, read into `agentDid`): there is nothing to launch, and no
 * admin "Manage agent" action exists yet to show in its place.
 *
 * Pressing calls `launchCommunityAgent` once. On success the button is
 * replaced by a confirmation and `onLaunched` fires. On failure an error is
 * shown and nothing else changes, so the admin can try again.
 */
import {useState} from 'react'
import {View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'

import {launchCommunityAgent} from '#/lib/agent-runtime/communitiesClient'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Text} from '#/components/Typography'
import {COMMUNITIES_ENABLED} from '#/env'
import {isCommunityAdmin} from './isCommunityAdmin'

export function AgentLaunchControl({
  community,
  onLaunched,
}: {
  community:
    | {id: string; viewerIsAdmin?: boolean; agentDid?: string}
    | null
    | undefined
  /** Called once the runtime has accepted the launch. */
  onLaunched?: () => void
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const [pending, setPending] = useState(false)
  const [launched, setLaunched] = useState(false)
  const [failed, setFailed] = useState(false)

  if (
    !COMMUNITIES_ENABLED ||
    !community ||
    !isCommunityAdmin(community) ||
    !!community.agentDid
  ) {
    return null
  }

  const onPress = async () => {
    if (pending || launched) return
    setPending(true)
    setFailed(false)
    const res = await launchCommunityAgent(community.id)
    setPending(false)
    if (res.ok) {
      setLaunched(true)
      onLaunched?.()
    } else {
      setFailed(true)
    }
  }

  return (
    <View testID="communityAgentLaunchControl" style={[a.gap_xs, a.mx_lg]}>
      {launched ? (
        <Text
          testID="communityAgentLaunched"
          style={[a.text_sm, t.atoms.text_contrast_medium]}>
          <Trans>Community agent launched.</Trans>
        </Text>
      ) : (
        <Button
          testID="communityAgentLaunchButton"
          label={l`Launch community agent`}
          onPress={() => void onPress()}
          disabled={pending}
          color="primary"
          size="small">
          <ButtonText>
            <Trans>Launch community agent</Trans>
          </ButtonText>
        </Button>
      )}
      {failed ? (
        <Text
          testID="communityAgentLaunchError"
          style={[a.text_xs, {color: t.palette.negative_500}]}>
          <Trans>Couldn’t launch the community agent. Please try again.</Trans>
        </Text>
      ) : null}
    </View>
  )
}
