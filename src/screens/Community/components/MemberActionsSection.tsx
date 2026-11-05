import {useState} from 'react'
import {View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'
import {useQueryClient} from '@tanstack/react-query'

import {exportMine} from '#/lib/agent-runtime/communitiesClient'
import {type NavigationProp} from '#/lib/routes/types'
import {shareText} from '#/lib/sharing'
import {useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Prompt from '#/components/Prompt'
import {Text} from '#/components/Typography'
import {createMyCommunitiesQueryKey} from '#/features/communities/switcher/useMyCommunitiesQuery'
import {type CommunityDescriptor} from '../descriptor'
import {exportText, leaveCommunity} from '../memberActions'
import {createCommunityQueryKey, createCommunityTimelineQueryKey} from '../queries'

/**
 * Export and leave, for a member. Deleting one post is on the post's own menu
 * (`MemberPostMenu`).
 */
export function MemberActionsSection({
  community,
}: {
  community: CommunityDescriptor
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const navigation = useNavigation<NavigationProp>()
  const queryClient = useQueryClient()
  const viewer = useSession().currentAccount?.did ?? ''
  const leavePrompt = Prompt.usePromptControl()
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<
    'export' | 'grant' | 'leave' | null
  >(null)

  if (!community.isMember) return null

  const onExport = async () => {
    if (pending) return
    setPending(true)
    setFailure(null)
    const res = await exportMine(community.id)
    setPending(false)
    if (!res.ok) {
      setFailure('export')
      return
    }
    await shareText(exportText(res.data))
  }

  const onLeave = async () => {
    if (pending) return
    setPending(true)
    setFailure(null)
    const res = await leaveCommunity(community.id)
    setPending(false)
    if (!res.ok) {
      setFailure(res.reason === 'grant_off_failed' ? 'grant' : 'leave')
      return
    }
    // Members-tier bodies must not outlive the membership in this cache.
    queryClient.removeQueries({
      queryKey: createCommunityTimelineQueryKey({id: community.id, viewer}),
    })
    queryClient.removeQueries({
      queryKey: createCommunityQueryKey({id: community.id, viewer}),
    })
    void queryClient.invalidateQueries({
      queryKey: createMyCommunitiesQueryKey({did: viewer}),
    })
    navigation.navigate('Home')
  }

  return (
    <View
      testID="communityMemberActions"
      style={[
        a.gap_sm,
        a.px_lg,
        a.py_md,
        a.border_t,
        t.atoms.border_contrast_low,
      ]}>
      <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
        <Button
          testID="communityExportButton"
          label={l`Export my posts`}
          disabled={pending}
          onPress={() => void onExport()}
          color="secondary"
          size="small">
          <ButtonText>
            <Trans>Export my posts</Trans>
          </ButtonText>
        </Button>
        <Button
          testID="communityLeaveButton"
          label={l`Leave community`}
          disabled={pending}
          onPress={() => leavePrompt.open()}
          color="negative_subtle"
          size="small">
          <ButtonText>
            <Trans>Leave community</Trans>
          </ButtonText>
        </Button>
      </View>
      {failure ? (
        <Text
          testID="communityMemberActionError"
          style={[a.text_sm, {color: t.palette.negative_500}]}>
          {failure === 'export' ? (
            <Trans>Couldn’t export your posts. Please try again.</Trans>
          ) : failure === 'grant' ? (
            <Trans>
              You’re still a member. We couldn’t turn off the community agent’s
              access, so we didn’t leave. Please try again.
            </Trans>
          ) : (
            <Trans>Couldn’t leave right now. Please try again.</Trans>
          )}
        </Text>
      ) : null}
      <Prompt.Basic
        control={leavePrompt}
        title={l`Leave this community?`}
        description={l`The community agent’s access to your content is turned off first. Your posts stay in the community unless you delete them, so export or delete them before you leave if you want to.`}
        confirmButtonCta={l`Leave`}
        confirmButtonColor="negative"
        onConfirm={() => void onLeave()}
      />
    </View>
  )
}
