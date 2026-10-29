/**
 * The control that launches (sponsors) a community's agent. Rendered only for
 * a current admin of that community; for anyone else it is not rendered at
 * all, not shown disabled. It gates itself rather than trusting its caller, so
 * any route that mounts it (a deep link included) can't offer launch to a
 * non-admin. The runtime is the real enforcement.
 * Renders nothing with EXPO_PUBLIC_COMMUNITIES_ENABLED off.
 */
import {useLingui} from '@lingui/react/macro'

import {Button, ButtonText} from '#/components/Button'
import {COMMUNITIES_ENABLED} from '#/env'
import {isCommunityAdmin} from './adminGate'

export function AgentLaunchControl({
  community,
  onLaunch,
}: {
  community: {id: string; viewerIsAdmin?: unknown} | null | undefined
  onLaunch: (communityId: string) => void
}) {
  const {t: l} = useLingui()

  if (!COMMUNITIES_ENABLED) return null
  if (!community || !isCommunityAdmin(community)) return null

  const onPress = () => {
    // Re-checked at press time so a stale render can't launch.
    if (!isCommunityAdmin(community)) return
    onLaunch(community.id)
  }

  return (
    <Button
      testID="communityAgentLaunch"
      label={l`Launch this community’s agent`}
      onPress={onPress}
      color="primary"
      size="small">
      <ButtonText>{l`Launch this community’s agent`}</ButtonText>
    </Button>
  )
}
