import {View} from 'react-native'
import {type AppBskyFeedDefs} from '@atproto/api'
import {Trans, useLingui} from '@lingui/react/macro'

import {type CommunityPost} from '#/lib/agent-runtime/communitiesClient'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {Lock_Stroke2_Corner0_Rounded as LockIcon} from '#/components/icons/Lock'
import {Loader} from '#/components/Loader'
import {Text} from '#/components/Typography'
import {type CommunityDescriptor, postsSource} from '../descriptor'
import {
  useCommunityPublicTimelineQuery,
  useCommunityTimelineQuery,
} from '../queries'

export function PostsSection({community}: {community: CommunityDescriptor}) {
  const source = postsSource(community)
  return (
    <View testID="communityPosts">
      {source === 'runtime' ? (
        <MembersTimeline community={community} />
      ) : source === 'group' ? (
        <PublicTimeline community={community} />
      ) : community.tier === 'public' ? (
        <EmptyPosts />
      ) : (
        <WallPlaceholder />
      )}
      {community.tier !== 'public' ? <MembersNotice /> : null}
    </View>
  )
}

function MembersTimeline({community}: {community: CommunityDescriptor}) {
  const {data, isLoading, isError} = useCommunityTimelineQuery({community})
  const posts: CommunityPost[] = data?.pages.flatMap(page => page.posts) ?? []

  if (isLoading) return <SectionLoader />
  if (isError) return <PostsError />
  if (posts.length === 0) return <EmptyPosts />
  return (
    <View testID="communityMembersTimeline">
      {posts.map(post => (
        <MemberPostRow key={post.id} post={post} community={community} />
      ))}
    </View>
  )
}

function MemberPostRow({
  post,
  community,
}: {
  post: CommunityPost
  community: CommunityDescriptor
}) {
  const t = useTheme()
  const {i18n} = useLingui()
  const authorDid = (post.author as {did?: unknown}).did
  // N1: an agent label needs both the runtime flag and the config's agent DID.
  const isAgent =
    post.author.is_agent === true &&
    !!community.agent &&
    authorDid === community.agent.did
  const created = new Date(post.createdAt)

  return (
    <View
      testID={`communityPost-${post.id}`}
      style={[
        a.flex_row,
        a.gap_sm,
        a.px_lg,
        a.py_md,
        a.border_b,
        t.atoms.border_contrast_low,
      ]}>
      <UserAvatar
        type={isAgent ? 'algo' : 'user'}
        size={40}
        avatar={post.author.avatar}
      />
      <View style={[a.flex_1, a.gap_2xs]}>
        <View style={[a.flex_row, a.align_center, a.gap_xs]}>
          <Text emoji style={[a.text_md, a.font_bold]} numberOfLines={1}>
            {post.author.displayName}
          </Text>
          {isAgent ? (
            <Text
              testID="communityPostAgentLabel"
              style={[a.text_xs, a.font_bold, {color: t.palette.primary_500}]}>
              <Trans context="label shown next to an AI agent's name">
                ◆ Agent
              </Trans>
            </Text>
          ) : null}
          {!Number.isNaN(created.getTime()) ? (
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              {i18n.date(created, {dateStyle: 'medium', timeStyle: 'short'})}
            </Text>
          ) : null}
        </View>
        <Text emoji style={[a.text_md, a.leading_snug]}>
          {post.body}
        </Text>
      </View>
    </View>
  )
}

function PublicTimeline({community}: {community: CommunityDescriptor}) {
  const {data, isLoading, isError} = useCommunityPublicTimelineQuery({
    community,
  })
  const items: AppBskyFeedDefs.FeedViewPost[] =
    data?.pages.flatMap(page => page.feed) ?? []

  if (isLoading) return <SectionLoader />
  if (isError) return <PostsError />
  if (items.length === 0) return <EmptyPosts />
  return (
    <View testID="communityPublicTimeline">
      {items.map(item => (
        <PublicPostRow key={item.post.uri} item={item} />
      ))}
    </View>
  )
}

function PublicPostRow({item}: {item: AppBskyFeedDefs.FeedViewPost}) {
  const t = useTheme()
  const {post} = item
  const record = post.record as {text?: unknown}
  const text = typeof record.text === 'string' ? record.text : ''
  return (
    <View
      style={[
        a.flex_row,
        a.gap_sm,
        a.px_lg,
        a.py_md,
        a.border_b,
        t.atoms.border_contrast_low,
      ]}>
      <UserAvatar type="user" size={40} avatar={post.author.avatar} />
      <View style={[a.flex_1, a.gap_2xs]}>
        <Text emoji style={[a.text_md, a.font_bold]} numberOfLines={1}>
          {post.author.displayName || post.author.handle}
        </Text>
        <Text emoji style={[a.text_md, a.leading_snug]}>
          {text}
        </Text>
      </View>
    </View>
  )
}

/**
 * What a non-member sees in place of a walled timeline: empty rows only. No
 * members-tier content is fetched for them, so there is nothing to blur.
 */
function WallPlaceholder() {
  const t = useTheme()
  return (
    <View testID="communityWallPlaceholder" accessible={false}>
      {[0, 1, 2].map(i => (
        <View
          key={i}
          style={[
            a.flex_row,
            a.gap_sm,
            a.px_lg,
            a.py_md,
            a.border_b,
            t.atoms.border_contrast_low,
          ]}>
          <View
            style={[
              a.rounded_full,
              t.atoms.bg_contrast_50,
              {width: 40, height: 40},
            ]}
          />
          <View style={[a.flex_1, a.gap_sm, a.pt_xs]}>
            <View
              style={[
                a.rounded_sm,
                t.atoms.bg_contrast_50,
                {height: 12, width: '40%'},
              ]}
            />
            <View
              style={[
                a.rounded_sm,
                t.atoms.bg_contrast_25,
                {height: 12, width: '90%'},
              ]}
            />
            <View
              style={[
                a.rounded_sm,
                t.atoms.bg_contrast_25,
                {height: 12, width: '70%'},
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  )
}

function MembersNotice() {
  const t = useTheme()
  return (
    <View
      testID="communityMembersNotice"
      style={[
        a.flex_row,
        a.gap_sm,
        a.m_lg,
        a.p_md,
        a.rounded_md,
        t.atoms.bg_contrast_25,
      ]}>
      <LockIcon size="sm" fill={t.atoms.text_contrast_medium.color} />
      <Text style={[a.flex_1, a.text_sm, t.atoms.text_contrast_medium]}>
        <Trans>
          Posts here are for members. They are kept in the community’s private
          store, not on the open network, so they don’t show up in public feeds
          or search.
        </Trans>
      </Text>
    </View>
  )
}

function SectionLoader() {
  return (
    <View style={[a.align_center, a.py_2xl]}>
      <Loader size="xl" />
    </View>
  )
}

function EmptyPosts() {
  const t = useTheme()
  return (
    <View style={[a.align_center, a.py_2xl, a.px_lg]}>
      <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
        <Trans>No posts yet.</Trans>
      </Text>
    </View>
  )
}

function PostsError() {
  const t = useTheme()
  return (
    <View testID="communityPostsError" style={[a.align_center, a.py_2xl]}>
      <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
        <Trans>Couldn’t load posts. Try again later.</Trans>
      </Text>
    </View>
  )
}
