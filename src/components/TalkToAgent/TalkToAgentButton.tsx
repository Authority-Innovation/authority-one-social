import {useCallback} from 'react'
import {type AppBskyActorDefs} from '@atproto/api'

import {isAgentHandle, PUBLIC_CHAT_ENABLED} from '#/lib/agent-runtime'
import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {type Shadow} from '#/state/cache/profile-shadow'
import {useProfileFollowMutationQueue} from '#/state/queries/profile'
import {Button, ButtonText} from '#/components/Button'
import {useDialogControl} from '#/components/Dialog'
import {PublicAgentChatDialog} from '#/components/TalkToAgent/PublicAgentChatDialog'

/**
 * Public "Talk to <Agent>" entry point on an agent's profile (§3.6 / E7). Renders on ANY
 * agent profile — anonymous visitors, signed-in viewers regardless of follow state, AND the
 * agent's own owner (demo-friendly: the runtime detects an owner viewer server-side and
 * lifts the budget; everyone else stays metered). Only gates: the PUBLIC_CHAT_ENABLED build
 * flag and the handle being an agent. Opens the visitor-chat sheet, which replies as the
 * agent's persona with text + voice. Follow-from-the-conversion-card uses the same follow
 * mutation as the header.
 */
export function TalkToAgentButton({
  profile,
}: {
  profile: Shadow<AppBskyActorDefs.ProfileViewDetailed>
}) {
  const control = useDialogControl()
  const [queueFollow] = useProfileFollowMutationQueue(profile, 'TalkToAgent')

  const isAgent = isAgentHandle(profile.handle)
  const following = !!profile.viewer?.following

  const onFollow = useCallback(() => {
    void queueFollow().catch(() => {})
  }, [queueFollow])

  // Dark unless the feature is on AND this is an agent profile. Deliberately NOT
  // gated on follow state or ownership — owners see it too (demo mode: the runtime
  // verifies ownership server-side and lifts their budget; never a client claim).
  if (!PUBLIC_CHAT_ENABLED || !isAgent) return null

  const displayName = sanitizeDisplayName(profile.displayName || profile.handle)

  return (
    <>
      <Button
        testID="talkToAgentButton"
        label={`Talk to ${displayName}`}
        size="small"
        color="primary"
        onPress={() => control.open()}>
        <ButtonText>Talk to {displayName}</ButtonText>
      </Button>
      <PublicAgentChatDialog
        control={control}
        agent={profile.handle}
        displayName={displayName}
        following={following}
        onFollow={onFollow}
      />
    </>
  )
}
