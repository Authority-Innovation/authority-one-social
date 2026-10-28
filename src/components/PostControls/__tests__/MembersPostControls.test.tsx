/**
 * Render test for the controls on a members-tier post (W2-T10 fix M2).
 *
 * Renders the real PostControls with a members-uri post and checks what the
 * guard table promises at the rendered layer: reply opens the community door,
 * like is shown but not pressable, the record-backed controls (repost, quote,
 * share, bookmark, post menu) are not rendered, and nothing reaches the agent
 * or the feed-feedback channel.
 */
import {type ReactNode} from 'react'
import {type BskyAgent, RichText} from '@atproto/api'
import {beforeEach, describe, expect, it, jest} from '@jest/globals'
import {i18n} from '@lingui/core'
import {I18nProvider} from '@lingui/react'
import {fireEvent, render} from '@testing-library/react-native'

// The real #/alf barrel drags in Layout -> Dialog -> the native bottom-sheet
// module, which cannot load under jest. Style stubs are enough here.
jest.mock('#/alf', () => {
  const styleProxy: Record<string, object> = new Proxy({}, {get: () => ({})})
  const theme = {
    atoms: styleProxy,
    palette: new Proxy({}, {get: () => '#000000'}),
  }
  return {
    atoms: styleProxy,
    useTheme: () => theme,
    useBreakpoints: () => ({gtPhone: false, gtMobile: false, gtTablet: false}),
    flatten: (s: unknown) => s,
    select: () => ({}),
    web: () => ({}),
    native: (s: unknown) => s,
    ios: () => ({}),
    android: () => ({}),
    platform: () => ({}),
  }
})

jest.mock('#/components/Typography', () => {
  const {Text} = require('react-native')
  return {Text}
})

jest.mock('#/lib/haptics',() => ({useHaptics: () => () => {}}))

// Any read of the agent is recorded; a members post must cause none.
const mockAgentTouches: string[] = []
const mockAgent = new Proxy(
  {},
  {
    get(_target, prop) {
      if (typeof prop === 'string') mockAgentTouches.push(prop)
      return jest.fn()
    },
  },
) as unknown as BskyAgent
const mockRequireAuth = jest.fn((cb: () => void) => cb())
jest.mock('#/state/session', () => ({
  useAgent: () => mockAgent,
  useSession: () => ({hasSession: true, currentAccount: undefined}),
  useRequireAuth: () => mockRequireAuth,
}))

const mockSendInteraction = jest.fn()
jest.mock('#/state/feed-feedback', () => ({
  useFeedFeedbackContext: () => ({
    enabled: true,
    feedDescriptor: 'communities',
    sendInteraction: mockSendInteraction,
    onItemSeen: jest.fn(),
  }),
}))

const mockQueueLike = jest.fn()
const mockQueueRepost = jest.fn()
jest.mock('#/state/queries/post', () => ({
  usePostLikeMutationQueue: () => [mockQueueLike, mockQueueLike],
  usePostRepostMutationQueue: () => [mockQueueRepost, mockQueueRepost],
}))

const mockNavigate = jest.fn()
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: mockNavigate, push: mockNavigate}),
}))

const mockOpenComposer = jest.fn()
jest.mock('#/lib/hooks/useOpenComposer', () => ({
  useOpenComposer: () => ({openComposer: mockOpenComposer}),
}))
jest.mock('#/state/shell/progress-guide', () => ({
  ProgressGuideAction: {Like: 'like'},
  useProgressGuideControls: () => ({captureAction: jest.fn()}),
}))
jest.mock('#/analytics', () => ({
  useAnalytics: () => ({metric: jest.fn()}),
}))

// The record-backed controls. If any of these renders for a members post,
// the test fails on its testID.
jest.mock('../RepostButton', () => {
  const {View} = require('react-native')
  return {RepostButton: () => <View testID="mockRepostButton" />}
})
jest.mock('../ShareMenu', () => {
  const {View} = require('react-native')
  return {ShareMenuButton: () => <View testID="mockShareMenuButton" />}
})
jest.mock('../PostMenu', () => {
  const {View} = require('react-native')
  return {PostMenuButton: () => <View testID="mockPostMenuButton" />}
})
jest.mock('../BookmarkButton', () => {
  const {View} = require('react-native')
  return {BookmarkButton: () => <View testID="mockBookmarkButton" />}
})
jest.mock('#/lib/custom-animations/LikeIcon', () => {
  const {View} = require('react-native')
  return {AnimatedLikeIcon: () => <View testID="mockAnimatedLikeIcon" />}
})
jest.mock('#/lib/custom-animations/CountWheel', () => {
  const {View} = require('react-native')
  return {CountWheel: () => <View />}
})

import {PostControls} from '#/components/PostControls'
import {membersPostToFeedViewPost} from '#/features/communities/membersPost'

i18n.loadAndActivate({locale: 'en', messages: {}})

function Wrapper({children}: {children: ReactNode}) {
  return <I18nProvider i18n={i18n}>{children}</I18nProvider>
}

// Placeholder ids only - not a real community.
const COMMUNITY_ID = 'community-a'

function membersFeedPost() {
  const item = membersPostToFeedViewPost(
    COMMUNITY_ID,
    {
      id: 'p1',
      author: {displayName: 'Author', is_agent: false},
      body: 'members only',
      createdAt: '2026-10-28T10:00:00.000Z',
    },
    {$type: 'reasonCommunity', communityId: COMMUNITY_ID, tier: 'members'},
  )
  const post = item.post
  post.likeCount = 3
  post.replyCount = 2
  post.repostCount = 1
  return post
}

function renderControls() {
  const post = membersFeedPost()
  const onPressReply = jest.fn()
  const utils = render(
    <PostControls
      post={post as never}
      record={post.record as never}
      richText={new RichText({text: 'members only'})}
      onPressReply={onPressReply}
      logContext="FeedItem"
      feedContext="ctx"
      reqId="req"
    />,
    {wrapper: Wrapper},
  )
  return {...utils, onPressReply}
}

function isDisabled(node: {props: Record<string, unknown>}) {
  const state = node.props.accessibilityState as {disabled?: boolean}
  return state?.disabled === true || node.props['aria-disabled'] === true
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAgentTouches.length = 0
})

describe('PostControls on a members-tier post', () => {
  it('renders the members controls, not the atproto ones', () => {
    const r = renderControls()
    expect(r.getByTestId('membersReplyBtn')).toBeTruthy()
    expect(r.getByTestId('membersLikeBtn')).toBeTruthy()
    for (const id of [
      'mockRepostButton',
      'mockShareMenuButton',
      'mockPostMenuButton',
      'mockBookmarkButton',
      'mockAnimatedLikeIcon',
      'likeBtn',
      'replyBtn',
    ]) {
      expect(r.queryByTestId(id)).toBeNull()
    }
  })

  it('reply opens the community door (/c/<id>), not the composer', () => {
    const r = renderControls()
    const reply = r.getByTestId('membersReplyBtn')
    expect(isDisabled(reply)).toBe(false)
    fireEvent.press(reply)
    expect(mockNavigate).toHaveBeenCalledTimes(1)
    // The `Community` route is `/c/:id` (src/routes.ts).
    expect(mockNavigate).toHaveBeenCalledWith('Community', {id: COMMUNITY_ID})
    expect(r.onPressReply).not.toHaveBeenCalled()
    expect(mockOpenComposer).not.toHaveBeenCalled()
  })

  it('like is not pressable and queues nothing', () => {
    const r = renderControls()
    const like = r.getByTestId('membersLikeBtn')
    expect(isDisabled(like)).toBe(true)
    fireEvent.press(like)
    expect(mockQueueLike).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('no agent method and no sendInteraction is ever called', () => {
    const r = renderControls()
    fireEvent.press(r.getByTestId('membersReplyBtn'))
    fireEvent.press(r.getByTestId('membersLikeBtn'))
    expect(mockAgentTouches).toEqual([])
    expect(mockSendInteraction).not.toHaveBeenCalled()
    expect(mockQueueLike).not.toHaveBeenCalled()
    expect(mockQueueRepost).not.toHaveBeenCalled()
    expect(mockRequireAuth).not.toHaveBeenCalled()
  })

  it('control: an at:// post does render the record-backed controls', () => {
    const post = {
      ...membersFeedPost(),
      uri: 'at://did:example:a/app.bsky.feed.post/p1',
      cid: 'bafyexample',
      viewer: {},
    }
    const r = render(
      <PostControls
        post={post as never}
        record={post.record as never}
        richText={new RichText({text: 'public'})}
        onPressReply={jest.fn()}
        logContext="FeedItem"
      />,
      {wrapper: Wrapper},
    )
    expect(r.getByTestId('mockRepostButton')).toBeTruthy()
    expect(r.getByTestId('mockPostMenuButton')).toBeTruthy()
    expect(r.queryByTestId('membersReplyBtn')).toBeNull()
  })
})
