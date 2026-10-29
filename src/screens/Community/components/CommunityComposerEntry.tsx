/**
 * The composer entry for a community. Its target is fixed to `communityId`
 * and nothing else: a post from here may only go to this community's private
 * store, never to the person's public account.
 *
 * It opens the ordinary composer with a `community` target. For a members or
 * paid tier the composer routes the submit through the communities runtime
 * client only (`resolveTarget` / `submitComposerThread`), and the PDS write
 * guard (`guardComposerPdsWrite`) still refuses every PDS write for it. A
 * public tier is refused by the same gate until its binding review passes.
 */
import {View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'
import {useQueryClient} from '@tanstack/react-query'

import {type CommunityTier} from '#/lib/communities/composerTarget'
import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {useSession} from '#/state/session'
import {atoms as a} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {COMMUNITIES_ENABLED} from '#/env'
import {createCommunityTimelineQueryKey} from '../queries'

export function CommunityComposerEntry({
  communityId,
  tier,
}: {
  communityId: string
  tier: CommunityTier
}) {
  const {t: l} = useLingui()
  const {openComposer} = useOpenComposer()
  const queryClient = useQueryClient()
  const viewer = useSession().currentAccount?.did ?? ''

  if (!COMMUNITIES_ENABLED) return null

  const onPress = () => {
    openComposer({
      target: {kind: 'community', id: communityId, tier},
      logContext: 'Other',
      onPost: () => {
        void queryClient.invalidateQueries({
          queryKey: createCommunityTimelineQueryKey({id: communityId, viewer}),
        })
      },
    })
  }

  return (
    <View style={[a.px_lg, a.py_md]}>
      <Button
        testID="communityComposerEntry"
        label={l`Post to this community`}
        size="large"
        color="primary"
        variant="solid"
        onPress={onPress}>
        <ButtonText>
          <Trans>Post to this community</Trans>
        </ButtonText>
      </Button>
    </View>
  )
}
