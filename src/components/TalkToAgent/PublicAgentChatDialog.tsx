import {useCallback, useEffect, useRef, useState} from 'react'
import {ActivityIndicator, Keyboard, ScrollView, View} from 'react-native'

import {
  fetchPublicAgentAudioBase64,
  playAgentClipBase64,
  publicChat,
  type PublicChatConversionCard,
} from '#/lib/agent-runtime'
import {logger} from '#/logger'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {type DialogControlProps} from '#/components/Dialog'
import {Text} from '#/components/Typography'
import {IS_WEB} from '#/env'

interface Msg {
  role: 'visitor' | 'agent' | 'note'
  text: string
}

/**
 * PUBLIC "TALK TO <AGENT>" chat sheet (§3.6 / E7). A non-owner / anonymous visitor types a
 * message; the runtime replies AS the agent's persona (structurally fenced, read-only) with
 * TEXT plus — when available — spoken audio in the agent's assigned voice. Works on WEB
 * (HTMLAudioElement) and native: playback is kicked from the send-button gesture chain so the
 * browser autoplay policy is satisfied. When the refreshing trial budget is exhausted the
 * composer is replaced by a Follow/subscribe conversion card. Audio is always optional — text
 * renders with or without it.
 */
export function PublicAgentChatDialog({
  control,
  agent,
  displayName,
  following,
  onFollow,
  subscribeUrl,
}: {
  control: DialogControlProps
  /** The agent's atproto handle (the runtime targets it by handle). */
  agent: string
  displayName: string
  following: boolean
  onFollow?: () => void
  subscribeUrl?: string | null
}) {
  return (
    <Dialog.Outer control={control}>
      <Dialog.Handle />
      <Inner
        agent={agent}
        displayName={displayName}
        following={following}
        onFollow={onFollow}
        subscribeUrl={subscribeUrl}
      />
    </Dialog.Outer>
  )
}

function Inner({
  agent,
  displayName,
  following,
  onFollow,
  subscribeUrl,
}: {
  agent: string
  displayName: string
  following: boolean
  onFollow?: () => void
  subscribeUrl?: string | null
}) {
  const t = useTheme()
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [card, setCard] = useState<PublicChatConversionCard | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const stopAudioRef = useRef<(() => void) | null>(null)
  const scrollRef = useRef<ScrollView>(null)

  // Stop any in-flight audio on unmount.
  useEffect(() => {
    return () => {
      stopAudioRef.current?.()
    }
  }, [])

  const onSend = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return
    Keyboard.dismiss()
    setInput('')
    setMessages(prev => [...prev, {role: 'visitor', text}])
    setSending(true)
    // Barge-in: cut any previous clip before the next turn.
    stopAudioRef.current?.()
    stopAudioRef.current = null
    try {
      const res = await publicChat({agent, message: text, sessionId: sessionIdRef.current})
      if (res.ok) {
        sessionIdRef.current = res.sessionId || sessionIdRef.current
        setMessages(prev => [...prev, {role: 'agent', text: res.message}])
        // VOICE: fetch + play in the SAME gesture-initiated chain (web autoplay policy).
        if (res.hasVoice) {
          const b64 = await fetchPublicAgentAudioBase64({
            agent,
            text: res.message,
            sessionId: sessionIdRef.current,
          })
          if (b64) stopAudioRef.current = playAgentClipBase64(b64)
        }
        // The turn that spends the last of the allowance still answers; the NEXT send shows
        // the card. If the runtime already flags exhaustion, surface a gentle inline note.
        if (res.exhausted) {
          setMessages(prev => [
            ...prev,
            {role: 'note', text: `That's the last of today's free chat with ${displayName}. Send again to see how to keep going.`},
          ])
        }
      } else if (res.kind === 'exhausted') {
        setCard(
          res.cta ?? {
            kind: 'follow-subscribe',
            title: `You've used today's free chat with ${displayName}`,
            body: `It refreshes soon. Follow ${displayName} to keep chatting, or subscribe.`,
            resetsAt: res.resetsAt,
            actions: [
              {type: 'follow', handle: agent, label: `Follow`},
              {type: 'subscribe', url: subscribeUrl ?? null, label: 'Subscribe'},
            ],
          },
        )
      } else if (res.code === 'unknown-agent' || res.code === 'public-chat-disabled') {
        setMessages(prev => [...prev, {role: 'note', text: `${displayName} isn't available to chat right now.`}])
      } else {
        setMessages(prev => [...prev, {role: 'note', text: 'Something went wrong — please try again.'}])
      }
    } catch (e) {
      logger.warn('public chat send failed', {safeMessage: e})
      setMessages(prev => [...prev, {role: 'note', text: 'Something went wrong — please try again.'}])
    } finally {
      setSending(false)
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({animated: true}))
    }
  }, [agent, displayName, input, sending, subscribeUrl])

  const followFromCard = useCallback(() => {
    onFollow?.()
    setCard(null)
    setMessages(prev => [...prev, {role: 'note', text: `You're following ${displayName}. Keep the conversation going!`}])
  }, [displayName, onFollow])

  const openSubscribe = useCallback(() => {
    const url = subscribeUrl ?? card?.actions.find(x => x.type === 'subscribe')?.url ?? null
    if (url && IS_WEB && typeof window !== 'undefined') window.open(url, '_blank', 'noopener')
  }, [card, subscribeUrl])

  return (
    <Dialog.ScrollableInner label={`Talk to ${displayName}`}>
      <View style={[a.gap_sm, a.pb_sm]}>
        <Text style={[a.text_lg, a.font_bold, t.atoms.text]}>Talk to {displayName}</Text>
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          A quick taste of {displayName}. Free daily chat — it refreshes each day.
        </Text>
      </View>

      <ScrollView ref={scrollRef} style={{maxHeight: 360}} contentContainerStyle={[a.gap_sm, a.py_sm]}>
        {messages.length === 0 && !card ? (
          <Text style={[a.text_sm, a.py_md, t.atoms.text_contrast_medium]}>
            Say hi to start the conversation.
          </Text>
        ) : null}
        {messages.map((m, i) => (
          <View
            key={i}
            style={[
              a.rounded_md,
              a.px_md,
              a.py_sm,
              m.role === 'visitor'
                ? [a.self_end, {backgroundColor: t.palette.primary_500}]
                : m.role === 'agent'
                  ? [a.self_start, t.atoms.bg_contrast_25]
                  : [a.self_center, {maxWidth: '90%'}],
            ]}>
            <Text
              style={[
                a.text_sm,
                m.role === 'visitor'
                  ? {color: 'white'}
                  : m.role === 'note'
                    ? t.atoms.text_contrast_medium
                    : t.atoms.text,
              ]}>
              {m.text}
            </Text>
          </View>
        ))}
        {sending ? (
          <View style={[a.self_start, a.px_md, a.py_sm]}>
            <ActivityIndicator size="small" />
          </View>
        ) : null}
      </ScrollView>

      {card ? (
        <View style={[a.gap_sm, a.pt_sm, a.border_t, t.atoms.border_contrast_low]}>
          <Text style={[a.text_md, a.font_bold, t.atoms.text]}>{card.title}</Text>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>{card.body}</Text>
          <View style={[a.flex_row, a.gap_sm, a.pt_xs]}>
            <Button
              label={`Follow ${displayName}`}
              size="small"
              color="primary"
              disabled={following}
              onPress={followFromCard}>
              <ButtonText>{following ? 'Following' : `Follow ${displayName}`}</ButtonText>
            </Button>
            {(subscribeUrl || card.actions.some(x => x.type === 'subscribe' && x.url)) && (
              <Button label="Subscribe" size="small" color="secondary" onPress={openSubscribe}>
                <ButtonText>Subscribe</ButtonText>
              </Button>
            )}
          </View>
        </View>
      ) : (
        <View style={[a.flex_row, a.gap_sm, a.align_center, a.pt_sm]}>
          <View style={a.flex_1}>
            <Dialog.Input
              label={`Message ${displayName}`}
              placeholder={`Message ${displayName}…`}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => void onSend()}
              editable={!sending}
              returnKeyType="send"
            />
          </View>
          <Button
            label="Send"
            size="small"
            color="primary"
            disabled={sending || !input.trim()}
            onPress={() => void onSend()}>
            <ButtonText>Send</ButtonText>
          </Button>
        </View>
      )}

      <Dialog.Close />
    </Dialog.ScrollableInner>
  )
}
