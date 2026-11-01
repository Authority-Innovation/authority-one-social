/**
 * Agent Live session screen (design r2 §6 steps 2 to 5 and 7): the agent's
 * stage full screen, with the owner's mic, blind and camera controls on top.
 *
 * - Dark unless EXPO_PUBLIC_AGENT_LIVE_ENABLED: off (and on Android, for now),
 *   it renders a short notice and never loads the LiveKit binding.
 * - Owner only: the agent must be one the signed-in person owns. The runtime
 *   enforces the same rule from the bearer.
 * - Nothing starts on arrival (a deep link included): the owner taps
 *   Continue, then decides every consent kind and taps Go live. Only then is
 *   the mic published (see features/agentLive/session.ts).
 * - Camera is off by default and publishes only after the owner turns it on
 *   and the runtime has minted a camera token.
 * - The agent is labelled as AI [CR-2]; a session with a recording policy
 *   shows a recording indicator throughout.
 * - End stops the agent: the runtime's /end stops its job and deletes the room.
 *
 * Not here yet: edge sources (step 6), playback (step 9), inviting guests.
 */
import {useEffect, useState} from 'react'
import {ActivityIndicator, Linking, View} from 'react-native'
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
import {IS_ANDROID} from '#/env'
import {AGENT_LIVE_ENABLED} from '#/features/agentLive/flag'
import {loadLiveRoomFactory} from '#/features/agentLive/room'
import {
  createLiveSessionController,
  initialLiveSessionState,
  type LiveSessionController,
  type LiveSessionState,
} from '#/features/agentLive/session'
import {ConsentSheet} from './components/ConsentSheet'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'AgentLive'>

const STAGE_BG = '#000000'
const ON_STAGE_TEXT = '#FFFFFF'
const MIC_ON_DOT = '#E5484D'

export function AgentLiveScreen({route}: Props) {
  // Android: no microphone foreground service yet (see GoLiveButton).
  if (!AGENT_LIVE_ENABLED || IS_ANDROID) return <Notice testID="agentLiveOff" />
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
      agentRef={agentRef}
      displayName={agent.displayName || agent.handle}
    />
  )
}

function LiveSession({
  agentDid,
  agentRef,
  displayName,
}: {
  agentDid: string
  agentRef: string
  displayName: string
}) {
  const navigation = useNavigation<NavigationProp>()
  const [state, setState] = useState<LiveSessionState>(initialLiveSessionState)
  const [controller, setController] = useState<LiveSessionController | null>(
    null,
  )
  const [loadFailed, setLoadFailed] = useState(false)

  // Loads the binding and makes the controller. Starts nothing: the owner's
  // tap does (begin). Leaving the screen ends whatever was started.
  useEffect(() => {
    let cancelled = false
    let made: LiveSessionController | null = null
    void loadLiveRoomFactory().then(
      roomFactory => {
        if (cancelled) return
        made = createLiveSessionController({
          agentDid,
          roomFactory,
          onChange: setState,
        })
        setController(made)
      },
      () => {
        if (!cancelled) setLoadFailed(true)
      },
    )
    return () => {
      cancelled = true
      void made?.end()
    }
  }, [agentDid])

  const leave = () => {
    if (navigation.canGoBack()) navigation.goBack()
    else navigation.navigate('AgentHub', {agent: agentRef})
  }
  const onEnd = () => {
    // /end keeps retrying in the controller after the screen has gone.
    void controller?.end()
    leave()
  }

  if (loadFailed) {
    return (
      <Finished
        state={{...state, phase: 'failed', error: 'connect'}}
        onDone={leave}
      />
    )
  }
  switch (state.phase) {
    case 'idle':
    case 'starting':
      return (
        <Intro
          displayName={displayName}
          busy={!controller || state.phase === 'starting'}
          onBegin={() => void controller?.begin()}
          onCancel={leave}
        />
      )
    case 'reuse':
      return (
        <Reuse
          displayName={displayName}
          onContinue={() => void controller?.continueHere()}
          onCancel={onEnd}
        />
      )
    case 'consent':
      return (
        <ConsentSheet
          required={state.consentRequired}
          recordPolicy={state.recordPolicy}
          onSubmit={choices => void controller?.submitConsent(choices)}
          onCancel={onEnd}
        />
      )
    case 'ended':
    case 'failed':
      return <Finished state={state} onDone={leave} />
    default:
      return (
        <Stage
          state={state}
          controller={controller}
          displayName={displayName}
          onEnd={onEnd}
        />
      )
  }
}

function Panel({
  testID,
  children,
}: {
  testID: string
  children: React.ReactNode
}) {
  const insets = useSafeAreaInsets()
  return (
    <View
      testID={testID}
      style={[
        a.flex_1,
        a.justify_center,
        a.px_lg,
        a.gap_lg,
        {
          backgroundColor: STAGE_BG,
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 16,
        },
      ]}>
      {children}
    </View>
  )
}

function AiLabel() {
  const t = useTheme()
  const {t: l} = useLingui()
  return (
    <View
      testID="agentLiveAiLabel"
      style={[a.rounded_full, a.px_sm, a.py_2xs, t.atoms.bg_contrast_100]}>
      <Text style={[a.text_xs, a.font_bold, t.atoms.text]}>
        {l({message: 'AI', context: 'Label for an AI agent'})}
      </Text>
    </View>
  )
}

function AgentName({displayName}: {displayName: string}) {
  return (
    <View style={[a.flex_row, a.align_center, a.gap_sm]}>
      <Text
        emoji
        numberOfLines={1}
        style={[a.text_lg, a.font_bold, {color: ON_STAGE_TEXT}]}>
        {displayName}
      </Text>
      <AiLabel />
    </View>
  )
}

function Intro({
  displayName,
  busy,
  onBegin,
  onCancel,
}: {
  displayName: string
  busy: boolean
  onBegin: () => void
  onCancel: () => void
}) {
  const {t: l} = useLingui()
  return (
    <Panel testID="agentLiveIntro">
      <AgentName displayName={displayName} />
      <Text style={[a.text_md, {color: ON_STAGE_TEXT}]}>
        <Trans>
          Talk with your agent live. You’ll choose what it may hear, see and
          keep before anything is shared.
        </Trans>
      </Text>
      <Button
        testID="agentLiveBeginButton"
        label={l`Continue to go live`}
        color="primary"
        size="large"
        disabled={busy}
        onPress={onBegin}>
        <ButtonText>
          <Trans>Continue</Trans>
        </ButtonText>
        {busy ? <ActivityIndicator color={ON_STAGE_TEXT} /> : null}
      </Button>
      <Button
        testID="agentLiveCancelButton"
        label={l`Cancel`}
        color="secondary"
        size="large"
        onPress={onCancel}>
        <ButtonText>
          <Trans>Cancel</Trans>
        </ButtonText>
      </Button>
    </Panel>
  )
}

function Reuse({
  displayName,
  onContinue,
  onCancel,
}: {
  displayName: string
  onContinue: () => void
  onCancel: () => void
}) {
  const {t: l} = useLingui()
  return (
    <Panel testID="agentLiveReuse">
      <AgentName displayName={displayName} />
      <Text style={[a.text_md, {color: ON_STAGE_TEXT}]}>
        <Trans>
          A live session with this agent is already open, maybe on another
          device. Continuing here moves it to this device.
        </Trans>
      </Text>
      <Button
        testID="agentLiveContinueHereButton"
        label={l`Continue the live session here`}
        color="primary"
        size="large"
        onPress={onContinue}>
        <ButtonText>
          <Trans>Continue here</Trans>
        </ButtonText>
      </Button>
      <Button
        testID="agentLiveNotNowButton"
        label={l`Leave the open session where it is`}
        color="secondary"
        size="large"
        onPress={onCancel}>
        <ButtonText>
          <Trans>Not now</Trans>
        </ButtonText>
      </Button>
    </Panel>
  )
}

function Finished({
  state,
  onDone,
}: {
  state: LiveSessionState
  onDone: () => void
}) {
  const {t: l} = useLingui()
  const message = (() => {
    if (state.phase === 'failed') {
      switch (state.error) {
        case 'mic_denied':
          return l`Microphone access is off. Turn it on in Settings to go live.`
        case 'signed_out':
          return l`You’re signed out. Sign in again to go live.`
        case 'not_found':
          return l`Live isn’t available for this agent.`
        case 'consent_incomplete':
        case 'consent_required':
          return l`Your agent can’t join until every choice is made.`
        case 'unavailable':
        case 'http':
        case 'network':
        case 'bad_response':
          return l`Couldn’t reach your agent. Try again later.`
        default:
          return l`Couldn’t start the live session. Try again later.`
      }
    }
    switch (state.endReason) {
      case 'removed':
        return l`You were removed from the live session.`
      case 'other_device':
        return l`This live session moved to another device.`
      case 'consent_withdrawn':
        return l`The live session stopped because consent was withdrawn.`
      case 'ended_elsewhere':
        return l`The live session has ended.`
      default:
        return l`Live session ended.`
    }
  })()
  return (
    <Panel
      testID={state.phase === 'failed' ? 'agentLiveFailed' : 'agentLiveEnded'}>
      <Text
        testID="agentLiveFinishedMessage"
        style={[a.text_md, {color: ON_STAGE_TEXT}]}>
        {message}
      </Text>
      {state.ending ? (
        <Text
          testID="agentLiveEnding"
          style={[a.text_sm, {color: ON_STAGE_TEXT}]}>
          <Trans>Ending the session…</Trans>
        </Text>
      ) : null}
      {state.error === 'mic_denied' ? (
        <Button
          testID="agentLiveOpenSettingsButton"
          label={l`Open Settings`}
          color="secondary"
          size="large"
          onPress={() => void Linking.openSettings()}>
          <ButtonText>
            <Trans>Open Settings</Trans>
          </ButtonText>
        </Button>
      ) : null}
      <Button
        testID="agentLiveDoneButton"
        label={l`Done`}
        color="primary"
        size="large"
        onPress={onDone}>
        <ButtonText>
          <Trans>Done</Trans>
        </ButtonText>
      </Button>
    </Panel>
  )
}

function Stage({
  state,
  controller,
  displayName,
  onEnd,
}: {
  state: LiveSessionState
  controller: LiveSessionController | null
  displayName: string
  onEnd: () => void
}) {
  const {t: l} = useLingui()
  const insets = useSafeAreaInsets()
  // Read with the stage, not just the controller: React Compiler memoizes on
  // its inputs, and the room appears after the controller does.
  const stage = state.stage
  const StageVideo = stage ? controller?.room()?.StageVideo : undefined
  const connected = state.phase === 'connected'

  const notice = (() => {
    switch (state.notice) {
      case 'camera_denied':
        return l`Camera access is off. Turn it on in Settings.`
      case 'camera_failed':
        return l`Couldn’t turn the camera on.`
      case 'action_failed':
        return l`That didn’t work. Try again.`
      default:
        return null
    }
  })()

  return (
    <View
      testID="agentLiveScreen"
      style={[a.flex_1, {backgroundColor: STAGE_BG}]}>
      {/* The stage fills the screen; the controls sit on top of it. */}
      <View testID="agentLiveStage" style={[a.absolute, a.inset_0]}>
        {stage && StageVideo && connected ? (
          <StageVideo stage={stage} style={[a.flex_1]} />
        ) : (
          <View style={[a.flex_1, a.align_center, a.justify_center, a.gap_md]}>
            <ActivityIndicator color={ON_STAGE_TEXT} />
            {state.phase === 'reconnecting' ? (
              <Text
                testID="agentLiveReconnecting"
                style={[a.text_sm, {color: ON_STAGE_TEXT}]}>
                <Trans>Reconnecting…</Trans>
              </Text>
            ) : (
              <Text
                testID="agentLiveWaiting"
                style={[a.text_sm, {color: ON_STAGE_TEXT}]}>
                <Trans>Waiting for your agent’s stage…</Trans>
              </Text>
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
        <AgentName displayName={displayName} />
        <View style={[a.flex_row, a.align_center, a.gap_md]}>
          {state.recordPolicy !== 'off' ? (
            <View
              testID="agentLiveRecordingIndicator"
              accessibilityLabel={l`This session is being recorded`}
              accessibilityHint={l`Recorded for each person who allowed it`}
              style={[a.flex_row, a.align_center, a.gap_xs]}>
              <View
                style={[
                  a.rounded_full,
                  {width: 8, height: 8, backgroundColor: MIC_ON_DOT},
                ]}
              />
              <Text style={[a.text_xs, a.font_bold, {color: ON_STAGE_TEXT}]}>
                <Trans>Recording</Trans>
              </Text>
            </View>
          ) : null}
          {state.micOn && connected ? (
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
      </View>

      <View
        style={[
          a.absolute,
          a.gap_md,
          a.px_lg,
          {left: 0, right: 0, bottom: insets.bottom + 16},
        ]}>
        {notice ? (
          <Text
            testID="agentLiveNotice"
            style={[a.text_sm, a.text_center, {color: ON_STAGE_TEXT}]}>
            {notice}
          </Text>
        ) : null}
        <View style={[a.flex_row, a.flex_wrap, a.justify_center, a.gap_md]}>
          <Button
            testID="agentLiveMicButton"
            label={state.micOn ? l`Turn microphone off` : l`Turn microphone on`}
            accessibilityHint={l`Your agent hears you while the mic is on`}
            color={state.micOn ? 'secondary' : 'negative_subtle'}
            size="large"
            shape="round"
            disabled={!connected}
            onPress={() => void controller?.setMic(!state.micOn)}>
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
            onPress={() => void controller?.setBlind(!state.blindOn)}>
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
            onPress={() => void controller?.setCamera(!state.cameraOn)}>
            <ButtonIcon icon={CameraIcon} />
          </Button>
          <Button
            testID="agentLiveEndButton"
            label={l`End the live session and stop your agent`}
            color="negative"
            size="large"
            onPress={onEnd}>
            <ButtonText>
              {l({message: 'End', context: 'End a live session'})}
            </ButtonText>
          </Button>
        </View>
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
