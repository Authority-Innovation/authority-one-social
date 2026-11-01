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
import {useCallback, useEffect, useRef, useState} from 'react'
import {ActivityIndicator, Linking, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {msg} from '@lingui/core/macro'
import {Trans, useLingui} from '@lingui/react/macro'
import {
  useFocusEffect,
  useNavigation,
  usePreventRemove,
} from '@react-navigation/native'

import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {useOwnedAgent, useOwnerAgentsQuery} from '#/state/queries/agents'
import {
  useEnableMinimalShellModeForScreen,
  useLockDrawerSwipe,
} from '#/state/shell'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {Camera_Stroke2_Corner0_Rounded as CameraIcon} from '#/components/icons/Camera'
import {Eye_Stroke2_Corner0_Rounded as EyeIcon} from '#/components/icons/Eye'
import {EyeSlash_Stroke2_Corner0_Rounded as EyeSlashIcon} from '#/components/icons/EyeSlash'
import {Microphone_Stroke2_Corner0_Rounded as MicIcon} from '#/components/icons/Microphone'
import * as Toast from '#/components/Toast'
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
  const {i18n} = useLingui()
  const [state, setState] = useState<LiveSessionState>(initialLiveSessionState)
  // The latest state, for the unmount cleanup (it runs with stale closures).
  const latest = useRef<LiveSessionState>(initialLiveSessionState)
  const [controller, setController] = useState<LiveSessionController | null>(
    null,
  )
  const [loadFailed, setLoadFailed] = useState(false)
  // End was tapped: stay on "Ending…" until the runtime's /end answers
  // (review 679a9d48 H2), then leave. A failed /end stays on screen.
  const [leaveWhenEnded, setLeaveWhenEnded] = useState(false)
  // "Leave anyway" while a slow /end is still out (review d8f8f16e H2): the
  // end carries on; a later give-up is a toast (the controller is detached).
  const [leaveAnyway, setLeaveAnyway] = useState(false)
  const left = useRef(false)

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
          onChange: s => {
            latest.current = s
            setState(s)
          },
          deps: {
            // The screen has gone and /end gave up (review f2caccaa F1).
            onEndGaveUp: () =>
              Toast.show(
                i18n._(
                  msg`Couldn’t end your live session, so your agent may still be live. Open Live again to end it.`,
                ),
                {type: 'error'},
              ),
          },
        })
        setController(made)
      },
      () => {
        if (!cancelled) setLoadFailed(true)
      },
    )
    return () => {
      cancelled = true
      made?.detach({failureSeen: latest.current.endFailed})
      void made?.end()
    }
  }, [agentDid, i18n])

  const leave = () => {
    if (left.current) return
    left.current = true
    if (navigation.canGoBack()) navigation.goBack()
    else navigation.navigate('AgentHub', {agent: agentRef})
  }
  const onEnd = () => {
    if (!controller) {
      leave()
      return
    }
    setLeaveWhenEnded(true)
    void controller.end()
  }
  const ended =
    (state.phase === 'ended' || state.phase === 'failed') &&
    !state.ending &&
    !state.endFailed
  useEffect(() => {
    if ((leaveWhenEnded && ended) || leaveAnyway) leave()
  })

  // Review f2caccaa F1: no way out that skips /end. While a session is open,
  // or its /end is still out, a swipe-back or the header back becomes End (or,
  // once ending, waits for the answer). On a failed-end panel the owner has
  // seen the warning, so leaving then is their "Leave anyway".
  const open =
    state.phase !== 'idle' &&
    state.phase !== 'ended' &&
    state.phase !== 'failed'
  usePreventRemove((open || state.ending) && !leaveAnyway, () => {
    if (open) onEnd()
  })
  // The back swipe itself is off while a session is open or ending: on iOS 26
  // the native content-pop gesture is not stopped by usePreventRemove's
  // preventNativeDismiss (seen on the simulator: the swipe left the screen and
  // /end only went out from the unmount). End is the visible way out.
  const blockGesture = (open || state.ending) && !leaveAnyway
  useEffect(() => {
    navigation.setOptions({gestureEnabled: !blockGesture})
  }, [navigation, blockGesture])
  // Never leave the swipe off behind us (review d8f8f16e H4): the route can
  // outlive the session view.
  useEffect(
    () => () => navigation.setOptions({gestureEnabled: true}),
    [navigation],
  )

  // Live is immersive (review f2caccaa F1, found on the simulator): the
  // app's drawer swipe won the back gesture and, like the tab bar, let the
  // owner walk away from a running session with the mic on. With both off
  // and the back swipe off (above), End is the way out.
  useEnableMinimalShellModeForScreen()
  // A counted lock, not the plain flag (review d8f8f16e H3): a Pager screen
  // underneath clears the flag in its blur cleanup, which can land after
  // this screen's focus.
  const lockDrawerSwipe = useLockDrawerSwipe()
  useFocusEffect(useCallback(() => lockDrawerSwipe(), [lockDrawerSwipe]))
  // Anything that still pushes over Live while a session is open (a deep
  // link, a notification) ends it: no mic left running off-screen. The panel
  // shows the end when the owner comes back.
  // While another screen is in front, a /end that gives up is a toast, not
  // a panel nobody sees (review d8f8f16e H1).
  useEffect(() => {
    const offBlur = navigation.addListener('blur', () => {
      controller?.setOnScreen(false)
      const p = latest.current.phase
      if (p !== 'idle' && p !== 'ended' && p !== 'failed') {
        void controller?.end()
      }
    })
    const offFocus = navigation.addListener('focus', () =>
      controller?.setOnScreen(true),
    )
    return () => {
      offBlur()
      offFocus()
    }
  }, [navigation, controller])

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
          // A session may already be on its way: end it, then leave.
          onCancel={state.phase === 'starting' ? onEnd : leave}
        />
      )
    case 'reuse':
      return (
        <Reuse
          displayName={displayName}
          canTakeOver={state.canTakeOver}
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
      return (
        <Finished
          state={state}
          onDone={leave}
          onRetryEnd={() => void controller?.retryEnd()}
          onLeaveAnyway={() => {
            // From now on a give-up is reported as a toast (no screen).
            controller?.detach()
            setLeaveAnyway(true)
          }}
        />
      )
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

/**
 * The server says a session with this agent is open (the start reply's
 * `reused`). Ruling (review 7919b5692 item 8): "Still open on your other
 * device", with "Take over here" only where R3 allows it (a device key: the
 * same key, proven, replaces the held participant). Without a key nothing
 * here can replace it, so the owner ends it there.
 */
function Reuse({
  displayName,
  canTakeOver = false,
  onContinue,
  onCancel,
}: {
  displayName: string
  canTakeOver?: boolean
  onContinue: () => void
  onCancel: () => void
}) {
  const {t: l} = useLingui()
  return (
    <Panel testID="agentLiveReuse">
      <AgentName displayName={displayName} />
      <Text
        testID="agentLiveStillOpen"
        style={[a.text_md, a.font_bold, {color: ON_STAGE_TEXT}]}>
        <Trans>Still open on your other device</Trans>
      </Text>
      <Text style={[a.text_md, {color: ON_STAGE_TEXT}]}>
        {canTakeOver ? (
          <Trans>
            A live session with this agent is open. Take it over here, or end it
            on the other device first. If that device is still connected, taking
            over may not work.
          </Trans>
        ) : (
          <Trans>
            A live session with this agent is open. End it on the other device,
            then try again here.
          </Trans>
        )}
      </Text>
      {canTakeOver ? (
        <Button
          testID="agentLiveContinueHereButton"
          label={l`Take the live session over here`}
          color="primary"
          size="large"
          onPress={onContinue}>
          <ButtonText>
            <Trans>Take over here</Trans>
          </ButtonText>
        </Button>
      ) : null}
      <Button
        testID="agentLiveNotNowButton"
        label={l`Leave the open session where it is`}
        color="secondary"
        size="large"
        onPress={onCancel}>
        <ButtonText>
          {canTakeOver ? <Trans>Not now</Trans> : <Trans>Done</Trans>}
        </ButtonText>
      </Button>
    </Panel>
  )
}

function Finished({
  state,
  onDone,
  onRetryEnd,
  onLeaveAnyway,
}: {
  state: LiveSessionState
  onDone: () => void
  onRetryEnd?: () => void
  onLeaveAnyway?: () => void
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
        case 'server_outdated':
          return l`Live needs a server update that isn’t available yet, so this session was ended. Try again after the update.`
        case 'reconnect_failed':
          return l`Couldn’t reconnect, so the live session has ended.`
        case 'agent_unavailable':
          return l`Your agent couldn’t start, so the live session has ended. Try again later.`
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
      {state.ending && state.endSlow && onLeaveAnyway ? (
        <>
          <Text
            testID="agentLiveEndSlow"
            style={[a.text_sm, {color: ON_STAGE_TEXT}]}>
            <Trans>
              This is taking longer than usual. You can leave: we’ll keep
              trying, and tell you if your agent may still be live.
            </Trans>
          </Text>
          <Button
            testID="agentLiveLeaveAnywayButton"
            label={l`Leave anyway`}
            color="secondary"
            size="large"
            onPress={onLeaveAnyway}>
            <ButtonText>
              <Trans>Leave anyway</Trans>
            </ButtonText>
          </Button>
        </>
      ) : null}
      {state.endFailed ? (
        <>
          <Text
            testID="agentLiveEndFailed"
            style={[a.text_sm, a.font_bold, {color: ON_STAGE_TEXT}]}>
            <Trans>
              Couldn’t end the session, so your agent may still be live. Try
              again, or it ends on its own at the session’s time limit.
            </Trans>
          </Text>
          <Button
            testID="agentLiveRetryEndButton"
            label={l`Try ending the session again`}
            color="negative"
            size="large"
            onPress={() => onRetryEnd?.()}>
            <ButtonText>
              <Trans>Try again</Trans>
            </ButtonText>
          </Button>
        </>
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
      {/* No Done while /end is out: leaving now would hide its answer (F1).
          A slow one offers Leave anyway above (d8f8f16e H2). */}
      {state.ending ? null : (
        <Button
          testID="agentLiveDoneButton"
          label={state.endFailed ? l`Leave anyway` : l`Done`}
          color={state.endFailed ? 'secondary' : 'primary'}
          size="large"
          onPress={onDone}>
          <ButtonText>
            {state.endFailed ? (
              <Trans>Leave anyway</Trans>
            ) : (
              <Trans>Done</Trans>
            )}
          </ButtonText>
        </Button>
      )}
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
      case 'agent_waiting':
        return l`Your agent hasn’t joined yet. Keep waiting, or end and try again later.`
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
