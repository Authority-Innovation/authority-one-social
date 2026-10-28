/**
 * Join and consent for a community (`/c/:id/join`), mockup (d).
 *
 * Shown before any membership exists. The person sees what joining shares,
 * who runs the community agent, and the community rules, then ticks the
 * consent box. Only "Agree and join" calls `join`, and only once the box is
 * ticked. Opening this screen from an invite link (`?invite=...`) changes
 * nothing: an invite never counts as consent.
 *
 * The agent toggle is a separate grant, off by default, for this community
 * only. It is sent after the join succeeds and only when turned on.
 *
 * Join is offered only when the config names a consent version this build has
 * copy for (see `./consent.ts`). A missing version shows the load-error state;
 * an unknown one asks for a newer app. Neither shows the consent box.
 *
 * Dark behind EXPO_PUBLIC_COMMUNITIES_ENABLED: with it off, deep links land on
 * Home (see `./linking.ts`) and an in-app push falls back to Home here.
 */
import {useState} from 'react'
import {View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'
import {useQuery} from '@tanstack/react-query'

import {getCommunity} from '#/lib/agent-runtime/communitiesClient'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {STALE} from '#/state/queries'
import {useOwnerAgentsQuery} from '#/state/queries/agents'
import {createQueryKey} from '#/state/queries/util'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Toggle from '#/components/forms/Toggle'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {Lock_Stroke2_Corner0_Rounded as LockIcon} from '#/components/icons/Lock'
import {TimesLarge_Stroke2_Corner0_Rounded as TimesIcon} from '#/components/icons/Times'
import * as Layout from '#/components/Layout'
import {InlineLinkText} from '#/components/Link'
import {Loader} from '#/components/Loader'
import {Text} from '#/components/Typography'
import {COMMUNITIES_ENABLED} from '#/env'
import {agreeAndJoin, consentGateFor, type JoinConsentConfig} from './consent'
import {useCommunitiesDisabledFallback} from './index'

const communityJoinConfigQueryKeyRoot = 'communityJoinConfig'
const createCommunityJoinConfigQueryKey = (args: {id: string}) =>
  createQueryKey(communityJoinConfigQueryKeyRoot, args)

function useCommunityJoinConfigQuery({id}: {id: string}) {
  return useQuery({
    queryKey: createCommunityJoinConfigQueryKey({id}),
    queryFn: async () => {
      const res = await getCommunity(id)
      if (!res.ok) throw new Error(res.error.kind)
      return res.data
    },
    staleTime: STALE.MINUTES.ONE,
    enabled: COMMUNITIES_ENABLED && !!id,
  })
}

export function CommunityJoinScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'CommunityJoin'>) {
  useCommunitiesDisabledFallback()
  // `route.params.invite` is deliberately never read: an invite is not consent.
  const id = route.params?.id ?? ''

  if (!COMMUNITIES_ENABLED) return null

  return <JoinConsent id={id} />
}

function JoinConsent({id}: {id: string}) {
  const {t: l} = useLingui()
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const {
    data: config,
    isLoading,
    isError,
    refetch,
  } = useCommunityJoinConfigQuery({id})
  const {data: ownerAgents} = useOwnerAgentsQuery()
  const myAgent = ownerAgents?.agents[0]
  const myAgentName = myAgent?.displayName || myAgent?.handle

  const [consented, setConsented] = useState(false)
  const [agentGrant, setAgentGrant] = useState(false)
  const [pending, setPending] = useState(false)
  const [joinFailed, setJoinFailed] = useState(false)
  const [joined, setJoined] = useState<{agentGrantFailed: boolean} | null>(null)

  const gate = consentGateFor(config)

  const onAgreeAndJoin = async () => {
    if (!consented || pending || gate.kind !== 'ok') return
    setPending(true)
    setJoinFailed(false)
    const outcome = await agreeAndJoin({
      id,
      consentVersion: gate.version,
      consented,
      // Only send a grant the person can see and turned on.
      agentGrant: !!myAgentName && agentGrant,
    })
    setPending(false)
    if (outcome.ok) {
      setJoined({agentGrantFailed: outcome.agentGrantFailed})
    } else {
      setJoinFailed(true)
    }
  }

  const onNotNow = () => {
    if (navigation.canGoBack()) {
      navigation.goBack()
    } else {
      navigation.navigate('Home')
    }
  }

  const onGoToCommunity = () => {
    navigation.navigate('Community', {id})
  }

  return (
    <Layout.Screen testID="communityJoinScreen">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>Join community</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>
        {isLoading ? (
          <View style={[a.align_center, a.p_2xl]}>
            <Loader size="xl" />
          </View>
        ) : isError || !config || gate.kind === 'missing' ? (
          <View
            testID="communityJoinLoadError"
            style={[a.gap_md, a.p_xl, a.align_center]}>
            <Text
              style={[a.text_md, a.text_center, t.atoms.text_contrast_high]}>
              <Trans>We couldn’t load this community. Please try again.</Trans>
            </Text>
            <Button
              label={l`Try again`}
              onPress={() => void refetch()}
              color="secondary"
              size="small">
              <ButtonText>
                <Trans>Try again</Trans>
              </ButtonText>
            </Button>
          </View>
        ) : gate.kind === 'unsupported' ? (
          <View
            testID="communityJoinNeedsUpdate"
            style={[a.gap_md, a.p_xl, a.align_center]}>
            <Text
              style={[a.text_md, a.text_center, t.atoms.text_contrast_high]}>
              <Trans>This community needs a newer version of the app.</Trans>
            </Text>
            <Button
              testID="communityJoinNotNowButton"
              label={l`Not now`}
              onPress={onNotNow}
              color="secondary"
              size="small">
              <ButtonText>
                <Trans>Not now</Trans>
              </ButtonText>
            </Button>
          </View>
        ) : joined ? (
          <JoinedState
            name={config.name}
            agentName={myAgentName}
            agentGrantFailed={joined.agentGrantFailed}
            onGoToCommunity={onGoToCommunity}
          />
        ) : (
          <View style={[a.gap_xl, a.p_lg]}>
            <CommunityCard config={config} />

            <View style={[a.gap_sm]}>
              <Text style={[a.text_md, a.font_semi_bold, t.atoms.text]}>
                <Trans>
                  Before you join: here is what membership shares, and with
                  whom.
                </Trans>
              </Text>
              <ShareRow
                shared
                title={l`Your name, handle and picture`}
                detail={l`The same profile you use everywhere on Authority One.`}
              />
              <ShareRow
                shared
                title={l`Posts and replies you make here`}
                detail={l`Members only, kept in this community’s private store, not your public account.`}
              />
              <ShareRow
                shared={false}
                title={l`Your posts in other communities`}
                detail={l`Each community is separate. Nothing crosses over.`}
              />
              <ShareRow
                shared={false}
                title={l`A public record that you joined`}
                detail={l`Your membership is not written to the open network.`}
              />
            </View>

            {config.agentDid ? <CommunityAgentBlock config={config} /> : null}

            {myAgentName ? (
              <View style={[a.gap_sm]}>
                <SectionTitleText>
                  <Trans>Your own agent (optional)</Trans>
                </SectionTitleText>
                <Toggle.Item
                  name="community_agent_grant"
                  value={agentGrant}
                  onChange={setAgentGrant}
                  label={l`Let ${myAgentName} read this community for me`}
                  style={[
                    a.w_full,
                    a.p_md,
                    a.rounded_lg,
                    a.border,
                    t.atoms.border_contrast_low,
                    t.atoms.bg_contrast_25,
                  ]}>
                  <View style={[a.flex_1, a.gap_2xs]}>
                    <Toggle.LabelText style={[a.text_md, a.font_medium]}>
                      <Trans>
                        Let {myAgentName} read this community for me
                      </Trans>
                    </Toggle.LabelText>
                    <Text
                      emoji
                      style={[a.text_sm, t.atoms.text_contrast_medium]}>
                      <Trans>
                        {myAgentName} can give you recaps of threads you can
                        already see. You can turn it off any time.
                      </Trans>
                    </Text>
                  </View>
                  <Toggle.Platform />
                </Toggle.Item>
              </View>
            ) : null}

            <RulesAndLinks config={config} />

            <View style={[a.gap_md]}>
              <Toggle.Item
                name="community_join_consent"
                type="checkbox"
                value={consented}
                onChange={setConsented}
                label={l`I’ve read what joining shares and I agree to the community rules.`}>
                <Toggle.Checkbox />
                <Toggle.LabelText style={[a.flex_1, a.text_md]}>
                  <Trans>
                    I’ve read what joining shares and I agree to the community
                    rules.
                  </Trans>
                </Toggle.LabelText>
              </Toggle.Item>
              <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                <Trans>
                  Consent version {gate.version} · saved with your membership.
                </Trans>
              </Text>
            </View>

            {joinFailed ? (
              <Text style={[a.text_sm, {color: t.palette.negative_500}]}>
                <Trans>Couldn’t join right now. Please try again.</Trans>
              </Text>
            ) : null}

            <View style={[a.gap_sm]}>
              <Button
                testID="communityJoinAgreeButton"
                label={l`Agree and join`}
                onPress={() => void onAgreeAndJoin()}
                disabled={!consented || pending}
                color="primary"
                size="large">
                <ButtonText>
                  <Trans>Agree and join</Trans>
                </ButtonText>
              </Button>
              <Button
                testID="communityJoinNotNowButton"
                label={l`Not now`}
                onPress={onNotNow}
                color="secondary"
                size="large">
                <ButtonText>
                  <Trans>Not now</Trans>
                </ButtonText>
              </Button>
            </View>
          </View>
        )}
      </Layout.Content>
    </Layout.Screen>
  )
}

function SectionTitleText({children}: {children: React.ReactNode}) {
  const t = useTheme()
  return (
    <Text style={[a.text_md, a.font_semi_bold, t.atoms.text]}>{children}</Text>
  )
}

function CommunityCard({config}: {config: JoinConsentConfig}) {
  const t = useTheme()
  const sponsor = config.sponsorName
  const membersOnly = config.membersOnly !== false
  return (
    <View
      style={[
        a.gap_xs,
        a.p_md,
        a.rounded_md,
        a.border,
        t.atoms.border_contrast_low,
        t.atoms.bg_contrast_25,
      ]}>
      <Text emoji style={[a.text_lg, a.font_bold, t.atoms.text]}>
        {config.name}
      </Text>
      <View style={[a.flex_row, a.align_center, a.gap_xs]}>
        {membersOnly ? (
          <LockIcon size="xs" style={[t.atoms.text_contrast_medium]} />
        ) : null}
        <Text emoji style={[a.text_sm, t.atoms.text_contrast_medium]}>
          {sponsor ? (
            membersOnly ? (
              <Trans>Run by {sponsor} · Members only</Trans>
            ) : (
              <Trans>Run by {sponsor}</Trans>
            )
          ) : membersOnly ? (
            <Trans>Members only</Trans>
          ) : null}
        </Text>
      </View>
    </View>
  )
}

function ShareRow({
  shared,
  title,
  detail,
}: {
  shared: boolean
  title: string
  detail: string
}) {
  const t = useTheme()
  const Icon = shared ? CheckIcon : TimesIcon
  return (
    <View style={[a.flex_row, a.gap_sm, a.py_xs]}>
      <Icon
        size="sm"
        style={[
          {
            color: shared ? t.palette.positive_500 : t.palette.negative_500,
          },
        ]}
      />
      <View style={[a.flex_1, a.gap_2xs]}>
        <Text style={[a.text_sm, a.font_medium, t.atoms.text]}>{title}</Text>
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>{detail}</Text>
      </View>
    </View>
  )
}

function CommunityAgentBlock({config}: {config: JoinConsentConfig}) {
  const {t: l} = useLingui()
  const t = useTheme()
  const sponsor = config.sponsorName
  const agentName = config.agentName || l`The community agent`
  return (
    <View style={[a.gap_sm]}>
      <SectionTitleText>
        <Trans>The community agent</Trans>
      </SectionTitleText>
      <View
        style={[
          a.gap_xs,
          a.p_md,
          a.rounded_md,
          a.border,
          t.atoms.border_contrast_low,
        ]}>
        <View style={[a.flex_row, a.align_center, a.gap_xs]}>
          <Text emoji style={[a.text_md, a.font_semi_bold, t.atoms.text]}>
            <Trans>{agentName} is here</Trans>
          </Text>
          <Text
            style={[a.text_xs, a.font_semi_bold, t.atoms.text_contrast_medium]}>
            <Trans context="agent label">◆ Agent</Trans>
          </Text>
        </View>
        <Text emoji style={[a.text_sm, t.atoms.text_contrast_medium]}>
          {sponsor ? (
            <Trans>
              {agentName} is an AI agent run by {sponsor}. It answers questions
              in threads, always labelled as an agent, and cites the source it
              used. For the community’s numbers it sees totals only, never your
              profile.
            </Trans>
          ) : (
            <Trans>
              {agentName} is an AI agent. It answers questions in threads,
              always labelled as an agent, and cites the source it used. For the
              community’s numbers it sees totals only, never your profile.
            </Trans>
          )}
        </Text>
      </View>
    </View>
  )
}

function RulesAndLinks({config}: {config: JoinConsentConfig}) {
  const {t: l} = useLingui()
  const t = useTheme()
  const sponsor = config.sponsorName
  const termsUrl = config.termsUrl || config.privacyUrl
  return (
    <View style={[a.gap_sm]}>
      <SectionTitleText>
        <Trans>Rules and links</Trans>
      </SectionTitleText>
      <View style={[a.gap_2xs]}>
        <Text style={[a.text_sm, a.font_medium, t.atoms.text]}>
          <Trans>Community rules</Trans>
        </Text>
        {config.rulesText ? (
          <Text emoji style={[a.text_sm, t.atoms.text_contrast_medium]}>
            {config.rulesText}
          </Text>
        ) : null}
      </View>
      {termsUrl ? (
        <InlineLinkText
          to={termsUrl}
          label={
            sponsor ? l`${sponsor} terms and privacy` : l`Terms and privacy`
          }
          style={[a.text_sm]}>
          {sponsor ? (
            <Trans>{sponsor} terms and privacy</Trans>
          ) : (
            <Trans>Terms and privacy</Trans>
          )}
        </InlineLinkText>
      ) : null}
      <View style={[a.gap_2xs]}>
        <Text style={[a.text_sm, a.font_medium, t.atoms.text]}>
          <Trans>Leaving</Trans>
        </Text>
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          <Trans>
            Leave any time. You can export or delete your posts first.
          </Trans>
        </Text>
      </View>
    </View>
  )
}

function JoinedState({
  name,
  agentName,
  agentGrantFailed,
  onGoToCommunity,
}: {
  name: string
  agentName?: string
  agentGrantFailed: boolean
  onGoToCommunity: () => void
}) {
  const {t: l} = useLingui()
  const t = useTheme()
  return (
    <View testID="communityJoinSuccess" style={[a.gap_md, a.p_xl]}>
      <Text style={[a.text_2xl, a.font_bold, t.atoms.text]}>
        <Trans>You’re in.</Trans>
      </Text>
      <Text emoji style={[a.text_md, t.atoms.text_contrast_high]}>
        <Trans>Welcome to {name}.</Trans>
      </Text>
      {agentGrantFailed && agentName ? (
        <Text emoji style={[a.text_sm, t.atoms.text_contrast_medium]}>
          <Trans>
            {agentName} couldn’t be turned on for this community. You can try
            again from the community.
          </Trans>
        </Text>
      ) : null}
      <Button
        testID="communityJoinGoButton"
        label={l`Go to the community`}
        onPress={onGoToCommunity}
        color="primary"
        size="large">
        <ButtonText>
          <Trans>Go to the community</Trans>
        </ButtonText>
      </Button>
    </View>
  )
}
