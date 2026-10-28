import {memo, useMemo, useState} from 'react'
import {type StyleProp, View, type ViewStyle} from 'react-native'
import {
  type AppBskyFeedDefs,
  type AppBskyFeedPost,
  type AppBskyFeedThreadgate,
  type RichText as RichTextAPI,
} from '@atproto/api'
import {plural} from '@lingui/core/macro'
import {useLingui} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {CountWheel} from '#/lib/custom-animations/CountWheel'
import {AnimatedLikeIcon} from '#/lib/custom-animations/LikeIcon'
import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {type NavigationProp} from '#/lib/routes/types'
import {type Shadow} from '#/state/cache/types'
import {useFeedFeedbackContext} from '#/state/feed-feedback'
import {
  usePostLikeMutationQueue,
  usePostRepostMutationQueue,
} from '#/state/queries/post'
import {useRequireAuth} from '#/state/session'
import {
  ProgressGuideAction,
  useProgressGuideControls,
} from '#/state/shell/progress-guide'
import {atoms as a, useBreakpoints, useTheme} from '#/alf'
import {Heart2_Stroke2_Corner0_Rounded as HeartIconOutline} from '#/components/icons/Heart2'
import {Reply as Bubble} from '#/components/icons/Reply'
import {useFormatPostStatCount} from '#/components/PostControls/util'
import * as Skele from '#/components/Skeleton'
import * as Toast from '#/components/Toast'
import {useAnalytics} from '#/analytics'
import {isMembersPostUri} from '#/features/communities/membersPost'
import {guardPostAction} from '#/features/communities/postActionGuard'
import {BookmarkButton} from './BookmarkButton'
import {
  PostControlButton,
  PostControlButtonIcon,
  PostControlButtonText,
} from './PostControlButton'
import {PostMenuButton} from './PostMenu'
import {RepostButton} from './RepostButton'
import {ShareMenuButton} from './ShareMenu'

type PostControlsProps = {
  big?: boolean
  post: Shadow<AppBskyFeedDefs.PostView>
  record: AppBskyFeedPost.Record
  richText: RichTextAPI
  feedContext?: string | undefined
  reqId?: string | undefined
  style?: StyleProp<ViewStyle>
  onPressReply: () => void
  onPostReply?: (postUri: string | undefined) => void
  logContext: 'FeedItem' | 'PostThreadItem' | 'Post' | 'ImmersiveVideo'
  threadgateRecord?: AppBskyFeedThreadgate.Record
  onShowLess?: (interaction: AppBskyFeedDefs.Interaction) => void
  viaRepost?: {uri: string; cid: string}
  variant?: 'compact' | 'normal' | 'large'
  forceGoogleTranslate?: boolean
}

let PostControls = (props: PostControlsProps): React.ReactNode => {
  // Members-tier items are not atproto records. None of the record-backed
  // controls below may run for them (see postActionGuard.ts).
  if (isMembersPostUri(props.post.uri)) {
    return (
      <MembersPostControls
        post={props.post}
        big={props.big}
        style={props.style}
      />
    )
  }
  return <AtprotoPostControls {...props} />
}
PostControls = memo(PostControls)
export {PostControls}

/**
 * Controls for a members-tier item. Every action goes through
 * guardPostAction: `door` actions open the community screen, everything else
 * is shown disabled or not at all. Nothing here calls the agent.
 */
function MembersPostControls({
  post,
  big,
  style,
}: {
  post: AppBskyFeedDefs.PostView
  big?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const {t: l} = useLingui()
  const navigation = useNavigation<NavigationProp>()
  const formatPostStatCount = useFormatPostStatCount()
  const reply = guardPostAction(post, 'reply')
  const like = guardPostAction(post, 'like')

  const onPressReply =
    reply.kind === 'door'
      ? () => navigation.navigate('Community', {id: reply.communityId})
      : undefined

  return (
    <View
      style={[a.flex_row, a.align_center, !big && a.pt_2xs, a.gap_md, style]}>
      <View style={[a.flex_row, a.flex_1, {maxWidth: 320}]}>
        <View
          style={[
            a.flex_1,
            a.align_start,
            {marginLeft: big ? -2 : -6},
            !onPressReply ? {opacity: 0.6} : undefined,
          ]}>
          <PostControlButton
            testID="membersReplyBtn"
            onPress={onPressReply}
            disabled={!onPressReply}
            label={l({
              message: 'Reply in the community',
              comment:
                'Accessibility label for the reply button on a members-only community post. Opens the community.',
            })}
            big={big}>
            <PostControlButtonIcon icon={Bubble} />
            {typeof post.replyCount !== 'undefined' && post.replyCount > 0 && (
              <PostControlButtonText>
                {formatPostStatCount(post.replyCount)}
              </PostControlButtonText>
            )}
          </PostControlButton>
        </View>
        <View
          style={[
            a.flex_1,
            a.align_start,
            like.kind !== 'allow' ? {opacity: 0.6} : undefined,
          ]}>
          <PostControlButton
            testID="membersLikeBtn"
            big={big}
            disabled
            label={l({
              message: `Likes (${plural(post.likeCount || 0, {
                one: '# like',
                other: '# likes',
              })})`,
              comment:
                'Accessibility label for the disabled like count on a members-only community post.',
            })}>
            <PostControlButtonIcon icon={HeartIconOutline} />
            {typeof post.likeCount !== 'undefined' && post.likeCount > 0 && (
              <PostControlButtonText>
                {formatPostStatCount(post.likeCount)}
              </PostControlButtonText>
            )}
          </PostControlButton>
        </View>
        <View />
      </View>
    </View>
  )
}

let AtprotoPostControls = ({
  big,
  post,
  record,
  richText,
  feedContext,
  reqId,
  style,
  onPressReply,
  onPostReply,
  logContext,
  threadgateRecord,
  onShowLess,
  viaRepost,
  variant,
  forceGoogleTranslate = false,
}: PostControlsProps): React.ReactNode => {
  const ax = useAnalytics()
  const t = useTheme()
  const {t: l} = useLingui()
  const {openComposer} = useOpenComposer()
  const {feedDescriptor} = useFeedFeedbackContext()
  const [queueLike, queueUnlike] = usePostLikeMutationQueue(
    post,
    viaRepost,
    feedDescriptor,
    logContext,
  )
  const [queueRepost, queueUnrepost] = usePostRepostMutationQueue(
    post,
    viaRepost,
    feedDescriptor,
    logContext,
  )
  const requireAuth = useRequireAuth()
  const {sendInteraction} = useFeedFeedbackContext()
  const {captureAction} = useProgressGuideControls()
  const isBlocked = Boolean(
    post.author.viewer?.blocking ||
    post.author.viewer?.blockedBy ||
    post.author.viewer?.blockingByList,
  )
  const replyDisabled = post.viewer?.replyDisabled
  const {gtPhone} = useBreakpoints()
  const formatPostStatCount = useFormatPostStatCount()

  const [hasLikeIconBeenToggled, setHasLikeIconBeenToggled] = useState(false)

  const onPressToggleLike = async () => {
    if (isBlocked) {
      Toast.show(l`Cannot interact with a blocked user`, {
        type: 'warning',
      })
      return
    }

    try {
      setHasLikeIconBeenToggled(true)
      if (!post.viewer?.like) {
        sendInteraction({
          item: post.uri,
          event: 'app.bsky.feed.defs#interactionLike',
          feedContext,
          reqId,
        })
        captureAction(ProgressGuideAction.Like)
        await queueLike()
      } else {
        await queueUnlike()
      }
    } catch (err) {
      const e = err as Error
      if (e?.name !== 'AbortError') {
        throw e
      }
    }
  }

  const onRepost = async () => {
    if (isBlocked) {
      Toast.show(l`Cannot interact with a blocked user`, {
        type: 'warning',
      })
      return
    }

    try {
      if (!post.viewer?.repost) {
        sendInteraction({
          item: post.uri,
          event: 'app.bsky.feed.defs#interactionRepost',
          feedContext,
          reqId,
        })
        await queueRepost()
      } else {
        await queueUnrepost()
      }
    } catch (err) {
      const e = err as Error
      if (e?.name !== 'AbortError') {
        throw e
      }
    }
  }

  const onQuote = () => {
    if (isBlocked) {
      Toast.show(l`Cannot interact with a blocked user`, {
        type: 'warning',
      })
      return
    }

    sendInteraction({
      item: post.uri,
      event: 'app.bsky.feed.defs#interactionQuote',
      feedContext,
      reqId,
    })
    ax.metric('post:clickQuotePost', {
      uri: post.uri,
      authorDid: post.author.did,
      logContext,
      feedDescriptor,
    })
    openComposer({
      quote: post,
      onPost: onPostReply,
      logContext: 'QuotePost',
    })
  }

  const onShare = () => {
    sendInteraction({
      item: post.uri,
      event: 'app.bsky.feed.defs#interactionShare',
      feedContext,
      reqId,
    })
  }

  const secondaryControlSpacingStyles = useSecondaryControlSpacingStyles({
    variant,
    big,
    gtPhone,
  })

  return (
    <View
      style={[
        a.flex_row,
        a.justify_between,
        a.align_center,
        !big && a.pt_2xs,
        a.gap_md,
        style,
      ]}>
      <View style={[a.flex_row, a.flex_1, {maxWidth: 320}]}>
        <View
          style={[
            a.flex_1,
            a.align_start,
            {marginLeft: big ? -2 : -6},
            replyDisabled ? {opacity: 0.6} : undefined,
          ]}>
          <PostControlButton
            testID="replyBtn"
            onPress={
              !replyDisabled
                ? () =>
                    requireAuth(() => {
                      ax.metric('post:clickReply', {
                        uri: post.uri,
                        authorDid: post.author.did,
                        logContext,
                        feedDescriptor,
                      })
                      onPressReply()
                    })
                : undefined
            }
            label={l({
              message: `Reply (${plural(post.replyCount || 0, {
                one: '# reply',
                other: '# replies',
              })})`,
              comment:
                'Accessibility label for the reply button, verb form followed by number of replies and noun form',
            })}
            big={big}>
            <PostControlButtonIcon icon={Bubble} />
            {typeof post.replyCount !== 'undefined' && post.replyCount > 0 && (
              <PostControlButtonText>
                {formatPostStatCount(post.replyCount)}
              </PostControlButtonText>
            )}
          </PostControlButton>
        </View>
        <View style={[a.flex_1, a.align_start]}>
          <RepostButton
            isReposted={!!post.viewer?.repost}
            repostCount={(post.repostCount ?? 0) + (post.quoteCount ?? 0)}
            onRepost={() => void onRepost()}
            onQuote={onQuote}
            big={big}
            embeddingDisabled={Boolean(post.viewer?.embeddingDisabled)}
          />
        </View>
        <View style={[a.flex_1, a.align_start]}>
          <PostControlButton
            testID="likeBtn"
            big={big}
            active={Boolean(post.viewer?.like)}
            activeColor={t.palette.pink}
            onPress={() => requireAuth(() => onPressToggleLike())}
            label={
              post.viewer?.like
                ? l({
                    message: `Unlike (${plural(post.likeCount || 0, {
                      one: '# like',
                      other: '# likes',
                    })})`,
                    comment:
                      'Accessibility label for the like button when the post has been liked, verb followed by number of likes and noun',
                  })
                : l({
                    message: `Like (${plural(post.likeCount || 0, {
                      one: '# like',
                      other: '# likes',
                    })})`,
                    comment:
                      'Accessibility label for the like button when the post has not been liked, verb form followed by number of likes and noun form',
                  })
            }>
            <AnimatedLikeIcon
              isLiked={Boolean(post.viewer?.like)}
              big={big}
              hasBeenToggled={hasLikeIconBeenToggled}
            />
            <CountWheel
              count={post.likeCount ?? 0}
              isToggled={Boolean(post.viewer?.like)}
              hasBeenToggled={hasLikeIconBeenToggled}
              renderCount={({count}) => (
                <PostControlButtonText testID="likeCount">
                  {formatPostStatCount(count)}
                </PostControlButtonText>
              )}
            />
          </PostControlButton>
        </View>
        {/* Spacer! */}
        <View />
      </View>
      <View style={[a.flex_row, a.justify_end, secondaryControlSpacingStyles]}>
        <BookmarkButton
          post={post}
          big={big}
          logContext={logContext}
          hitSlop={{
            right: secondaryControlSpacingStyles.gap / 2,
          }}
        />
        <ShareMenuButton
          testID="postShareBtn"
          post={post}
          big={big}
          record={record}
          richText={richText}
          timestamp={post.indexedAt}
          threadgateRecord={threadgateRecord}
          onShare={onShare}
          hitSlop={{
            left: secondaryControlSpacingStyles.gap / 2,
            right: secondaryControlSpacingStyles.gap / 2,
          }}
          logContext={logContext}
        />
        <PostMenuButton
          testID="postDropdownBtn"
          post={post}
          postFeedContext={feedContext}
          postReqId={reqId}
          big={big}
          record={record}
          richText={richText}
          timestamp={post.indexedAt}
          threadgateRecord={threadgateRecord}
          onShowLess={onShowLess}
          hitSlop={{
            left: secondaryControlSpacingStyles.gap / 2,
          }}
          logContext={logContext}
          forceGoogleTranslate={forceGoogleTranslate}
        />
      </View>
    </View>
  )
}
AtprotoPostControls = memo(AtprotoPostControls)

export function PostControlsSkeleton({
  big,
  style,
  variant,
}: {
  big?: boolean
  style?: StyleProp<ViewStyle>
  variant?: 'compact' | 'normal' | 'large'
}) {
  const {gtPhone} = useBreakpoints()

  const rowHeight = big ? 32 : 28
  const padding = 4
  const size = rowHeight - padding * 2

  const secondaryControlSpacingStyles = useSecondaryControlSpacingStyles({
    variant,
    big,
    gtPhone,
  })

  const itemStyles = {
    padding,
  }

  return (
    <Skele.Row
      style={[a.flex_row, a.justify_between, a.align_center, a.gap_md, style]}>
      <View style={[a.flex_row, a.flex_1, {maxWidth: 320}]}>
        <View
          style={[itemStyles, a.flex_1, a.align_start, {marginLeft: -padding}]}>
          <Skele.Pill blend size={size} />
        </View>

        <View style={[itemStyles, a.flex_1, a.align_start]}>
          <Skele.Pill blend size={size} />
        </View>

        <View style={[itemStyles, a.flex_1, a.align_start]}>
          <Skele.Pill blend size={size} />
        </View>
      </View>
      <View style={[a.flex_row, a.justify_end, secondaryControlSpacingStyles]}>
        <View style={itemStyles}>
          <Skele.Circle blend size={size} />
        </View>
        <View style={itemStyles}>
          <Skele.Circle blend size={size} />
        </View>
        <View style={itemStyles}>
          <Skele.Circle blend size={size} />
        </View>
      </View>
    </Skele.Row>
  )
}

function useSecondaryControlSpacingStyles({
  variant,
  big,
  gtPhone,
}: {
  variant?: 'compact' | 'normal' | 'large'
  big?: boolean
  gtPhone: boolean
}) {
  return useMemo(() => {
    let gap = 0 // default, we want `gap` to be defined on the resulting object
    if (variant !== 'compact') gap = a.gap_xs.gap
    if (big || gtPhone) gap = a.gap_sm.gap
    return {gap}
  }, [variant, big, gtPhone])
}
