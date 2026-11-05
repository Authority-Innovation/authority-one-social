import {useState} from 'react'
import {useLingui} from '@lingui/react/macro'
import {useQueryClient} from '@tanstack/react-query'

import {deleteMine} from '#/lib/agent-runtime/communitiesClient'
import {useSession} from '#/state/session'
import {Button, ButtonIcon} from '#/components/Button'
import {DotGrid3x1_Stroke2_Corner0_Rounded as DotsHorizontal} from '#/components/icons/DotGrid'
import {Trash_Stroke2_Corner0_Rounded as TrashIcon} from '#/components/icons/Trash'
import * as Menu from '#/components/Menu'
import * as Prompt from '#/components/Prompt'
import * as Toast from '#/components/Toast'
import {type CommunityDescriptor} from '../descriptor'
import {isOwnPost} from '../memberActions'
import {type MemberPostRowData} from '../memberRows'
import {createCommunityTimelineQueryKey} from '../queries'

/** The actions on one members-timeline post. */
export function MemberPostMenu({
  community,
  post,
}: {
  community: CommunityDescriptor
  post: MemberPostRowData
}) {
  const {t: l} = useLingui()
  const queryClient = useQueryClient()
  const {currentAccount} = useSession()
  const viewer = currentAccount?.did ?? ''
  const deletePrompt = Prompt.usePromptControl()
  const [pending, setPending] = useState(false)

  const own = isOwnPost(post, currentAccount)
  if (!own) return null

  const refreshTimeline = () =>
    queryClient.invalidateQueries({
      queryKey: createCommunityTimelineQueryKey({id: community.id, viewer}),
    })

  const onDelete = async () => {
    if (pending) return
    setPending(true)
    const res = await deleteMine(community.id, post.id)
    setPending(false)
    if (res.ok) {
      void refreshTimeline()
      Toast.show(l`Post deleted`, {type: 'success'})
    } else {
      Toast.show(l`Couldn’t delete this post. Please try again.`, {
        type: 'error',
      })
    }
  }

  return (
    <>
      <Menu.Root>
        <Menu.Trigger label={l`Open post options menu`}>
          {({props}) => (
            <Button
              {...props}
              testID={`communityPostMenu-${post.id}`}
              label={props.accessibilityLabel}
              color="secondary"
              variant="ghost"
              size="tiny"
              shape="round">
              <ButtonIcon icon={DotsHorizontal} />
            </Button>
          )}
        </Menu.Trigger>
        <Menu.Outer>
          <Menu.Group>
            <Menu.Item
              testID="communityPostDelete"
              label={l`Delete post`}
              onPress={() => deletePrompt.open()}>
              <Menu.ItemText>{l`Delete post`}</Menu.ItemText>
              <Menu.ItemIcon icon={TrashIcon} />
            </Menu.Item>
          </Menu.Group>
        </Menu.Outer>
      </Menu.Root>
      <Prompt.Basic
        control={deletePrompt}
        title={l`Delete this post?`}
        description={l`It will be removed from this community. This can’t be undone.`}
        confirmButtonCta={l`Delete`}
        confirmButtonColor="negative"
        onConfirm={() => void onDelete()}
      />
    </>
  )
}
