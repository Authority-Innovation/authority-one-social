import {useState} from 'react'
import {ActivityIndicator, Pressable, View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {type OwnerAgent} from '#/lib/agent-runtime'
import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {sanitizeHandle} from '#/lib/strings/handles'
import {
  useOwnedAgent,
  useOwnerAgentsQuery,
  usePauseOwnerAgentMutation,
} from '#/state/queries/agents'
import {useProfileQuery} from '#/state/queries/profile'
import {useSession} from '#/state/session'
import {PostFeed} from '#/view/com/posts/PostFeed'
import {EmptyState} from '#/view/com/util/EmptyState'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {AgentChatEmbedded} from '#/screens/AgentChat'
import {AgentProfileDialog} from '#/screens/Settings/PersonaSettings/AgentProfileDialog'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {ChevronRight_Stroke2_Corner0_Rounded as ChevronIcon} from '#/components/icons/Chevron'
import {EditBig_Stroke1_Corner0_Rounded as EditIcon} from '#/components/icons/EditBig'
import {Pause_Stroke2_Corner0_Rounded as PauseIcon} from '#/components/icons/Pause'
import {Play_Stroke2_Corner0_Rounded as PlayIcon} from '#/components/icons/Play'
import * as Layout from '#/components/Layout'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'AgentHub'>

type HubTab = 'chat' | 'posts' | 'profile' | 'settings'

/**
 * The per-agent hub: ONE place per owned agent combining the conversational
 * plane (Chat tab — the existing 1:1 chat, keyed to THIS agent) and the
 * direct-manipulation plane (Posts / Profile / Settings — deterministic
 * owner controls through ownership-scoped runtime endpoints, never the
 * agent's LLM). The viewer stays signed in as themselves — the header chip
 * makes the delegation model legible. Management renders only when the
 * roster confirms the viewer owns this agent (re-checked here because deep
 * links can land anyone on /agents/:agent).
 */
export function AgentHubScreen({route}: Props) {
  const agentRef = route.params.agent
  return <AgentHubInner key={agentRef} agentRef={agentRef} />
}

function AgentHubInner({agentRef}: {agentRef: string}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const {currentAccount} = useSession()
  const {data: roster, isLoading: rosterLoading} = useOwnerAgentsQuery()
  const agent = useOwnedAgent(agentRef)
  // Enrich from the agent's atproto profile: avatar + display name + the
  // authoritative DID (runtime rows may omit `did`).
  const {data: profile} = useProfileQuery({
    did: agent?.did ?? agent?.handle ?? agentRef,
  })
  const [tab, setTab] = useState<HubTab>('chat')

  // OWNERSHIP GUARD (deep links): the hub is management UI — render it only
  // once the roster confirms this agent belongs to the viewer.
  if (rosterLoading) {
    return (
      <HubShell title={l`Your agent`}>
        <View style={[a.flex_1, a.align_center, a.justify_center]}>
          <ActivityIndicator />
        </View>
      </HubShell>
    )
  }
  if (!agent) {
    return (
      <HubShell title={l`Your agent`}>
        <View style={[a.px_lg, a.py_2xl, a.gap_sm]}>
          <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
            {roster === undefined || roster.signedOut ? (
              <Trans>Your agents are unavailable right now</Trans>
            ) : (
              <Trans>This agent isn’t linked to your account</Trans>
            )}
          </Text>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            <Trans>
              Only an agent’s owner can chat with and manage it here.
            </Trans>
          </Text>
        </View>
      </HubShell>
    )
  }

  const displayName = profile?.displayName || agent.displayName || agent.handle
  const ownerLabel = currentAccount?.handle
    ? sanitizeHandle(currentAccount.handle, '@')
    : l`you`

  return (
    <HubShell title={displayName}>
      {/* Hub header: who this agent is + the delegation chip. */}
      <View style={[a.px_lg, a.pt_sm, a.gap_sm]}>
        <View style={[a.flex_row, a.align_center, a.gap_md]}>
          <UserAvatar
            avatar={profile?.avatar ?? agent.avatar}
            size={48}
            type="user"
          />
          <View style={[a.flex_1]}>
            <View style={[a.flex_row, a.align_center, a.gap_sm]}>
              <Text
                emoji
                style={[a.text_lg, a.font_bold, t.atoms.text]}
                numberOfLines={1}>
                {displayName}
              </Text>
              <HubStatusBadge agent={agent} />
            </View>
            <Text
              style={[a.text_sm, t.atoms.text_contrast_medium]}
              numberOfLines={1}>
              {sanitizeHandle(agent.handle, '@')}
            </Text>
          </View>
        </View>
        {/* Persistent delegation chip: managing, not signed in as. */}
        <View
          style={[
            a.self_start,
            a.rounded_full,
            a.px_md,
            a.py_xs,
            t.atoms.bg_contrast_25,
          ]}>
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
            <Trans>
              Managing {displayName} — you are still {ownerLabel}
            </Trans>
          </Text>
        </View>
      </View>

      <HubTabBar tab={tab} onSelect={setTab} />

      <View style={[a.flex_1]}>
        {tab === 'chat' ? (
          <AgentChatEmbedded agent={agent.handle} />
        ) : tab === 'posts' ? (
          <PostsTab agent={agent} did={profile?.did ?? agent.did} />
        ) : tab === 'profile' ? (
          <ProfileTab
            agent={agent}
            displayName={displayName}
            avatar={profile?.avatar ?? agent.avatar}
            description={profile?.description}
          />
        ) : (
          <SettingsTab agent={agent} displayName={displayName} />
        )}
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
      {children}
    </Layout.Screen>
  )
}

function HubTabBar({
  tab,
  onSelect,
}: {
  tab: HubTab
  onSelect: (tab: HubTab) => void
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const tabs: {key: HubTab; label: string}[] = [
    {key: 'chat', label: l`Chat`},
    {key: 'posts', label: l`Posts`},
    {key: 'profile', label: l`Profile`},
    {key: 'settings', label: l`Settings`},
  ]
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
 * The agent's published posts — the existing author-feed componentry pointed at
 * the agent's DID (the AppView serves any DID's feed; reads need nothing new).
 * Owner controls ride the normal post "•••" menu (ownedAgentDids check), and
 * "Post as <Agent>" opens the composer in postAs mode — verbatim, via the
 * ownership-scoped runtime endpoint, no LLM.
 */
function PostsTab({agent, did}: {agent: OwnerAgent; did?: string}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const {openComposer} = useOpenComposer()
  const name = agent.displayName || agent.handle

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
      <View style={[a.px_lg, a.py_sm, a.flex_row]}>
        <Button
          label={l`Post as ${name}`}
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
          <ButtonText>
            <Trans>Post as {name}</Trans>
          </ButtonText>
        </Button>
      </View>
      <View style={[a.flex_1]}>
        <PostFeed
          testID="agentHubPostsFeed"
          feed={`author|${did}|posts_and_author_threads`}
          disablePoll
          renderEmptyState={() => (
            <EmptyState
              icon={EditIcon}
              message={l`No posts yet. Post as ${name} to get started.`}
            />
          )}
        />
      </View>
    </View>
  )
}

/**
 * The agent's public identity, with the existing profile editor (display name,
 * bio, avatar, banner -> the agent's PDS profile record via /app/agents/profile).
 */
function ProfileTab({
  agent,
  displayName,
  avatar,
  description,
}: {
  agent: OwnerAgent
  displayName: string
  avatar?: string
  description?: string
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const editControl = Dialog.useDialogControl()

  return (
    <View style={[a.px_lg, a.py_lg, a.gap_lg]}>
      <View style={[a.flex_row, a.align_center, a.gap_md]}>
        <UserAvatar avatar={avatar} size={64} type="user" />
        <View style={[a.flex_1]}>
          <Text emoji style={[a.text_lg, a.font_bold, t.atoms.text]}>
            {displayName}
          </Text>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            {sanitizeHandle(agent.handle, '@')}
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
        label={l`Edit ${displayName}’s profile`}
        size="large"
        variant="solid"
        color="primary"
        onPress={() => editControl.open()}>
        <ButtonIcon icon={EditIcon} />
        <ButtonText>
          <Trans>Edit profile</Trans>
        </ButtonText>
      </Button>
      <AgentProfileDialog control={editControl} agent={agent.handle} />
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
        label={l`Persona settings`}
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
        label={paused ? l`Resume ${displayName}` : l`Pause ${displayName}`}
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
