import {useCallback, useEffect, useRef, useState} from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {DEFAULT_AGENT} from '#/lib/agent-runtime'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon} from '#/components/Button'
import {Microphone_Stroke2_Corner0_Rounded as MicIcon} from '#/components/icons/Microphone'
import {PaperPlaneVertical_Filled_Stroke2_Corner1_Rounded as SendIcon} from '#/components/icons/PaperPlane'
import {SpeakerVolumeFull_Stroke2_Corner0_Rounded as SpeakerIcon} from '#/components/icons/Speaker'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'
import {MessageBubble} from './MessageBubble'
import {useAgentChat} from './useAgentChat'
import {useVoice} from './useVoice'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'AgentChat'>

export function AgentChatScreen({route}: Props) {
  const t = useTheme()
  const {_} = useLingui()
  const insets = useSafeAreaInsets()
  const agent = route.params?.agent ?? DEFAULT_AGENT

  const {messages, isStreaming, send, abort, decide} = useAgentChat(agent)
  const [input, setInput] = useState('')
  const [autoSpeak, setAutoSpeak] = useState(true)

  const scrollRef = useRef<ScrollView>(null)
  const wasStreaming = useRef(false)

  // Voice: barge-in + final-utterance → send.
  const voice = useVoice({
    localeId: 'en-US',
    onFinalUserUtterance: text => {
      if (text.trim()) doSend(text)
    },
  })

  const doSend = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      // Sending interrupts any ongoing agent speech (barge-in via text, too).
      voice.stopSpeaking()
      setInput('')
      send(trimmed)
    },
    [send, voice],
  )

  // Speak the assistant reply once the turn finishes streaming (if autoSpeak on).
  useEffect(() => {
    if (wasStreaming.current && !isStreaming) {
      const last = messages[messages.length - 1]
      if (autoSpeak && last?.role === 'assistant' && last.text) {
        voice.speak(last.text)
      }
    }
    wasStreaming.current = isStreaming
  }, [isStreaming, messages, autoSpeak, voice])

  // Keep pinned to the newest message.
  const onContentSizeChange = useCallback(() => {
    scrollRef.current?.scrollToEnd({animated: true})
  }, [])

  const micActive = voice.listening
  const showMic = voice.capabilities.available

  return (
    <Layout.Screen>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>Talk to {agent}</Trans>
          </Layout.Header.TitleText>
          {!showMic ? (
            <Layout.Header.SubtitleText>
              <Trans>Voice unavailable on this device</Trans>
            </Layout.Header.SubtitleText>
          ) : null}
        </Layout.Header.Content>
        {/* Toggle auto-speak of replies. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={_(msg`Toggle spoken replies`)}
          accessibilityHint=""
          onPress={() => {
            if (autoSpeak) voice.stopSpeaking()
            setAutoSpeak(v => !v)
          }}
          style={[a.p_sm, a.rounded_full, !autoSpeak && {opacity: 0.4}]}>
          <SpeakerIcon size="md" fill={t.atoms.text.color} />
        </Pressable>
      </Layout.Header.Outer>

      <KeyboardAvoidingView
        style={[a.flex_1]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 44}>
        <ScrollView
          ref={scrollRef}
          style={[a.flex_1]}
          contentContainerStyle={[a.p_md, a.gap_2xs]}
          onContentSizeChange={onContentSizeChange}
          keyboardDismissMode="interactive">
          {messages.length === 0 ? (
            <View
              style={[a.flex_1, a.align_center, a.justify_center, a.pt_5xl]}>
              <Text
                style={[
                  a.text_md,
                  t.atoms.text_contrast_medium,
                  a.text_center,
                ]}>
                <Trans>
                  Ask {agent} anything. Tap the mic to talk — interrupt any
                  time.
                </Trans>
              </Text>
            </View>
          ) : (
            messages.map(m => (
              <MessageBubble
                key={m.id}
                message={m}
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
          <View style={[a.px_md, a.py_sm, t.atoms.bg_contrast_25]}>
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              {voice.partial ? voice.partial : _(msg`Listening…`)}
            </Text>
          </View>
        ) : null}

        {/* Composer */}
        <View
          style={[
            a.flex_row,
            a.align_center,
            a.gap_sm,
            a.px_md,
            a.py_sm,
            a.border_t,
            t.atoms.border_contrast_low,
            {paddingBottom: insets.bottom + 8},
          ]}>
          {showMic ? (
            <Button
              label={
                micActive ? _(msg`Stop listening`) : _(msg`Start listening`)
              }
              size="large"
              shape="round"
              variant="solid"
              color={micActive ? 'negative' : 'secondary'}
              onPress={() => {
                if (micActive) {
                  voice.stopListening()
                } else {
                  void voice.startListening()
                }
              }}>
              <ButtonIcon icon={MicIcon} />
            </Button>
          ) : null}

          <TextInput
            accessibilityLabel="Text input field"
            accessibilityHint="Type a message to send to the agent"
            value={input}
            onChangeText={setInput}
            placeholder={_(msg`Message ${agent}`)}
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
            editable={!micActive}
          />

          {isStreaming ? (
            <Button
              label={_(msg`Stop`)}
              size="large"
              shape="round"
              variant="solid"
              color="secondary"
              onPress={abort}>
              <ButtonIcon icon={SpeakerIcon} />
            </Button>
          ) : (
            <Button
              label={_(msg`Send`)}
              size="large"
              shape="round"
              variant="solid"
              color="primary"
              disabled={!input.trim()}
              onPress={() => doSend(input)}>
              <ButtonIcon icon={SendIcon} />
            </Button>
          )}
        </View>
      </KeyboardAvoidingView>
    </Layout.Screen>
  )
}
