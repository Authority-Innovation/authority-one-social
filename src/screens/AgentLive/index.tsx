/**
 * Agent Live session screen (design r2 §6 steps 2, 4, 5 and 7): the agent's
 * stage full screen, with the owner's mic, blind and camera controls on top.
 *
 * - Dark unless EXPO_PUBLIC_AGENT_LIVE_ENABLED: off, it renders a short notice
 *   and never loads the LiveKit binding.
 * - Owner only: the agent must be one the signed-in person owns. The runtime
 *   enforces the same rule from the bearer.
 * - Camera is off by default and publishes only after the owner turns it on
 *   and the runtime has minted a camera token (see session.ts).
 * - The agent is labelled as AI [CR-2].
 *
 * Not here yet: the consent sheet (§6 step 3), edge sources (step 6) and
 * playback (step 9). Without the owner's `ai_process` consent the runtime
 * doesn't start the agent, so the stage stays on "waiting" until that lands.
 */
import {useEffect, useState} from 'react'
import {ActivityIndicator, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {Trans, useLingui} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {useOwnedAgent, useOwnerAgentsQuery} from '#/state/queries/agents'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {Camera_Stroke2_Corner0_Rounded as CameraIcon} from '#/components/icons/Camera'
import {Eye_Stroke2_Corner0_Rounded as EyeIcon} from '#/components/icons/Eye'
import {EyeSlash_Stroke2_Corner0_Rounded as EyeSlashIcon} from '#/components/icons/EyeSlash'
import {Microphone_Stroke2_Corner0_Rounded as MicIcon} from '#/components/icons/Microphone'
import {Text} from '#/components/Typography'
import {AGENT_LIVE_ENABLED} from '#/features/agentLive/flag'
import {loadLiveRoomFactory} from '#/features/agentLive/room'
import {
  createLiveSessionController,
  initialLiveSessionState,
  type LiveSessionController,
  type LiveSessionState,
} from '#/features/agentLive/session'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'AgentLive'>

const STAGE_BG = '#000000'
const ON_STAGE_TEXT = '#FFFFFF'
const MIC_ON_DOT = '#E5484D'

export function AgentLiveScreen({route}: Props) {
  if (!AGENT_LIVE_ENABLED) return <Notice testID="agentLiveOff" />
  return <OwnedAgentLive agentRef={route.params.agent} />
}

function OwnedAgentLive({agentRef}: {agentRef: string}) {
  const {isLoading} = useOwnerAgentsQuery()
  const agent = useOwnedAgent(agentRef)

  if (!agent?.did) {
    if (isLoading) return <Notice testID="agentLiveLoading" loading />
    return <Notice testID="agentLiveNotOwned" />
  }
  return (
    <LiveSession
      key={agent.did}
      agentDid={agent.did}
      displayName={agent.displayName || agent.handle}
    />
  )
}

function LiveSession({
  agentDid,
  displayName,
}: {
  agentDid: string
  displayName: string
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NavigationProp>()
  const [state, setState] = useState<LiveSessionState>(initialLiveSessionState)
  const [c, setController] = useState<LiveSessionController | null>(null)

  useEffect(() => {
    let cancelled = false
    let started: LiveSessionController | null = null
    void loadLiveRoomFactory().then(
      roomFactory => {
        if (cancelled) return
        started = createLiveSessionController({
          agentDid,
          roomFactory,
          onChange: setState,
        })
        setController(started)
        void started.start()
      },
      () => {
        if (!cancelled) {
          setState(s => ({...s, phase: 'failed', error: 'connect'}))
        }
      },
    )
    return () => {
      cancelled = true
      void started?.end()
    }
  }, [agentDid])

  const StageVideo = c?.room()?.StageVideo
  const connected = state.phase === 'connected'

  const onEnd = () => {
    void c?.end()
    if (navigation.canGoBack()) navigation.goBack()
  }

  return (
    <View
      testID="agentLiveScreen"
      style={[a.flex_1, {backgroundColor: STAGE_BG}]}>
      {/* The stage fills the screen; the controls sit on top of it. */}
      <View testID="agentLiveStage" style={[a.absolute, a.inset_0]}>
        {state.stage && StageVideo ? (
          <StageVideo stage={state.stage} style={[a.flex_1]} />
        ) : (
          <View style={[a.flex_1, a.align_center, a.justify_center, a.gap_md]}>
            {state.phase === 'failed' ? (
              <Text
                testID="agentLiveFailed"
                style={[a.text_md, {color: ON_STAGE_TEXT}]}>
                <Trans>Couldn’t start the live session. Try again later.</Trans>
              </Text>
            ) : (
              <>
                <ActivityIndicator color={ON_STAGE_TEXT} />
                <Text
                  testID="agentLiveWaiting"
                  style={[a.text_sm, {color: ON_STAGE_TEXT}]}>
                  <Trans>Waiting for your agent’s stage…</Trans>
                </Text>
              </>
            )}
          </View>
        )}
      </View>

      <View
        style={[
          a.flex_row,
          a.align_center,
          a.justify_between,
          a.px_lg,
          {paddingTop: insets.top + 12},
        ]}>
        <View style={[a.flex_row, a.align_center, a.gap_sm]}>
          <Text
            emoji
            numberOfLines={1}
            style={[a.text_md, a.font_bold, {color: ON_STAGE_TEXT}]}>
            {displayName}
          </Text>
          <View
            testID="agentLiveAiLabel"
            style={[
              a.rounded_full,
              a.px_sm,
              a.py_2xs,
              t.atoms.bg_contrast_100,
            ]}>
            <Text style={[a.text_xs, a.font_bold, t.atoms.text]}>
              {l({message: 'AI', context: 'Label for an AI agent'})}
            </Text>
          </View>
        </View>
        {state.micOn ? (
          <View
            testID="agentLiveMicIndicator"
            style={[a.flex_row, a.align_center, a.gap_xs]}>
            <View
              style={[
                a.rounded_full,
                {width: 8, height: 8, backgroundColor: MIC_ON_DOT},
              ]}
            />
            <Text style={[a.text_xs, {color: ON_STAGE_TEXT}]}>
              <Trans>Mic on</Trans>
            </Text>
          </View>
        ) : null}
      </View>

      <View
        style={[
          a.absolute,
          a.flex_row,
          a.flex_wrap,
          a.justify_center,
          a.gap_md,
          a.px_lg,
          {left: 0, right: 0, bottom: insets.bottom + 16},
        ]}>
        <Button
          testID="agentLiveMicButton"
          label={state.micOn ? l`Turn microphone off` : l`Turn microphone on`}
          accessibilityHint={l`Your agent hears you while the mic is on`}
          color={state.micOn ? 'secondary' : 'negative_subtle'}
          size="large"
          shape="round"
          disabled={!connected}
          onPress={() => void c?.setMic(!state.micOn)}>
          <ButtonIcon icon={MicIcon} />
        </Button>
        <Button
          testID="agentLiveBlindButton"
          label={state.blindOn ? l`Let your agent see` : l`Blind your agent`}
          accessibilityHint={l`Stops your agent seeing any source until you turn it back`}
          color={state.blindOn ? 'negative_subtle' : 'secondary'}
          size="large"
          shape="round"
          disabled={!connected}
          onPress={() => void c?.setBlind(!state.blindOn)}>
          <ButtonIcon icon={state.blindOn ? EyeSlashIcon : EyeIcon} />
        </Button>
        <Button
          testID="agentLiveCameraButton"
          label={state.cameraOn ? l`Turn camera off` : l`Turn camera on`}
          accessibilityHint={l`The camera is off until you turn it on`}
          color={state.cameraOn ? 'primary' : 'secondary'}
          size="large"
          shape="round"
          disabled={!connected || state.cameraPending}
          onPress={() => void c?.setCamera(!state.cameraOn)}>
          <ButtonIcon icon={CameraIcon} />
        </Button>
        <Button
          testID="agentLiveEndButton"
          label={l`End live session`}
          color="negative"
          size="large"
          onPress={onEnd}>
          <ButtonText>{l({message: 'End', context: 'End a live session'})}</ButtonText>
        </Button>
      </View>
    </View>
  )
}

function Notice({testID, loading}: {testID: string; loading?: boolean}) {
  const t = useTheme()
  return (
    <View
      testID={testID}
      style={[a.flex_1, a.align_center, a.justify_center, a.p_lg, t.atoms.bg]}>
      {loading ? (
        <ActivityIndicator />
      ) : (
        <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
          <Trans>Live isn’t available for this agent.</Trans>
        </Text>
      )}
    </View>
  )
}
