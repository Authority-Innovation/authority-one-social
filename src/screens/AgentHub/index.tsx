import {useState} from 'react'
import {ActivityIndicator, Pressable, View} from 'react-native'
import {type AppBskyActorDefs} from '@atproto/api'
import {Trans, useLingui} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {
  type AgentConversation,
  conversationOpenKind,
  type OwnerAgent,
} from '#/lib/agent-runtime'
import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {useGetTimeAgo} from '#/lib/hooks/useTimeAgo'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {sanitizeHandle} from '#/lib/strings/handles'
import {useProfileShadow} from '#/state/cache/profile-shadow'
import {
  useAgentConversationsQuery,
  useMarkThreadReadMutation,
} from '#/state/queries/agent-conversations'
import {
  type AgentIdentity,
  useAgentGroupThreadsQuery,
} from '#/state/queries/agent-threads'
import {
  useOwnedAgent,
  useOwnerAgentsQuery,
  usePauseOwnerAgentMutation,
} from '#/state/queries/agents'
import {useProfileQuery} from '#/state/queries/profile'
import {useThreadsQuery} from '#/state/queries/threads'
import {useSession} from '#/state/session'
import {PostFeed} from '#/view/com/posts/PostFeed'
import {EmptyState} from '#/view/com/util/EmptyState'
import {channelBadge} from '#/screens/AgentChat/channelBadge'
import {AgentProfileDialog} from '#/screens/Settings/PersonaSettings/AgentProfileDialog'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {ChevronRight_Stroke2_Corner0_Rounded as ChevronIcon} from '#/components/icons/Chevron'
import {EditBig_Stroke1_Corner0_Rounded as EditIcon} from '#/components/icons/EditBig'
import {Message_Stroke2_Corner0_Rounded as MessageIcon} from '#/components/icons/Message'
import {Pause_Stroke2_Corner0_Rounded as PauseIcon} from '#/components/icons/Pause'
import {PersonGroup_Stroke2_Corner2_Rounded as GroupIcon} from '#/components/icons/Person'
import {Play_Stroke2_Corner0_Rounded as PlayIcon} from '#/components/icons/Play'
import * as Layout from '#/components/Layout'
import {TalkToAgentButton} from '#/components/TalkToAgent/TalkToAgentButton'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {AgentAvatar} from '#/features/agentGrid/AgentAvatar'
import {LiveBadge} from '#/features/agentGrid/LiveBadge'
import {AssetGalleryTab} from './AssetGalleryTab'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'AgentHub'>

type HubTab = 'messages' | 'gallery' | 'posts' | 'profile' | 'settings'

/**
 * The per-agent hub: ONE place per agent with a top tab strip
 * [Messages | Posts | Profile | Settings].
 *
 * - Messages (default): the WhatsApp-style list of this agent's conversations —
 *   the pinned 1:1 chat plus every group thread the agent is a member of, with
 *   any live drop-in room pinned to the top.
 * - Posts: the agent's author feed (existing feed componentry).
 * - Profile: the agent's public identity.
 * - Settings: owner-only management (hidden for agents the viewer doesn't own).
 *
 * Unlike the previous owner-only hub, the screen now renders for ANY agent —
 * ownership (the /app/agents roster) gates the management surfaces (Settings
 * tab, Post-as, profile editing, the delegation chip), not the screen itself.
 */
export function AgentHubScreen({route}: Props) {
  const agentRef = route.params.agent
  return <AgentHubInner key={agentRef} agentRef={agentRef} />
}

function AgentHubInner({agentRef}: {agentRef: string}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const {currentAccount} = useSession()
  const {isLoading: rosterLoading} = useOwnerAgentsQuery()
  const agent = useOwnedAgent(agentRef)
  const owned = !!agent
  // Enrich from the agent's atproto profile: avatar + display name + the
  // authoritative DID (runtime rows may omit `did`). For non-owned agents the
  // profile is the ONLY identity source.
  const {data: profile, isLoading: profileLoading} = useProfileQuery({
    did: agent?.did ?? agent?.handle ?? agentRef,
  })
  const [tab, setTab] = useState<HubTab>('messages')

  if ((rosterLoading || profileLoading) && !agent && !profile) {
    return (
      <HubShell title={l`Agent`}>
        <View style={[a.flex_1, a.align_center, a.justify_center]}>
          <ActivityIndicator />
        </View>
      </HubShell>
    )
  }

  const handle = agent?.handle ?? profile?.handle
  if (!handle) {
    return (
      <HubShell title={l`Agent`}>
        <View style={[a.px_lg, a.py_2xl, a.gap_sm]}>
          <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
            <Trans>This agent is unavailable right now</Trans>
          </Text>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            <Trans>Check the address, or try again in a moment.</Trans>
          </Text>
        </View>
      </HubShell>
    )
  }

  const did = profile?.did ?? agent?.did
  const identity: AgentIdentity = {handle, did}
  const displayName = profile?.displayName || agent?.displayName || handle
  const avatar = profile?.avatar ?? agent?.avatar
  const ownerLabel = currentAccount?.handle
    ? sanitizeHandle(currentAccount.handle, '@')
    : 'you'

  return (
    <HubShell title={displayName}>
      {/* Hub header: who this agent is (+ the delegation chip when owned). */}
      <View style={[a.px_lg, a.pt_sm, a.gap_sm]}>
        <View style={[a.flex_row, a.align_center, a.gap_md]}>
          <AgentAvatar
            handle={handle}
            displayName={displayName}
            avatar={avatar}
            size={48}
          />
          <View style={[a.flex_1]}>
            <View style={[a.flex_row, a.align_center, a.gap_sm]}>
              <Text
                emoji
                style={[a.text_lg, a.font_bold, t.atoms.text]}
                numberOfLines={1}>
                {displayName}
              </Text>
              {agent ? <HubStatusBadge agent={agent} /> : null}
            </View>
            <Text
              style={[a.text_sm, t.atoms.text_contrast_medium]}
              numberOfLines={1}>
              {sanitizeHandle(handle, '@')}
            </Text>
          </View>
        </View>
        {owned ? (
          // Persistent delegation chip: managing, not signed in as.
          <View
            style={[
              a.self_start,
              a.rounded_full,
              a.px_md,
              a.py_xs,
              t.atoms.bg_contrast_25,
            ]}>
            <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
              {/* Plain literal: interpolated custom strings render their raw ICU
                  placeholders under the uncompiled catalog (the "Managing
                  {displayName}" bug Elliott hit live). */}
              {`Managing ${displayName} — you are still ${ownerLabel}`}
            </Text>
          </View>
        ) : null}
      </View>

      <HubTabBar tab={tab} onSelect={setTab} showSettings={owned} />

      <View style={[a.flex_1]}>
        {tab === 'gallery' && owned ? (
          <AssetGalleryTab agentHandle={handle} displayName={displayName} />
        ) : tab === 'messages' ? (
          <MessagesTab
            identity={identity}
            displayName={displayName}
            avatar={avatar}
            owned={owned}
            profile={profile}
          />
        ) : tab === 'posts' ? (
          <PostsTab
            agent={agent}
            displayName={displayName}
            did={did}
            owned={owned}
          />
        ) : tab === 'profile' ? (
          <ProfileTab
            handle={handle}
            owned={owned}
            displayName={displayName}
            avatar={avatar}
            description={profile?.description}
          />
        ) : agent ? (
          <SettingsTab agent={agent} displayName={displayName} />
        ) : null}
      </View>
    </HubShell>
  )
}

function HubShell({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Layout.Screen>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>{title}</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      {/* Layout.Screen does NOT constrain width — on desktop web the side navs
          are position:fixed and screens are expected to self-center via
          Layout.Center/Content (Header.Outer does its own). Without this the
          hub header/tabs/content span the full window and paint under both
          navs. flex_1 so tab content can fill to the bottom. */}
      <Layout.Center style={[a.flex_1]}>{children}</Layout.Center>
    </Layout.Screen>
  )
}

function HubTabBar({
  tab,
  onSelect,
  showSettings,
}: {
  tab: HubTab
  onSelect: (tab: HubTab) => void
  showSettings: boolean
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const tabs: {key: HubTab; label: string}[] = [
    {key: 'messages', label: l`Messages`},
  ]
  // Gallery + Settings are owner-only surfaces (the asset ledger is behind the
  // same ownership gate as conversations), so they only show for owned agents.
  if (showSettings) {
    tabs.push({key: 'gallery', label: l`Gallery`})
  }
  tabs.push({key: 'posts', label: l`Posts`})
  tabs.push({key: 'profile', label: l`Profile`})
  if (showSettings) {
    tabs.push({key: 'settings', label: l`Settings`})
  }
  return (
    <View
      style={[a.flex_row, a.mt_sm, a.border_b, t.atoms.border_contrast_low]}>
      {tabs.map(({key, label}) => {
        const active = key === tab
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityHint=""
            accessibilityState={{selected: active}}
            onPress={() => onSelect(key)}
            style={[
              a.flex_1,
              a.align_center,
              a.py_sm,
              active && [
                a.border_b,
                {
                  borderBottomWidth: 2,
                  borderBottomColor: t.palette.primary_500,
                  marginBottom: -1,
                },
              ],
            ]}>
            <Text
              style={[
                a.text_sm,
                active ? a.font_bold : undefined,
                active ? t.atoms.text : t.atoms.text_contrast_medium,
              ]}>
              {label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/**
 * The Messages tab (default): this agent's conversations, WhatsApp-style.
 * OWNED agents read from the unified cross-channel conversations endpoint
 * (GET /app/agents/:agent/conversations) — in-app threads and groups,
 * per-channel 1:1 mirrors (SMS/WhatsApp/iMessage/voice), and legacy Twilio
 * SMS groups, all with real previews and unread counts. Live rooms pin to
 * the top; the 1:1 chat rides as a pinned row. Opening a row marks it read.
 * NON-OWNED agents fall back to shared groups resolved from thread rosters
 * (the conversations endpoint is behind the ownership gate) plus the public
 * Talk-to entry.
 */
function MessagesTab({
  identity,
  displayName,
  avatar,
  owned,
  profile,
}: {
  identity: AgentIdentity
  displayName: string
  avatar?: string
  owned: boolean
  profile?: AppBskyActorDefs.ProfileViewDetailed
}) {
  if (owned) {
    return (
      <OwnedMessagesTab
        identity={identity}
        displayName={displayName}
        avatar={avatar}
      />
    )
  }
  return (
    <SharedMessagesTab
      identity={identity}
      displayName={displayName}
      profile={profile}
    />
  )
}

function OwnedMessagesTab({
  identity,
  displayName,
  avatar,
}: {
  identity: AgentIdentity
  displayName: string
  avatar?: string
}) {
  const navigation = useNavigation<NavigationProp>()
  const {data: conversations, isLoading} = useAgentConversationsQuery(
    identity.handle,
  )
  // Live-room flags still ride on the threads list (thread.live); the
  // conversations rows carry no live field yet.
  const {data: threadsData} = useThreadsQuery()
  const markRead = useMarkThreadReadMutation()

  const liveIds = new Set(
    (threadsData?.threads ?? [])
      .filter(th => th.live === true)
      .map(th => th.id),
  )
  const rows = conversations ?? []
  // The in-app 1:1 renders as the pinned DirectChatRow, not a list row.
  const direct = rows.find(
    c => conversationOpenKind(c) === 'direct' && c.channel === 'app',
  )
  const rest = rows.filter(c => c !== direct)
  const sorted = [
    ...rest.filter(c => liveIds.has(c.id)),
    ...rest.filter(c => !liveIds.has(c.id)),
  ]
  const unavailable = !isLoading && conversations === undefined

  const open = (c: AgentConversation) => {
    if (c.unreadCount > 0) {
      markRead.mutate({id: c.id, agent: identity.handle})
    }
    const kind = conversationOpenKind(c)
    if (kind === 'sms-mirror') {
      navigation.navigate('MessagesSmsGroupThread', {sid: c.id, name: c.name})
    } else if (kind === 'thread') {
      navigation.navigate('AgentChat', {threadId: c.id, threadTitle: c.name})
    } else {
      // Per-channel 1:1 mirrors and the in-app 1:1 all render in the unified
      // AgentChat buffer (turns carry their own channel badges there).
      navigation.navigate('AgentChat', {agent: identity.handle})
    }
  }

  return (
    <View style={[a.flex_1]}>
      <DirectChatRow
        identity={identity}
        displayName={displayName}
        avatar={avatar}
        preview={direct?.lastMessage?.text}
        unreadCount={direct?.unreadCount ?? 0}
        onPress={() => {
          if (direct && direct.unreadCount > 0) {
            markRead.mutate({id: direct.id, agent: identity.handle})
          }
          navigation.navigate('AgentChat', {agent: identity.handle})
        }}
      />

      {isLoading && rows.length === 0 ? (
        <View style={[a.py_lg, a.align_center]}>
          <ActivityIndicator />
        </View>
      ) : unavailable ? (
        <MessagesNote text="Messages are unavailable right now." />
      ) : sorted.length === 0 ? (
        <MessagesNote
          text={`No messages with ${displayName} yet. Start a group from Chats.`}
        />
      ) : (
        sorted.map(c => (
          <ConversationRow
            key={c.id}
            conversation={c}
            live={liveIds.has(c.id)}
            onPress={() => open(c)}
          />
        ))
      )}
    </View>
  )
}

function SharedMessagesTab({
  identity,
  displayName,
  profile,
}: {
  identity: AgentIdentity
  displayName: string
  profile?: AppBskyActorDefs.ProfileViewDetailed
}) {
  const navigation = useNavigation<NavigationProp>()
  const {groups, isLoading, unavailable} = useAgentGroupThreadsQuery(identity)

  return (
    <View style={[a.flex_1]}>
      {profile ? (
        <View style={[a.px_lg, a.py_md, a.flex_row]}>
          <PublicTalkEntry profile={profile} />
        </View>
      ) : null}

      {isLoading && groups.length === 0 ? (
        <View style={[a.py_lg, a.align_center]}>
          <ActivityIndicator />
        </View>
      ) : groups.length === 0 ? (
        <MessagesNote
          text={
            unavailable
              ? 'Messages are unavailable right now.'
              : `No shared messages with ${displayName} yet.`
          }
        />
      ) : (
        groups.map(group => (
          <GroupRow
            key={group.id}
            title={group.title}
            lastMessage={group.lastMessage}
            updatedAt={group.updatedAt}
            unreadCount={group.unreadCount}
            live={group.live === true}
            onPress={() =>
              navigation.navigate('AgentChat', {
                threadId: group.id,
                threadTitle: group.title,
              })
            }
          />
        ))
      )}
    </View>
  )
}

/** Quiet inline note. Text arrives as a plain literal (custom strings). */
function MessagesNote({text}: {text: string}) {
  const t = useTheme()
  return (
    <View style={[a.px_lg, a.py_md]}>
      <Text style={[a.text_sm, t.atoms.text_contrast_low]}>{text}</Text>
    </View>
  )
}

/**
 * One unified conversation row: kind icon, name, channel badge, last-message
 * preview, relative time, unread pill. Live rooms show the live treatment.
 */
function ConversationRow({
  conversation: c,
  live,
  onPress,
}: {
  conversation: AgentConversation
  live: boolean
  onPress: () => void
}) {
  const t = useTheme()
  const timeAgo = useGetTimeAgo()
  const badge = channelBadge(c.channel)
  const Icon = c.kind === 'group' ? GroupIcon : MessageIcon
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${c.name}`}
      accessibilityHint=""
      onPress={onPress}
      style={[
        a.flex_row,
        a.align_center,
        a.gap_md,
        a.px_lg,
        a.py_md,
        a.border_b,
        t.atoms.border_contrast_low,
      ]}>
      <View
        style={[
          a.rounded_full,
          a.align_center,
          a.justify_center,
          {
            width: 46,
            height: 46,
            backgroundColor: live
              ? t.palette.positive_50
              : t.atoms.bg_contrast_25.backgroundColor,
          },
        ]}>
        <Icon
          size="lg"
          fill={
            live ? t.palette.positive_600 : t.atoms.text_contrast_medium.color
          }
        />
      </View>
      <View style={[a.flex_1]}>
        <View style={[a.flex_row, a.align_center, a.gap_sm]}>
          <Text
            emoji
            style={[a.flex_1, a.text_md, a.font_bold, t.atoms.text]}
            numberOfLines={1}>
            {c.name}
          </Text>
          {badge ? (
            <Text style={[a.text_xs, t.atoms.text_contrast_low]}>
              {badge.label}
            </Text>
          ) : null}
          {live ? (
            <LiveBadge />
          ) : c.updatedAt ? (
            <Text style={[a.text_xs, t.atoms.text_contrast_low]}>
              {timeAgo(c.updatedAt, new Date())}
            </Text>
          ) : null}
        </View>
        <Text
          style={[a.text_sm, t.atoms.text_contrast_medium]}
          numberOfLines={1}>
          {live ? 'Open — drop in' : (c.lastMessage?.text ?? ' ')}
        </Text>
      </View>
      {c.unreadCount > 0 ? (
        <View
          style={[
            a.rounded_full,
            a.px_sm,
            {paddingVertical: 2, backgroundColor: t.palette.primary_500},
          ]}>
          <Text style={[a.text_xs, a.font_bold, {color: t.palette.white}]}>
            {c.unreadCount > 99 ? '99+' : `${c.unreadCount}`}
          </Text>
        </View>
      ) : null}
    </Pressable>
  )
}

/** The pinned 1:1 conversation with an owned agent — always first in Messages. */
function DirectChatRow({
  identity,
  displayName,
  avatar,
  preview,
  unreadCount = 0,
  onPress,
}: {
  identity: AgentIdentity
  displayName: string
  avatar?: string
  /** Real last-message preview from the unified conversations row, when known. */
  preview?: string
  unreadCount?: number
  onPress: () => void
}) {
  const t = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Chat with ${displayName}`}
      accessibilityHint="Opens your direct conversation with this agent"
      onPress={onPress}
      style={[
        a.flex_row,
        a.align_center,
        a.gap_md,
        a.px_lg,
        a.py_md,
        a.border_b,
        t.atoms.border_contrast_low,
      ]}>
      <AgentAvatar
        handle={identity.handle}
        displayName={displayName}
        avatar={avatar}
        size={46}
      />
      <View style={[a.flex_1]}>
        <Text
          emoji
          style={[a.text_md, a.font_bold, t.atoms.text]}
          numberOfLines={1}>
          {`Chat with ${displayName}`}
        </Text>
        {preview ? (
          <Text
            emoji
            style={[a.text_sm, t.atoms.text_contrast_medium]}
            numberOfLines={1}>
            {preview}
          </Text>
        ) : (
          <Text
            style={[a.text_sm, t.atoms.text_contrast_medium]}
            numberOfLines={1}>
            <Trans>Your direct conversation</Trans>
          </Text>
        )}
      </View>
      {unreadCount > 0 ? (
        <View
          style={[
            a.rounded_full,
            a.px_sm,
            {paddingVertical: 2, backgroundColor: t.palette.primary_500},
          ]}>
          <Text style={[a.text_xs, a.font_bold, {color: t.palette.white}]}>
            {unreadCount > 99 ? '99+' : `${unreadCount}`}
          </Text>
        </View>
      ) : (
        <MessageIcon size="md" fill={t.atoms.text_contrast_low.color} />
      )}
    </Pressable>
  )
}

/** Public Talk-to entry for agents the viewer doesn't own (metered visitor chat). */
function PublicTalkEntry({
  profile,
}: {
  profile: AppBskyActorDefs.ProfileViewDetailed
}) {
  const shadowed = useProfileShadow(profile)
  return <TalkToAgentButton profile={shadowed} />
}

/** One group conversation row: avatar circle, name, preview, time / live pin. */
function GroupRow({
  title,
  lastMessage,
  updatedAt,
  unreadCount,
  live,
  onPress,
}: {
  title: string
  lastMessage?: string
  updatedAt: number
  unreadCount: number
  live: boolean
  onPress: () => void
}) {
  const t = useTheme()
  const timeAgo = useGetTimeAgo()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${title}`}
      accessibilityHint=""
      onPress={onPress}
      style={[
        a.flex_row,
        a.align_center,
        a.gap_md,
        a.px_lg,
        a.py_md,
        a.border_b,
        t.atoms.border_contrast_low,
      ]}>
      <View
        style={[
          a.rounded_full,
          a.align_center,
          a.justify_center,
          {
            width: 46,
            height: 46,
            backgroundColor: live
              ? t.palette.positive_50
              : t.atoms.bg_contrast_25.backgroundColor,
          },
        ]}>
        <GroupIcon
          size="lg"
          fill={
            live ? t.palette.positive_600 : t.atoms.text_contrast_medium.color
          }
        />
      </View>
      <View style={[a.flex_1]}>
        <View style={[a.flex_row, a.align_center, a.gap_sm]}>
          <Text
            emoji
            style={[a.flex_1, a.text_md, a.font_bold, t.atoms.text]}
            numberOfLines={1}>
            {title}
          </Text>
          {live ? (
            <LiveBadge />
          ) : updatedAt > 0 ? (
            <Text style={[a.text_xs, t.atoms.text_contrast_low]}>
              {timeAgo(updatedAt, new Date())}
            </Text>
          ) : null}
        </View>
        <Text
          style={[a.text_sm, t.atoms.text_contrast_medium]}
          numberOfLines={1}>
          {live ? 'Open — drop in' : (lastMessage ?? ' ')}
        </Text>
      </View>
      {unreadCount > 0 ? (
        <View
          style={[
            a.rounded_full,
            a.px_sm,
            {paddingVertical: 2, backgroundColor: t.palette.primary_500},
          ]}>
          <Text style={[a.text_xs, a.font_bold, {color: t.palette.white}]}>
            {unreadCount > 99 ? '99+' : `${unreadCount}`}
          </Text>
        </View>
      ) : null}
    </Pressable>
  )
}

/**
 * The agent's published posts — the existing author-feed componentry pointed at
 * the agent's DID (the AppView serves any DID's feed; reads need nothing new).
 * Owner controls ride the normal post "•••" menu (ownedAgentDids check), and
 * "Post as <Agent>" (owners only) opens the composer in postAs mode — verbatim,
 * via the ownership-scoped runtime endpoint, no LLM.
 */
function PostsTab({
  agent,
  displayName,
  did,
  owned,
}: {
  agent?: OwnerAgent
  displayName: string
  did?: string
  owned: boolean
}) {
  const t = useTheme()
  const {openComposer} = useOpenComposer()

  if (!did) {
    return (
      <View style={[a.px_lg, a.py_2xl]}>
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          <Trans>Could not resolve this agent’s posts right now.</Trans>
        </Text>
      </View>
    )
  }

  return (
    <View style={[a.flex_1]}>
      {owned && agent ? (
        <View style={[a.px_lg, a.py_sm, a.flex_row]}>
          {/* Plain literals: interpolated custom strings break (raw ICU
              placeholders) under the uncompiled catalog. */}
          <Button
            label={`Post as ${displayName}`}
            size="small"
            variant="solid"
            color="primary"
            onPress={() =>
              openComposer({
                postAs: {
                  did,
                  handle: agent.handle,
                  displayName: agent.displayName,
                  avatar: agent.avatar,
                },
                logContext: 'Other',
              })
            }>
            <ButtonIcon icon={EditIcon} />
            <ButtonText>{`Post as ${displayName}`}</ButtonText>
          </Button>
        </View>
      ) : null}
      <View style={[a.flex_1]}>
        <PostFeed
          testID="agentHubPostsFeed"
          feed={`author|${did}|posts_and_author_threads`}
          disablePoll
          renderEmptyState={() => (
            <EmptyState
              icon={EditIcon}
              message={
                owned
                  ? `No posts yet. Post as ${displayName} to get started.`
                  : `${displayName} hasn’t posted yet.`
              }
            />
          )}
        />
      </View>
    </View>
  )
}

/**
 * The agent's public identity. Owners get the existing profile editor (display
 * name, bio, avatar, banner -> the agent's PDS profile record via
 * /app/agents/profile); everyone gets a link to the full profile screen.
 */
function ProfileTab({
  handle,
  owned,
  displayName,
  avatar,
  description,
}: {
  handle: string
  owned: boolean
  displayName: string
  avatar?: string
  description?: string
}) {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const editControl = Dialog.useDialogControl()

  return (
    <View style={[a.px_lg, a.py_lg, a.gap_lg]}>
      <View style={[a.flex_row, a.align_center, a.gap_md]}>
        <AgentAvatar
          handle={handle}
          displayName={displayName}
          avatar={avatar}
          size={64}
        />
        <View style={[a.flex_1]}>
          <Text emoji style={[a.text_lg, a.font_bold, t.atoms.text]}>
            {displayName}
          </Text>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            {sanitizeHandle(handle, '@')}
          </Text>
        </View>
      </View>
      {description ? (
        <Text emoji style={[a.text_sm, t.atoms.text]}>
          {description}
        </Text>
      ) : (
        <Text style={[a.text_sm, t.atoms.text_contrast_low]}>
          <Trans>No bio yet.</Trans>
        </Text>
      )}
      <Button
        label={`View ${displayName}’s full profile`}
        size="large"
        variant="solid"
        color="secondary"
        onPress={() => navigation.navigate('Profile', {name: handle})}>
        <ButtonText>
          <Trans>View full profile</Trans>
        </ButtonText>
        <ButtonIcon icon={ChevronIcon} />
      </Button>
      {owned ? (
        <>
          <Button
            label={`Edit ${displayName}’s profile`}
            size="large"
            variant="solid"
            color="primary"
            onPress={() => editControl.open()}>
            <ButtonIcon icon={EditIcon} />
            <ButtonText>
              <Trans>Edit profile</Trans>
            </ButtonText>
          </Button>
          <AgentProfileDialog control={editControl} agent={handle} />
        </>
      ) : null}
    </View>
  )
}

/** Links into the existing per-agent settings surfaces + the pause toggle. */
function SettingsTab({
  agent,
  displayName,
}: {
  agent: OwnerAgent
  displayName: string
}) {
  const {t: l} = useLingui()
  const navigation = useNavigation<NavigationProp>()
  const pause = usePauseOwnerAgentMutation()
  const paused = agent.paused === true

  const onTogglePause = () => {
    pause.mutate(
      {agent: agent.handle, paused: !paused},
      {
        onSuccess: res => {
          if (res.ok) return
          Toast.show(
            res.code === 'not-your-agent'
              ? l`That agent isn’t linked to your account.`
              : (res.error ?? l`Could not update the agent.`),
            {type: 'error'},
          )
        },
      },
    )
  }

  return (
    <View style={[a.px_lg, a.py_lg, a.gap_md]}>
      <SettingsLink
        label={l`Agent settings`}
        onPress={() =>
          navigation.navigate('PersonaSettings', {agent: agent.handle})
        }
      />
      <SettingsLink
        label={l`Social autonomy`}
        onPress={() =>
          navigation.navigate('SocialAutonomySettings', {agent: agent.handle})
        }
      />
      <Button
        label={paused ? `Resume ${displayName}` : `Pause ${displayName}`}
        size="large"
        variant="solid"
        color="secondary"
        disabled={pause.isPending}
        onPress={onTogglePause}>
        <ButtonIcon icon={paused ? PlayIcon : PauseIcon} />
        <ButtonText>
          {paused ? <Trans>Resume</Trans> : <Trans>Pause</Trans>}
        </ButtonText>
      </Button>
    </View>
  )
}

function SettingsLink({label, onPress}: {label: string; onPress: () => void}) {
  const t = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint=""
      onPress={onPress}
      style={[
        a.flex_row,
        a.align_center,
        a.gap_md,
        a.rounded_md,
        a.p_md,
        t.atoms.bg_contrast_25,
      ]}>
      <Text style={[a.flex_1, a.text_md, a.font_bold, t.atoms.text]}>
        {label}
      </Text>
      <ChevronIcon size="sm" fill={t.atoms.text_contrast_low.color} />
    </Pressable>
  )
}

/** Live (green) / Paused (muted) pill for the hub header. */
function HubStatusBadge({agent}: {agent: OwnerAgent}) {
  const t = useTheme()
  if (agent.paused === true) {
    return (
      <View
        style={[
          a.rounded_full,
          a.px_sm,
          {paddingVertical: 2, backgroundColor: t.palette.contrast_100},
        ]}>
        <Text style={[a.text_xs, a.font_bold, {color: t.palette.contrast_600}]}>
          <Trans>Paused</Trans>
        </Text>
      </View>
    )
  }
  if (agent.live === true) {
    return (
      <View
        style={[
          a.rounded_full,
          a.px_sm,
          {paddingVertical: 2, backgroundColor: t.palette.positive_50},
        ]}>
        <Text style={[a.text_xs, a.font_bold, {color: t.palette.positive_700}]}>
          <Trans>Live</Trans>
        </Text>
      </View>
    )
  }
  return null
}
