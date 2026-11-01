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
  type NavigationAction,
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

/** Removals that are the owner going back (header back, Android back). */
const OWNER_BACK: ReadonlySet<string> = new Set(['GO_BACK', 'POP'])

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
  // tap does (begin). An unmount leaves the room but ends nothing (P3).
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
      // An OS unmount is not the owner ending (Dispatch ruling on 0dcc84ad3
      // P3): leave the room, keep the session (sign-out still ends it).
      void made?.leave()
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

  // While a session is open, or its /end is still out, the owner going back
  // (header back, Android back) is End, or, once ending, waits for the
  // answer (review f2caccaa F1). Any other removal (a notification that pops
  // the stack, a reset) is not the owner ending (Dispatch ruling on review
  // c23bdc031 F1): while the session is open it is refused, so Live stays
  // and keeps running, as when the owner switches apps; once ending, it goes
  // through. On a failed-end panel, leaving is the owner's "Leave anyway".
  const open =
    state.phase !== 'idle' &&
    state.phase !== 'ended' &&
    state.phase !== 'failed'
  const [passThrough, setPassThrough] = useState<NavigationAction | null>(null)
  usePreventRemove(
    (open || state.ending) && !leaveAnyway && !passThrough,
    ({data}) => {
      if (OWNER_BACK.has(data.action.type)) {
        if (open) onEnd()
      } else if (!open) {
        setPassThrough(data.action)
      }
    },
  )
  useEffect(() => {
    if (passThrough) navigation.dispatch(passThrough)
  }, [navigation, passThrough])
  // The back swipe itself is off while a session is open or ending: on iOS 26
  // the native content-pop gesture is not stopped by usePreventRemove's
  // preventNativeDismiss (seen on the simulator: the swipe left the screen and
  // /end only went out from the unmount). End is the visible way out.
  const blockGesture = (open || state.ending) && !leaveAnyway && !passThrough
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
  // Something pushed over Live (a deep link, a notification) does NOT end
  // it (Dispatch ruling on 0dcc84ad3 P3): Live keeps running behind, with
  // audio, as when the app is backgrounded. While another screen is in
  // front, a /end that gives up is a toast, not a panel nobody sees
  // (review d8f8f16e H1).
  useEffect(() => {
    const offBlur = navigation.addListener('blur', () => {
      controller?.setOnScreen(false)
    })
    const offFocus = navigation.addListener('focus', () => {
      controller?.setOnScreen(true)
      // Back on a Live left under another route (review 563477989 K3): its
      // exits work again.
      left.current = false
    })
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
          bound={state.reuseBound}
          onContinue={() => void controller?.continueHere()}
          onEndOpen={() => {
            setLeaveWhenEnded(true)
            void controller?.endOpen()
          }}
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
 * `reused`). Ruling (review 7919b5692 item 8; Dispatch on 563477989):
 * - this device held it (it has the holder's key, R3's mayReplace): "Still
 *   open on your other device" with "Take over here";
 * - bound, but another device holds it: "Still open on your other device",
 *   no takeover;
 * - unbound (no key): it can't continue here, "Couldn't reconnect".
 * Nothing here sends /end on its own. The owner can end it for every device
 * (the toast after a failed end sends them here for that).
 */
function Reuse({
  displayName,
  canTakeOver = false,
  bound = false,
  onContinue,
  onEndOpen,
  onCancel,
}: {
  displayName: string
  canTakeOver?: boolean
  bound?: boolean
  onContinue: () => void
  onEndOpen: () => void
  onCancel: () => void
}) {
  const {t: l} = useLingui()
  return (
    <Panel testID="agentLiveReuse">
      <AgentName displayName={displayName} />
      <Text
        testID="agentLiveReuseTitle"
        style={[a.text_md, a.font_bold, {color: ON_STAGE_TEXT}]}>
        {bound ? (
          <Trans>Still open on your other device</Trans>
        ) : (
          <Trans>Couldn’t reconnect</Trans>
        )}
      </Text>
      <Text style={[a.text_md, {color: ON_STAGE_TEXT}]}>
        {canTakeOver ? (
          <Trans>
            A live session with this agent is open. Take it over here, or end
            it. If another device is still connected, it keeps the session.
          </Trans>
        ) : bound ? (
          <Trans>
            A live session with this agent is open on your other device. End it
            there, or end it here for every device.
          </Trans>
        ) : (
          <Trans>
            A live session with this agent is open, and this device can’t
            continue it. End it on the other device, or end it here for every
            device.
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
        testID="agentLiveEndOpenButton"
        label={l`End the live session on every device`}
        color="negative"
        size="large"
        onPress={onEndOpen}>
        <ButtonText>
          <Trans>End the live session</Trans>
        </ButtonText>
      </Button>
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
          return l`Live needs a server update that isn’t available yet, so Live stopped on this device. Try again after the update.`
        case 'reconnect_failed':
          return l`Couldn’t reconnect, so the live session has ended.`
        case 'no_join':
          return l`Couldn’t reach your agent. Try again later.`
        case 'agent_unavailable':
          return l`Your agent couldn’t start. Try again later.`
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
      case 'refused_reconnect':
        return l`Couldn’t reconnect: this device’s joins were refused, so it stopped here. The live session wasn’t ended: open Live again to end it, or it ends on its own at its time limit.`
      case 'refused':
        return l`The live session was refused here, so it stopped on this device. It wasn’t ended: open Live again to end it, or it ends on its own at its time limit.`
      case 'left_open':
        return l`You left the live session. It’s still open on your other device and wasn’t ended. End it there, or open Live again to end it.`
      case 'still_open_elsewhere':
        return l`Couldn’t take the live session over: it’s still open on your other device, and it wasn’t ended. End it there, or open Live again to end it.`
      case 'consent_withdrawn':
        return l`The live session stopped because consent was withdrawn.`
      case 'ended_elsewhere':
        return l`The live session has ended.`
      default:
        // A drop we didn't ask for ends nothing (P4): don't say it ended.
        return state.leftRunning
          ? l`The connection to the live session closed.`
          : l`Live session ended.`
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
      {state.leftRunning ? (
        <Text
          testID="agentLiveLeftRunning"
          style={[a.text_sm, {color: ON_STAGE_TEXT}]}>
          <Trans>
            The live session wasn’t ended: open Live again to end it, or it ends
            on its own at its time limit.
          </Trans>
        </Text>
      ) : null}
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
