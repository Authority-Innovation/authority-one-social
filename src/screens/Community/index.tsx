/**
 * Authority One Communities - the community home (`/c/:id`) and its Members
 * tab (`/c/:id/members`). Replaces the T1 placeholder and the older Group
 * stub (`src/screens/Group/index.tsx`). See `./README.md`.
 *
 * Every path resolved through `router.matchPath` is already sent to Home when
 * EXPO_PUBLIC_COMMUNITIES_ENABLED is off (see `./linking.ts`). The guard in
 * `./useCommunitiesDisabledFallback.ts` is a second line for navigation by route name, which skips matchPath, and
 * nothing is fetched while the flag is off.
 */
import {useState} from 'react'
import {View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'

import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {atoms as a, platform, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {useDialogControl} from '#/components/Dialog'
import * as Layout from '#/components/Layout'
import {InlineLinkText} from '#/components/Link'
import {Loader} from '#/components/Loader'
import {Text} from '#/components/Typography'
import {COMMUNITIES_ENABLED} from '#/env'
import {AgentLaunchControl} from '#/features/communityAgent/AgentLaunchControl'
import {AgentCard} from './components/AgentCard'
import {AgentGrantSection} from './components/AgentGrantSection'
import {CommunityComposerEntry} from './components/CommunityComposerEntry'
import {CommunityHeader} from './components/CommunityHeader'
import {JoinConsentEntry} from './components/JoinConsentEntry'
import {MembersSection} from './components/MembersSection'
import {PostsSection} from './components/PostsSection'
import {type CommunityDescriptor} from './descriptor'
import {useCommunityQuery} from './queries'
import {useCommunitiesDisabledFallback} from './useCommunitiesDisabledFallback'

export {useCommunitiesDisabledFallback}

type Tab = 'posts' | 'members'

export function CommunityScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'Community'>) {
  return <CommunityHome id={route.params.id} initialTab="posts" />
}

export function CommunityMembersScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'CommunityMembers'>) {
  return <CommunityHome id={route.params.id} initialTab="members" />
}

function CommunityHome({id, initialTab}: {id: string; initialTab: Tab}) {
  useCommunitiesDisabledFallback()
  if (!COMMUNITIES_ENABLED) return null
  return (
    <Layout.Screen testID="communityScreen">
      <CommunityHomeInner id={id} initialTab={initialTab} />
    </Layout.Screen>
  )
}

function CommunityHomeInner({id, initialTab}: {id: string; initialTab: Tab}) {
  const {data: community, isError} = useCommunityQuery({id})

  if (isError) {
    return (
      <>
        <SimpleHeader />
        <Layout.Content centerContent>
          <View testID="communityError" style={[a.align_center, a.p_xl]}>
            <Text style={[a.text_lg, a.font_bold]}>
              <Trans>Could not load this community</Trans>
            </Text>
          </View>
        </Layout.Content>
      </>
    )
  }

  if (!community) {
    return (
      <>
        <SimpleHeader />
        <Layout.Content
          centerContent
          contentContainerStyle={platform({
            web: [a.mx_auto],
            native: [a.align_center],
          })}>
          <Loader size="2xl" />
        </Layout.Content>
      </>
    )
  }

  return <CommunityHomeLoaded community={community} initialTab={initialTab} />
}

function SimpleHeader({title}: {title?: string}) {
  return (
    <Layout.Header.Outer>
      <Layout.Header.BackButton />
      <Layout.Header.Content>
        {title ? (
          <Layout.Header.TitleText>{title}</Layout.Header.TitleText>
        ) : null}
      </Layout.Header.Content>
      <Layout.Header.Slot />
    </Layout.Header.Outer>
  )
}

function CommunityHomeLoaded({
  community,
  initialTab,
}: {
  community: CommunityDescriptor
  initialTab: Tab
}) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const joinControl = useDialogControl()

  return (
    <>
      <SimpleHeader title={community.name} />
      <Layout.Content>
        <CommunityHeader
          community={community}
          onPressJoin={() => joinControl.open()}
        />
        <AgentCard community={community} />
        <AgentLaunchControl community={community} />
        <AgentGrantSection community={community} />
        {!community.isMember ? <RulesBlock community={community} /> : null}
        <TabRow tab={tab} onChange={setTab} />
        {tab === 'posts' ? (
          <PostsSection community={community} />
        ) : (
          <MembersSection community={community} />
        )}
      </Layout.Content>
      {community.isMember ? (
        <CommunityComposerEntry communityId={community.id} />
      ) : null}
      {!community.isMember ? (
        <JoinConsentEntry control={joinControl} community={community} />
      ) : null}
    </>
  )
}

function TabRow({tab, onChange}: {tab: Tab; onChange: (tab: Tab) => void}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const tabs: {key: Tab; label: string}[] = [
    {key: 'posts', label: l({message: 'Posts', context: 'noun'})},
    {key: 'members', label: l`Members`},
  ]
  return (
    <View
      accessibilityRole="tablist"
      style={[
        a.flex_row,
        a.gap_sm,
        a.px_lg,
        a.py_sm,
        a.border_b,
        t.atoms.border_contrast_low,
      ]}>
      {tabs.map(item => (
        <Button
          key={item.key}
          testID={`communityTab-${item.key}`}
          label={item.label}
          accessibilityRole="tab"
          accessibilityState={{selected: tab === item.key}}
          onPress={() => onChange(item.key)}
          color={tab === item.key ? 'primary' : 'secondary'}
          size="small">
          <ButtonText>{item.label}</ButtonText>
        </Button>
      ))}
    </View>
  )
}

function RulesBlock({community}: {community: CommunityDescriptor}) {
  const t = useTheme()
  const {t: l} = useLingui()
  if (!community.rules && !community.rulesUrl) return null
  return (
    <View testID="communityRules" style={[a.gap_xs, a.px_lg, a.pb_md]}>
      <Text style={[a.text_md, a.font_bold]}>
        <Trans>Community rules</Trans>
      </Text>
      {community.rules ? (
        <Text emoji style={[a.text_sm, t.atoms.text_contrast_high]}>
          {community.rules}
        </Text>
      ) : null}
      {community.rulesUrl ? (
        <InlineLinkText
          to={community.rulesUrl}
          label={l`Read the community rules`}
          style={[a.text_sm]}>
          <Trans>Read the community rules</Trans>
        </InlineLinkText>
      ) : null}
    </View>
  )
}
