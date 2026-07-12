import {useCallback, useEffect, useRef, useState} from 'react'
import {
  AppState,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native'
// KEYBOARD AVOIDANCE: drive the composer off the controller's animated keyboard
// height (useReanimatedKeyboardAnimation) — the SAME primitive the working DM
// composer uses (via KeyboardStickyView). The app mounts <KeyboardProvider>
// (App.native.tsx), which intercepts the native keyboard frame; under it BOTH
// RN's KeyboardAvoidingView AND keyboard-controller's KeyboardAvoidingView failed
// to lift this composer on iOS (the reported bug: input + send stuck behind the
// keyboard). Instead, an animated spacer below the composer grows with the
// keyboard and pushes the whole column up, so the input rides flush to the
// keyboard top on iOS + Android. Stays 0 on web (no soft keyboard).
import {useReanimatedKeyboardAnimation} from 'react-native-keyboard-controller'
import Animated, {useAnimatedStyle} from 'react-native-reanimated'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {Image} from 'expo-image'
import {useNavigation} from '@react-navigation/native'

import {
  type ChatMessage,
  DEFAULT_AGENT,
  pickActiveVoiceId,
  pickAgentHeaderName,
  uploadChatImage,
} from '#/lib/agent-runtime'
import {useIsKeyboardVisible} from '#/lib/hooks/useIsKeyboardVisible'
import {openPicker} from '#/lib/media/picker'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {usePersonasQuery} from '#/state/queries/personas'
import {useThreadMembersQuery, useThreadsQuery} from '#/state/queries/threads'
import {useSession} from '#/state/session'
import {atoms as a, useBreakpoints, useTheme} from '#/alf'
import {Button, ButtonIcon} from '#/components/Button'
import {Image_Stroke2_Corner0_Rounded as ImageIcon} from '#/components/icons/Image'
import {Microphone_Stroke2_Corner0_Rounded as MicIcon} from '#/components/icons/Microphone'
import {PaperPlaneVertical_Filled_Stroke2_Corner1_Rounded as SendIcon} from '#/components/icons/PaperPlane'
import {SpeakerVolumeFull_Stroke2_Corner0_Rounded as SpeakerIcon} from '#/components/icons/Speaker'
import {TimesLarge_Stroke2_Corner0_Rounded as CloseIcon} from '#/components/icons/Times'
import * as Layout from '#/components/Layout'
import {Loader} from '#/components/Loader'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {canSend, type ChatAttachment, imagesForSend} from './attachment'
import {groupSenderLabel, isSelfSender} from './attribution'
import {agentChatHeaderTitleSize} from './headerTitleStyle'
import {MessageBubble} from './MessageBubble'
import {useAgentChat} from './useAgentChat'
import {useAgentDisplayName} from './useAgentDisplayName'
import {useVoiceConversation} from './useVoiceConversation'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'AgentChat'>

export function AgentChatScreen({route}: Props) {
  // Navigating between chats reuses this mounted screen with new params (the route
  // name is the same), which used to leak one thread's messages into another and
  // block re-hydration (the hydrate-on-mount guard only seeds an EMPTY list). Keying
  // the inner screen by thread (or 1:1 agent — each owned agent is its own thread
  // now) makes every chat switch a clean mount.
  return (
    <AgentChatScreenInner
      key={route.params?.threadId ?? route.params?.agent ?? 'default'}
      agent={route.params?.agent}
      threadId={route.params?.threadId}
      threadTitle={route.params?.threadTitle}
      sharedPhotoUri={route.params?.sharedPhotoUri}
      sharedPhotoMime={route.params?.sharedPhotoMime}
    />
  )
}

/**
 * The 1:1 chat surface without the screen chrome (no Layout.Screen, no header),
 * for embedding as the AgentHub's Chat tab. Same machine, same transport — only
 * the shell differs. Voice status + the spoken-replies toggle render as a slim
 * inline row instead of the header.
 */
export function AgentChatEmbedded({agent}: {agent: string}) {
  return <AgentChatScreenInner key={agent} agent={agent} embedded />
}

function AgentChatScreenInner({
  agent: agentParam,
  threadId,
  threadTitle,
  sharedPhotoUri,
  sharedPhotoMime,
  embedded = false,
}: {
  agent?: string
  threadId?: string
  threadTitle?: string
  sharedPhotoUri?: string
  sharedPhotoMime?: string
  embedded?: boolean
}) {
  const t = useTheme()
  const {gtMobile} = useBreakpoints()
  // SINGLE-LOGIN: the agent channel authenticates with the user's atproto/PDS
  // session (their DID) — the same login that's required to be in the app — so we
  // gate on that session, not a separate Authority One (Supabase) account.
  const {hasSession, currentAccount} = useSession()
  const navigation = useNavigation<NavigationProp>()
  // Home-indicator inset: the composer keeps this gap below it when the keyboard
  // is CLOSED, and collapses it to 0 as the keyboard opens (the keyboard then
  // provides the bottom inset), so the input hugs the keyboard top.
  const insets = useSafeAreaInsets()
  // Still used to re-pin the scroll to the newest bubble when the keyboard opens.
  const [isKeyboardVisible] = useIsKeyboardVisible({iosUseWillEvents: true})
  // The whole chat column (scroll area + composer) rides UP by the keyboard
  // height: the spacer below the composer grows from 0 to the keyboard height,
  // shrinking the flex scroll area and lifting the composer flush onto the
  // keyboard. Driven by the controller's animated keyboard value so it tracks the
  // real open/close animation. Height stays 0 on web (no soft keyboard).
  const keyboardAnim = useReanimatedKeyboardAnimation()
  const keyboardSpacerStyle = useAnimatedStyle(() => ({
    height: Math.max(0, -keyboardAnim.height.get()),
  }))
  const composerInsetStyle = useAnimatedStyle(() => ({
    paddingBottom: insets.bottom * (1 - keyboardAnim.progress.get()),
  }))
  // The SELECTED agent (E6 selector). Kept undefined when the caller didn't pick
  // one so the transport omits it and the runtime routes to the owner's primary
  // agent — a hardcoded default here would misroute owners once the server-side
  // selector lands. DEFAULT_AGENT survives only as the display-name fallback.
  const agent = agentParam
  // Active persona (name + voice) from the runtime. Degrades to undefined when
  // signed out / unreachable, so the name falls back to the atproto profile.
  const {data: personas} = usePersonasQuery()
  // Dynamic agent display name (header / empty-state / placeholders): the active
  // persona's name wins; otherwise the atproto profile displayName, then the handle.
  const profileName = useAgentDisplayName(agent ?? DEFAULT_AGENT)
  // The runtime's ACTIVE persona belongs to the owner's primary agent — apply its
  // name/voice only for the default (unselected) chat. A selected agent shows its
  // own profile identity instead.
  const agentName = pickAgentHeaderName(
    agent ? undefined : personas?.activeName,
    profileName,
  )
  // Voice-mode voice follows the active persona's voiceId (else the runtime default).
  const personaVoiceId = pickActiveVoiceId(
    agent ? undefined : personas?.activeVoiceId,
  )

  // GROUP HEADER PARTICIPANTS: who's in this chat, at a glance. Agent names first
  // (that's what varies per group); a people-only group falls back to a member count.
  // Tapping the row opens the existing Manage-group screen. Group threads only.
  const membersQuery = useThreadMembersQuery(threadId ?? '')
  const participants = membersQuery.data?.members ?? []

  // Is this thread a GROUP (multiple humans/agents) vs a 1:1 agent thread? Group
  // threads attribute + align every row by SENDER IDENTITY; 1:1 threads keep the
  // role-based rendering (the only human there is the viewer, and the runtime does
  // not stamp sender identity on 1:1 rows). Two independent signals so a foreign
  // group (hosted on another member's agent) still renders as a group while either
  // query is loading: the thread's own kind from the chat list, and a non-empty
  // roster (a group always seeds its owner as a member; a 1:1 thread has none).
  const {data: threadsData} = useThreadsQuery()
  const isGroup =
    !!threadId &&
    (threadsData?.threads.find(th => th.id === threadId)?.kind === 'group' ||
      participants.length > 0)
  const participantAgentNames = participants
    .filter(m => m.isAgent || m.kind === 'agent')
    .map(m => m.name ?? m.handle ?? m.id)
  const participantsLabel = threadId
    ? participantAgentNames.length > 0
      ? participantAgentNames.slice(0, 3).join(', ') +
        (participantAgentNames.length > 3
          ? ` +${participantAgentNames.length - 3}`
          : '')
      : participants.length > 0
        ? `${participants.length} member${participants.length === 1 ? '' : 's'}`
        : null
    : null

  // The CURRENT USER's identity strings, lowercased, so a group row is labeled
  // "You" ONLY when its stamped senderId IS the viewer (DID or handle) — never
  // inferred from role or a stored display name (see fix: "@ok."). Another
  // member's message must show THEIR name from every viewer's perspective.
  const selfIds = new Set(
    [currentAccount?.did, currentAccount?.handle]
      .filter(Boolean)
      .map(s => s!.toLowerCase()),
  )

  // Resolve a sender's display name from the group roster when the row carries an
  // identity but no name (e.g. rows stamped with only a DID/handle).
  const rosterNameFor = (senderId?: string): string | undefined => {
    if (!senderId) return undefined
    const sid = senderId.toLowerCase()
    const member = participants.find(
      p =>
        p.id.toLowerCase() === sid ||
        (p.handle && p.handle.toLowerCase() === sid),
    )
    return member?.name ?? member?.handle
  }

  const groupSenderName = (m: ChatMessage): string | undefined =>
    groupSenderLabel(m, {selfIds, rosterName: rosterNameFor, agentName})

  // Constrain the conversation to a readable, centered column on web/wide
  // screens; on narrow windows / native it falls back to full width.
  const centerColumn = gtMobile
    ? {
        maxWidth: Layout.CENTER_COLUMN_WIDTH,
        width: '100%' as const,
        marginHorizontal: 'auto' as const,
      }
    : null

  const {
    messages,
    isStreaming,
    isHydrating,
    send,
    abort,
    decide,
    transportError,
    retry,
  } = useAgentChat(agent, {threadId, selfSenderId: currentAccount?.did})
  const [input, setInput] = useState('')
  // Single in-progress image attachment for the next turn (one image per message).
  const [attachment, setAttachment] = useState<ChatAttachment | null>(null)

  // Upload a local image to R2, showing a preview while in flight. Shared by the
  // composer attach button and the Photo Context "share a photo with Bob" entry.
  // Resilient: a failed upload leaves a removable "failed" preview, never crashes.
  const attachLocalImage = useCallback(async (uri: string, mime: string) => {
    setAttachment({previewUri: uri, mime, uploading: true})
    const url = await uploadChatImage({uri, mime})
    setAttachment(prev =>
      prev
        ? url
          ? {...prev, uploading: false, url}
          : {...prev, uploading: false, failed: true}
        : prev,
    )
    if (!url) {
      Toast.show('Could not attach image. Remove it and try again.', {
        type: 'warning',
      })
    }
  }, [])

  // Pick an image from the library, then upload + attach it.
  const onAttach = useCallback(async () => {
    try {
      const picked = await openPicker({selectionLimit: 1})
      const img = picked?.[0]
      if (!img) return
      await attachLocalImage(img.path, img.mime)
    } catch {
      // Picker cancelled / permission denied — never crash the composer.
      setAttachment(null)
    }
  }, [attachLocalImage])

  // Explicit per-photo share: when navigated here with a shared photo (from Photo
  // Context), pre-attach it so the owner reviews + sends it through the normal flow.
  useEffect(() => {
    if (sharedPhotoUri) {
      // attachLocalImage flips the attachment into an "uploading" preview then awaits
      // the upload; syncing that external (picker/upload) state into the composer on
      // navigation is the intended effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void attachLocalImage(sharedPhotoUri, sharedPhotoMime ?? 'image/jpeg')
    }
    // Run once per shared-photo param; attachLocalImage is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedPhotoUri, sharedPhotoMime])

  const removeAttachment = useCallback(() => setAttachment(null), [])

  // ~20% larger title than the shared header default, applied only to this screen.
  const headerTitleStyle = {fontSize: agentChatHeaderTitleSize(gtMobile)}
  const [autoSpeak, setAutoSpeak] = useState(true)

  const scrollRef = useRef<ScrollView>(null)
  const wasStreaming = useRef(false)

  // Latest assistant reply text — read by the continuous loop when a turn ends.
  const getReplyText = useCallback(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i].text ?? ''
    }
    return ''
  }, [messages])

  // Continuous, hands-free voice chat (idle ↔ listening ↔ thinking ↔ speaking),
  // with barge-in and the ElevenLabs "Bob" voice. Exposes the shared voice engine
  // (for the partial transcript + text-mode speak) and the single ON/OFF control.
  const {
    voice,
    convState,
    isOn: voiceModeOn,
    toggle: toggleVoiceMode,
  } = useVoiceConversation({
    send: text => send(text),
    isStreaming,
    getReplyText,
    localeId: 'en-US',
    voiceId: personaVoiceId,
  })

  // No manual useCallback: React Compiler memoizes this, and its inferred deps
  // conflicted with a hand-written list once the screen was split per-thread.
  const doSend = (text: string) => {
    if (!canSend(text, attachment, isStreaming)) return
    const images = imagesForSend(attachment)
    // Sending interrupts any ongoing agent speech (barge-in via text, too).
    voice.stopSpeaking()
    setInput('')
    setAttachment(null)
    send(text.trim(), {images: images.length > 0 ? images : undefined})
  }

  // Speak the assistant reply once a TEXT turn finishes streaming (if autoSpeak on).
  // In continuous voice mode the loop already speaks the reply, so skip it here to
  // avoid double playback.
  useEffect(() => {
    if (wasStreaming.current && !isStreaming) {
      const last = messages[messages.length - 1]
      if (
        !voiceModeOn &&
        autoSpeak &&
        last?.role === 'assistant' &&
        last.text
      ) {
        voice.speak(last.text)
      }
    }
    wasStreaming.current = isStreaming
  }, [isStreaming, messages, autoSpeak, voiceModeOn, voice])

  // Keep pinned to the newest message.
  const onContentSizeChange = useCallback(() => {
    scrollRef.current?.scrollToEnd({animated: true})
  }, [])

  // When the keyboard OPENS, the content size doesn't change, so the pin-to-newest
  // above doesn't fire — scroll to the latest message so the newest bubble isn't
  // hidden behind the (now smaller) visible area above the keyboard. Native-only
  // by nature: web has no soft keyboard, so isKeyboardVisible stays false there.
  useEffect(() => {
    if (isKeyboardVisible) {
      scrollRef.current?.scrollToEnd({animated: true})
    }
  }, [isKeyboardVisible])

  // RESUME FROM BACKGROUND: when the app returns to the foreground the keyboard
  // spacer collapses (the OS dismissed the keyboard while backgrounded), and a
  // plain ScrollView snaps its offset to the top on that parent-height change —
  // so the chat "collapsed up near the top" on
  // resume. maintainVisibleContentPosition on the list (below) holds position
  // across the layout change; this belt re-pins to the newest message on the
  // next frame so the returning user lands on the latest bubble, not the top.
  // Native-only: web has no background/foreground keyboard cycle.
  useEffect(() => {
    if (Platform.OS === 'web') return
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') {
        requestAnimationFrame(() =>
          scrollRef.current?.scrollToEnd({animated: false}),
        )
      }
    })
    return () => sub.remove()
  }, [])

  const showMic = voice.capabilities.available
  // Show the live partial transcript whenever the mic is actively capturing the
  // user (continuous listening — not while thinking/speaking).
  const micActive = voice.listening && convState !== 'speaking'

  // One-line status for the header while continuous voice mode is on.
  const voiceStatusLabel =
    convState === 'listening'
      ? 'Listening…'
      : convState === 'thinking'
        ? `${agentName} is thinking…`
        : convState === 'speaking'
          ? `${agentName} is speaking…`
          : null

  // SINGLE-LOGIN: the agent channel rides the atproto/PDS session, so being in the
  // app already authorizes the agent — there is no second "Authority One account"
  // to sign into. This guard is effectively unreachable (the app requires a
  // session), but keep a quiet fallback instead of a dead composer just in case.
  if (!hasSession) {
    if (embedded) {
      return (
        <View style={[a.flex_1, a.align_center, a.justify_center, a.px_xl]}>
          <Text
            style={[a.text_md, t.atoms.text_contrast_medium, a.text_center]}>
            Sign in to chat with {agentName}.
          </Text>
        </View>
      )
    }
    return (
      <Layout.Screen>
        <Layout.Header.Outer>
          <Layout.Header.BackButton />
          <Layout.Header.Content>
            <Layout.Header.TitleText style={headerTitleStyle}>
              {`Talk to ${agentName}`}
            </Layout.Header.TitleText>
          </Layout.Header.Content>
        </Layout.Header.Outer>
        <View
          style={[
            a.flex_1,
            a.align_center,
            a.justify_center,
            a.px_xl,
            a.gap_lg,
          ]}>
          <Text
            style={[a.text_md, t.atoms.text_contrast_medium, a.text_center]}>
            {/* Plain literal so it never depends on the compiled Lingui catalog. */}
            Sign in to chat with {agentName}.
          </Text>
        </View>
      </Layout.Screen>
    )
  }

  const header = (
    <Layout.Header.Outer>
      <Layout.Header.BackButton />
      <Layout.Header.Content>
        <Layout.Header.TitleText style={headerTitleStyle}>
          {threadTitle ?? `Talk to ${agentName}`}
        </Layout.Header.TitleText>
        {voiceModeOn && voiceStatusLabel ? (
          <Layout.Header.SubtitleText>
            {voiceStatusLabel}
          </Layout.Header.SubtitleText>
        ) : participantsLabel ? (
          // Compact participant indicator for group chats — the agents in this
          // session at a glance. Tapping opens the existing Manage-group screen.
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View group members"
            accessibilityHint="Opens the manage group screen"
            onPress={() =>
              threadId
                ? navigation.navigate('GroupManage', {
                    threadId,
                    title: threadTitle ?? '',
                  })
                : undefined
            }>
            <Layout.Header.SubtitleText>
              {participantsLabel}
            </Layout.Header.SubtitleText>
          </Pressable>
        ) : !showMic ? (
          <Layout.Header.SubtitleText>
            Voice unavailable on this device
          </Layout.Header.SubtitleText>
        ) : null}
      </Layout.Header.Content>
      {/* Toggle auto-speak of replies. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Toggle spoken replies"
        accessibilityHint=""
        onPress={() => {
          if (autoSpeak) voice.stopSpeaking()
          setAutoSpeak(v => !v)
        }}
        style={[a.p_sm, a.rounded_full, !autoSpeak && {opacity: 0.4}]}>
        <SpeakerIcon size="md" fill={t.atoms.text.color} />
      </Pressable>
    </Layout.Header.Outer>
  )

  const chatBody = (
    <View style={[a.flex_1]}>
      <ScrollView
        ref={scrollRef}
        style={[a.flex_1]}
        contentContainerStyle={[
          a.px_md,
          a.py_lg,
          a.gap_sm,
          {flexGrow: 1},
          centerColumn,
        ]}
        onContentSizeChange={onContentSizeChange}
        // Hold the visible content in place when the parent frame changes (keyboard
        // show/hide, and especially app resume-from-background) instead of snapping
        // the ScrollView offset to the top. Same fix Messages/PostThread use. Native
        // only — web ScrollView doesn't support it (and has no soft-keyboard cycle).
        maintainVisibleContentPosition={
          Platform.OS === 'web' ? undefined : {minIndexForVisible: 0}
        }
        keyboardDismissMode="interactive">
        {messages.length === 0 && isHydrating ? (
          // Recent thread is loading — show a quiet loader instead of the empty-state
          // copy so a returning user doesn't see a flash of "blank chat".
          <View style={[a.flex_1, a.align_center, a.justify_center, a.pt_5xl]}>
            <Loader size="lg" />
          </View>
        ) : messages.length === 0 ? (
          <View style={[a.flex_1, a.align_center, a.justify_center, a.pt_5xl]}>
            <Text
              style={[a.text_md, t.atoms.text_contrast_medium, a.text_center]}>
              {`Ask ${agentName} anything. Tap the mic to start a hands-free voice chat — talk naturally and interrupt any time.`}
            </Text>
          </View>
        ) : (
          messages.map(m => (
            <MessageBubble
              key={m.id}
              message={m}
              // GROUP threads attribute + align every message by sender identity;
              // 1:1 chat shows no per-message name and keeps role-based alignment.
              // "You" AND right-alignment both require the row's stamped senderId
              // to BE the current account (strict identity match) — role alone
              // never decides, so another member's turn always renders on the LEFT
              // under THEIR name, from every viewer's perspective.
              senderName={isGroup ? groupSenderName(m) : undefined}
              isSelf={isGroup ? isSelfSender(m, selfIds) : undefined}
              decideDisabled={isStreaming}
              onDecision={(action, decision) => {
                void decide(action, decision)
              }}
            />
          ))
        )}
      </ScrollView>

      {/* Live partial transcript while listening. */}
      {micActive ? (
        <View style={[t.atoms.bg_contrast_25]}>
          <View style={[a.px_md, a.py_sm, a.w_full, centerColumn]}>
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              {/* Plain literal (not a Lingui msg): the compiled catalog miss is what
                  renders this listening-state placeholder as a raw message ID
                  ("ZVCRHy"), exactly like the idle composer placeholder we fixed. */}
              {voice.partial ? voice.partial : 'Listening…'}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Transport failure (dropped connection) — a quiet, tappable retry row,
          NOT a fake assistant bubble with a raw network string. Tapping replays
          the failed turn. Real server/agent errors still render as a message. */}
      {transportError ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Couldn't reach ${agentName} — tap to retry`}
          accessibilityHint="Resends your last message"
          onPress={retry}
          style={[a.w_full, centerColumn]}>
          <View
            style={[
              a.flex_row,
              a.align_center,
              a.justify_center,
              a.gap_xs,
              a.px_md,
              a.py_sm,
            ]}>
            <Text
              style={[a.text_sm, t.atoms.text_contrast_medium, a.text_center]}>
              {`Couldn't reach ${agentName} — tap to retry`}
            </Text>
          </View>
        </Pressable>
      ) : null}

      {/* Composer — pinned to bottom, aligned to the centered column. The
          animated bottom inset collapses the home-indicator gap as the keyboard
          opens so the input hugs the keyboard top. */}
      <Animated.View
        style={[a.border_t, t.atoms.border_contrast_low, composerInsetStyle]}>
        {/* Pending image attachment preview — thumbnail with an upload spinner /
            failure state and a remove button. Sits above the input row. */}
        {attachment ? (
          <View style={[a.px_md, a.pt_sm, a.w_full, centerColumn]}>
            <View style={[a.flex_row, a.align_center, a.gap_sm]}>
              <View>
                <Image
                  source={{uri: attachment.previewUri}}
                  style={[a.rounded_sm, {width: 56, height: 56}]}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                  alt="Attached image preview"
                />
                {attachment.uploading ? (
                  <View
                    style={[
                      a.absolute,
                      a.inset_0,
                      a.align_center,
                      a.justify_center,
                      a.rounded_sm,
                      {backgroundColor: 'rgba(0,0,0,0.35)'},
                    ]}>
                    <Loader size="sm" />
                  </View>
                ) : null}
              </View>
              <Text style={[a.flex_1, a.text_sm, t.atoms.text_contrast_medium]}>
                {attachment.uploading
                  ? 'Uploading image…'
                  : attachment.failed
                    ? 'Upload failed — remove and try again'
                    : 'Image ready to send'}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove attached image"
                accessibilityHint=""
                onPress={removeAttachment}
                style={[a.p_sm, a.rounded_full]}>
                <CloseIcon
                  size="sm"
                  fill={t.atoms.text_contrast_medium.color}
                />
              </Pressable>
            </View>
          </View>
        ) : null}
        <View
          style={[
            a.flex_row,
            a.align_center,
            a.gap_sm,
            a.px_md,
            a.py_sm,
            a.w_full,
            centerColumn,
          ]}>
          {showMic ? (
            // Single ON/OFF control for continuous, hands-free voice chat. ON =
            // a live "call" with Bob (listen → reply → listen, with barge-in);
            // OFF = back to text. One toggle, not a per-message button.
            <Button
              label={voiceModeOn ? 'End voice chat' : 'Start voice chat'}
              size="large"
              shape="round"
              variant="solid"
              color={voiceModeOn ? 'negative' : 'secondary'}
              onPress={toggleVoiceMode}>
              <ButtonIcon icon={MicIcon} />
            </Button>
          ) : null}

          {/* Attach an image. Disabled in voice mode, while a turn streams, or when an
            attachment is already pending (one image per message). */}
          <Button
            label="Attach image"
            size="large"
            shape="round"
            variant="solid"
            color="secondary"
            disabled={voiceModeOn || isStreaming || attachment !== null}
            onPress={() => {
              void onAttach()
            }}>
            <ButtonIcon icon={ImageIcon} />
          </Button>

          <TextInput
            accessibilityLabel="Text input field"
            accessibilityHint="Type a message to send to the agent"
            value={input}
            onChangeText={setInput}
            // Plain literal (not a Lingui msg): the compiled catalog miss is what
            // renders the placeholder as a raw message ID ("l9RW8S").
            placeholder={`Message ${agentName}…`}
            placeholderTextColor={t.atoms.text_contrast_low.color}
            multiline
            style={[
              a.flex_1,
              a.px_md,
              a.py_sm,
              a.rounded_full,
              a.text_md,
              t.atoms.bg_contrast_25,
              t.atoms.text,
              {maxHeight: 120},
            ]}
            onSubmitEditing={() => doSend(input)}
            editable={!voiceModeOn}
          />

          {isStreaming ? (
            <Button
              label="Stop"
              size="large"
              shape="round"
              variant="solid"
              color="secondary"
              onPress={abort}>
              <ButtonIcon icon={SpeakerIcon} />
            </Button>
          ) : (
            <Button
              label="Send"
              size="large"
              shape="round"
              variant="solid"
              color="primary"
              disabled={!canSend(input, attachment, isStreaming)}
              onPress={() => doSend(input)}>
              <ButtonIcon icon={SendIcon} />
            </Button>
          )}
        </View>
      </Animated.View>
      {/* Grows with the keyboard, lifting the column so the composer sits flush
          above it. Height is 0 on web and whenever the keyboard is closed. */}
      <Animated.View style={keyboardSpacerStyle} />
    </View>
  )

  // EMBEDDED (AgentHub Chat tab): no screen chrome — the hub owns the header.
  // Voice status + the spoken-replies toggle move into a slim inline row.
  if (embedded) {
    return (
      <View style={[a.flex_1]}>
        <View
          style={[
            a.flex_row,
            a.align_center,
            a.justify_end,
            a.gap_sm,
            a.px_md,
          ]}>
          {voiceModeOn && voiceStatusLabel ? (
            <Text style={[a.flex_1, a.text_sm, t.atoms.text_contrast_medium]}>
              {voiceStatusLabel}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Toggle spoken replies"
            accessibilityHint=""
            onPress={() => {
              if (autoSpeak) voice.stopSpeaking()
              setAutoSpeak(v => !v)
            }}
            style={[a.p_xs, a.rounded_full, !autoSpeak && {opacity: 0.4}]}>
            <SpeakerIcon size="sm" fill={t.atoms.text.color} />
          </Pressable>
        </View>
        {chatBody}
      </View>
    )
  }

  return (
    <Layout.Screen>
      {header}
      {chatBody}
    </Layout.Screen>
  )
}
