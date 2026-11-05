import {useState} from 'react'
import {useLingui} from '@lingui/react/macro'
import {useQueryClient} from '@tanstack/react-query'

import {
  banMember,
  type CommunitiesResult,
  type CommunityReportReason,
  deleteMine,
  removeMember,
  removePost,
  reportPost,
} from '#/lib/agent-runtime/communitiesClient'
import {useSession} from '#/state/session'
import {Button, ButtonIcon} from '#/components/Button'
import {CircleBanSign_Stroke2_Corner0_Rounded as BanIcon} from '#/components/icons/CircleBanSign'
import {DotGrid3x1_Stroke2_Corner0_Rounded as DotsHorizontal} from '#/components/icons/DotGrid'
import {Flag_Stroke2_Corner0_Rounded as FlagIcon} from '#/components/icons/Flag'
import {PersonX_Stroke2_Corner0_Rounded as PersonXIcon} from '#/components/icons/Person'
import {Trash_Stroke2_Corner0_Rounded as TrashIcon} from '#/components/icons/Trash'
import * as Menu from '#/components/Menu'
import * as Prompt from '#/components/Prompt'
import * as Toast from '#/components/Toast'
import {type CommunityDescriptor} from '../descriptor'
import {isOwnPost} from '../memberActions'
import {type MemberPostRowData} from '../memberRows'
import {blockKeysFor, moderationActionsFor, moderationOutcome} from '../moderation'
import {createCommunityTimelineQueryKey} from '../queries'
import {useBlockedMembers} from '../useBlockedMembers'

type Confirm = 'delete' | 'block' | 'remove-post' | 'remove-member' | 'ban'

/**
 * The actions on one members-timeline post: Delete on your own, Report and Block
 * on anyone else's, and the admin actions for a current admin. The runtime
 * enforces all of it; a non-admin who reaches an admin route is refused.
 */
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
  const prompt = Prompt.usePromptControl()
  const {block} = useBlockedMembers({communityId: community.id})
  const [pending, setPending] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>('delete')

  const own = isOwnPost(post, currentAccount)
  const memberId = post.memberId
  const actions = moderationActionsFor({
    own,
    isAdmin: community.viewerIsAdmin === true,
    hasMemberId: !!memberId,
  })
  if (!own && actions.length === 0) return null

  const refreshTimeline = () =>
    queryClient.invalidateQueries({
      queryKey: createCommunityTimelineQueryKey({id: community.id, viewer}),
    })

  const run = async (
    call: () => Promise<CommunitiesResult<unknown>>,
    doneMessage: string,
    {refresh = true}: {refresh?: boolean} = {},
  ) => {
    if (pending) return
    setPending(true)
    const outcome = moderationOutcome(await call())
    setPending(false)
    switch (outcome) {
      case 'done':
        if (refresh) void refreshTimeline()
        Toast.show(doneMessage, {type: 'success'})
        break
      case 'not_available':
        Toast.show(l`This isn’t available yet, so nothing was sent.`, {
          type: 'warning',
        })
        break
      case 'not_allowed':
        Toast.show(l`You don’t have permission to do that.`, {type: 'error'})
        break
      default:
        Toast.show(l`That didn’t work. Please try again.`, {type: 'error'})
    }
  }

  const onReport = (reason: CommunityReportReason) =>
    void run(
      () => reportPost(community.id, post.id, reason),
      l`Report sent to the community’s admins`,
      {refresh: false},
    )

  const ask = (next: Confirm) => {
    setConfirm(next)
    prompt.open()
  }

  const onConfirm = () => {
    switch (confirm) {
      case 'delete':
        void run(() => deleteMine(community.id, post.id), l`Post deleted`)
        break
      case 'block':
        block(blockKeysFor(post))
        Toast.show(l`You won’t see their posts here on this device`, {
          type: 'success',
        })
        break
      case 'remove-post':
        void run(() => removePost(community.id, post.id), l`Post removed`)
        break
      case 'remove-member':
        if (memberId) {
          void run(
            () => removeMember(community.id, memberId),
            l`Member removed`,
          )
        }
        break
      case 'ban':
        if (memberId) {
          void run(() => banMember(community.id, memberId), l`Member banned`)
        }
        break
    }
  }

  const copy: Record<
    Confirm,
    {title: string; description: string; cta: string}
  > = {
    delete: {
      title: l`Delete this post?`,
      description: l`It will be removed from this community. This can’t be undone.`,
      cta: l`Delete`,
    },
    block: {
      title: l`Block this person here?`,
      description: l`You won’t see their posts in this community on this device. They can still see yours, and they stay a member. To have someone removed, report their post.`,
      cta: l({message: 'Block', context: 'verb'}),
    },
    'remove-post': {
      title: l`Remove this post?`,
      description: l`It will be removed from this community for everyone.`,
      cta: l`Remove`,
    },
    'remove-member': {
      title: l`Remove this member?`,
      description: l`They will lose access to this community. They could come back with a new invite.`,
      cta: l`Remove`,
    },
    ban: {
      title: l`Ban this member?`,
      description: l`They will lose access to this community and won’t be able to rejoin.`,
      cta: l({message: 'Ban', context: 'verb'}),
    },
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
          {own ? (
            <Menu.Group>
              <Menu.Item
                testID="communityPostDelete"
                label={l`Delete post`}
                onPress={() => ask('delete')}>
                <Menu.ItemText>{l`Delete post`}</Menu.ItemText>
                <Menu.ItemIcon icon={TrashIcon} />
              </Menu.Item>
            </Menu.Group>
          ) : null}
          {actions.includes('report') ? (
            <Menu.Group>
              <Menu.Item
                testID="communityPostReportHarassment"
                label={l`Report as harassment`}
                onPress={() => onReport('harassment')}>
                <Menu.ItemText>{l`Report as harassment`}</Menu.ItemText>
                <Menu.ItemIcon icon={FlagIcon} />
              </Menu.Item>
              <Menu.Item
                testID="communityPostReportSpam"
                label={l`Report as spam`}
                onPress={() => onReport('spam')}>
                <Menu.ItemText>{l`Report as spam`}</Menu.ItemText>
                <Menu.ItemIcon icon={FlagIcon} />
              </Menu.Item>
              <Menu.Item
                testID="communityPostReportOther"
                label={l`Report for something else`}
                onPress={() => onReport('other')}>
                <Menu.ItemText>{l`Report for something else`}</Menu.ItemText>
                <Menu.ItemIcon icon={FlagIcon} />
              </Menu.Item>
            </Menu.Group>
          ) : null}
          {actions.includes('block') ? (
            <Menu.Group>
              <Menu.Item
                testID="communityPostBlock"
                label={l`Block this person here`}
                onPress={() => ask('block')}>
                <Menu.ItemText>{l`Block this person here`}</Menu.ItemText>
                <Menu.ItemIcon icon={PersonXIcon} />
              </Menu.Item>
            </Menu.Group>
          ) : null}
          {actions.includes('remove-post') ? (
            <Menu.Group>
              <Menu.Item
                testID="communityPostRemove"
                label={l`Remove post`}
                onPress={() => ask('remove-post')}>
                <Menu.ItemText>{l`Remove post`}</Menu.ItemText>
                <Menu.ItemIcon icon={TrashIcon} />
              </Menu.Item>
              {actions.includes('remove-member') ? (
                <Menu.Item
                  testID="communityMemberRemove"
                  label={l`Remove member`}
                  onPress={() => ask('remove-member')}>
                  <Menu.ItemText>{l`Remove member`}</Menu.ItemText>
                  <Menu.ItemIcon icon={PersonXIcon} />
                </Menu.Item>
              ) : null}
              {actions.includes('ban') ? (
                <Menu.Item
                  testID="communityMemberBan"
                  label={l`Ban member`}
                  onPress={() => ask('ban')}>
                  <Menu.ItemText>{l`Ban member`}</Menu.ItemText>
                  <Menu.ItemIcon icon={BanIcon} />
                </Menu.Item>
              ) : null}
            </Menu.Group>
          ) : null}
        </Menu.Outer>
      </Menu.Root>
      <Prompt.Basic
        control={prompt}
        title={copy[confirm].title}
        description={copy[confirm].description}
        confirmButtonCta={copy[confirm].cta}
        confirmButtonColor="negative"
        onConfirm={onConfirm}
      />
    </>
  )
}
