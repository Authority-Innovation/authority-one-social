/**
 * Join and consent for a community (`/c/:id/join`), mockup (d).
 *
 * Shown before any membership exists. A non-member reaches only the door's
 * join-info route (`getJoinInfo`: `{wording_version}`, the same body for every
 * id), so the screen knows the community id and the wording version and
 * nothing else: no name, agent or rules until the join answers. The person
 * sees what joining shares, then ticks the consent box. Only "Agree and join" calls `join`, and only once the box is
 * ticked. Joining is open: no invite and no approval is asked for, and a
 * `?invite=...` in the link changes nothing.
 *
 * There is no agent toggle here. The grant is for the community's agent, and
 * join-info cannot say whether there is one, so it is offered on the community
 * home once the person is a member (see `./consent.ts`).
 *
 * Join is offered only when join-info names a wording version this build has
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
import {useQuery, useQueryClient} from '@tanstack/react-query'

import {
  type CommunityJoinInfo,
  getJoinInfo,
} from '#/lib/agent-runtime/communitiesClient'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {STALE} from '#/state/queries'
import {createQueryKey} from '#/state/queries/util'
import {useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Toggle from '#/components/forms/Toggle'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {Lock_Stroke2_Corner0_Rounded as LockIcon} from '#/components/icons/Lock'
import {TimesLarge_Stroke2_Corner0_Rounded as TimesIcon} from '#/components/icons/Times'
import * as Layout from '#/components/Layout'
import {Loader} from '#/components/Loader'
import {Text} from '#/components/Typography'
import {COMMUNITIES_ENABLED} from '#/env'
import {createMyCommunitiesQueryKey} from '#/features/communities/switcher/useMyCommunitiesQuery'
import {agreeAndJoin, consentGateFor} from './consent'
import {createCommunityQueryKey} from './queries'
import {useCommunitiesDisabledFallback} from './useCommunitiesDisabledFallback'

const communityJoinInfoQueryKeyRoot = 'communityJoinInfo'
const createCommunityJoinInfoQueryKey = (args: {id: string}) =>
  createQueryKey(communityJoinInfoQueryKeyRoot, args)

function useCommunityJoinInfoQuery({id}: {id: string}) {
  return useQuery({
    queryKey: createCommunityJoinInfoQueryKey({id}),
    queryFn: async (): Promise<CommunityJoinInfo> => {
      const res = await getJoinInfo(id)
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
  const id = route.params?.id ?? ''

  if (!COMMUNITIES_ENABLED) return null

  return <JoinConsent id={id} />
}

function JoinConsent({id}: {id: string}) {
  const {t: l} = useLingui()
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const {
    data: joinInfo,
    isLoading,
    isError,
    refetch,
  } = useCommunityJoinInfoQuery({id})
  const queryClient = useQueryClient()
  const viewer = useSession().currentAccount?.did ?? ''

  const [consented, setConsented] = useState(false)
  const [pending, setPending] = useState(false)
  const [joinError, setJoinError] = useState<'refused' | 'failed' | null>(null)
  const [joined, setJoined] = useState<{name: string} | null>(null)

  const gate = consentGateFor(joinInfo)

  const onAgreeAndJoin = async () => {
    if (!consented || pending || gate.kind !== 'ok') return
    setPending(true)
    setJoinError(null)
    const outcome = await agreeAndJoin({
      id,
      consentVersion: gate.version,
      consented,
    })
    setPending(false)
    if (outcome.ok) {
      // The home may hold a refusal or a non-member answer from before the join.
      void queryClient.invalidateQueries({
        queryKey: createCommunityQueryKey({id, viewer}),
      })
      void queryClient.invalidateQueries({
        queryKey: createMyCommunitiesQueryKey({did: viewer}),
      })
      // The join answers with the community, the first time its name is known.
      setJoined({name: outcome.membership.community.name})
    } else {
      setJoinError(outcome.reason === 'refused' ? 'refused' : 'failed')
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
        ) : isError || !joinInfo || gate.kind === 'missing' ? (
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
          <JoinedState name={joined.name} onGoToCommunity={onGoToCommunity} />
        ) : (
          <View style={[a.gap_xl, a.p_lg]}>
            <CommunityCard id={id} />

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
              <ShareRow
                shared={false}
                title={l`Access for this community’s agent`}
                detail={l`If this community has an agent, it gets no access to your content when you join. You can choose to give it access in the community afterwards.`}
              />
            </View>

            <RulesAndLinks />

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

            {joinError === 'refused' ? (
              <Text
                testID="communityJoinRefused"
                style={[a.text_sm, {color: t.palette.negative_500}]}>
                <Trans>
                  This community didn’t accept your request, so you haven’t
                  joined.
                </Trans>
              </Text>
            ) : joinError === 'failed' ? (
              <Text
                testID="communityJoinFailed"
                style={[a.text_sm, {color: t.palette.negative_500}]}>
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

// Before joining, the id from the link is all the door tells a non-member;
// every community behind the door is members-only.
function CommunityCard({id}: {id: string}) {
  const t = useTheme()
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
        {id}
      </Text>
      <View style={[a.flex_row, a.align_center, a.gap_xs]}>
        <LockIcon size="xs" style={[t.atoms.text_contrast_medium]} />
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          <Trans>Members only</Trans>
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

function RulesAndLinks() {
  const t = useTheme()
  return (
    <View style={[a.gap_sm]}>
      <SectionTitleText>
        <Trans>Rules and links</Trans>
      </SectionTitleText>
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
  onGoToCommunity,
}: {
  name: string
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
