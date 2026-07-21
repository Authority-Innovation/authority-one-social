import {useCallback, useRef, useState} from 'react'
import {ScrollView, TextInput, View} from 'react-native'
import {useReanimatedKeyboardAnimation} from 'react-native-keyboard-controller'
import Animated, {useAnimatedStyle} from 'react-native-reanimated'

import {type ChatMessage} from '#/lib/agent-runtime'
import {useBottomBarOffset} from '#/lib/hooks/useBottomBarOffset'
import {isSelfSender} from '#/screens/AgentChat/attribution'
import {MessageBubble} from '#/screens/AgentChat/MessageBubble'
import {atoms as a, tokens, useTheme, web} from '#/alf'
import {Button, ButtonIcon} from '#/components/Button'
import {PaperPlaneVertical_Filled_Stroke2_Corner1_Rounded as SendIcon} from '#/components/icons/PaperPlane'
import {Text} from '#/components/Typography'
import {IS_WEB} from '#/env'

/**
 * The game room's chat lane — the SAME bubble surface as agent/group chat
 * (reuses MessageBubble + the strict sender-identity attribution), fed by the
 * GameClient's onChat stream instead of the agent-runtime transport. Always
 * visible next to the board: the agent and the other players are part of
 * gameplay, not a separate screen.
 *
 * Strings are plain literals — custom (non-Bluesky) surface, so nothing here
 * depends on the compiled Lingui catalog.
 */
export function ChatLane({
  messages,
  selfIds,
  onSend,
  placeholder = 'Say something…',
  emptyText = 'Game chat — trash talk encouraged.',
}: {
  messages: ChatMessage[]
  /** The viewer's sender identity strings, lowercased (playerID today; DID/handle live). */
  selfIds: ReadonlySet<string>
  onSend: (text: string) => void
  placeholder?: string
  /** Empty-state line. Story mode overrides the board-flavored default —
   *  there, talking to the GM IS the game, not side chatter. */
  emptyText?: string
}) {
  const t = useTheme()
  const [input, setInput] = useState('')
  const scrollRef = useRef<ScrollView>(null)
  // KEYBOARD-CLOSED clearance for the native overlay tab bar (same fix as the
  // AgentChat composer: without it the input row hides BEHIND the bottom bar).
  // Collapses to the row's own base padding as the keyboard opens — the
  // keyboard covers the bar, so keeping the offset would float the input above
  // the keyboard by exactly that gap. Web keeps today's static padding: the
  // browser-tested layouts never padded for the web bottom bar, and there is
  // no soft-keyboard progress to drive it.
  const bottomBarOffset = useBottomBarOffset()
  const barClearance = IS_WEB ? 0 : bottomBarOffset
  const keyboardAnim = useReanimatedKeyboardAnimation()
  const inputInsetStyle = useAnimatedStyle(() => ({
    paddingBottom:
      tokens.space.sm + barClearance * (1 - keyboardAnim.progress.get()),
  }))

  const doSend = () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    onSend(text)
  }

  // Keep pinned to the newest message, same as the agent chat surface.
  // NOT animated: a join-time chat-history replay lands as one batch while
  // the scene pane above is still settling its height, and an animated
  // scrollToEnd loses that race on web (lane stuck at the oldest message).
  // Also re-pin on layout so lane resizes (keyboard, orientation) keep the
  // newest message in view.
  const pinToEnd = useCallback(() => {
    scrollRef.current?.scrollToEnd({animated: false})
  }, [])

  return (
    <View style={[a.flex_1]}>
      <ScrollView
        ref={scrollRef}
        style={[a.flex_1]}
        contentContainerStyle={[a.px_md, a.py_md, a.gap_sm, {flexGrow: 1}]}
        onContentSizeChange={pinToEnd}
        onLayout={pinToEnd}
        keyboardDismissMode="interactive">
        {messages.length === 0 ? (
          <View style={[a.flex_1, a.align_center, a.justify_center]}>
            <Text
              style={[a.text_sm, t.atoms.text_contrast_medium, a.text_center]}>
              {emptyText}
            </Text>
          </View>
        ) : (
          messages.map(m => (
            <MessageBubble
              key={m.id}
              message={m}
              // Every game-chat row is attributed by sender identity, exactly
              // like a group thread: "You" and right-alignment require a
              // strict senderId match — role alone never decides.
              senderName={
                isSelfSender(m, selfIds) ? 'You' : (m.senderName ?? 'Player')
              }
              isSelf={isSelfSender(m, selfIds)}
              onDecision={() => {}}
            />
          ))
        )}
      </ScrollView>

      <Animated.View
        style={[
          a.flex_row,
          a.align_center,
          a.gap_sm,
          a.px_md,
          a.pt_sm,
          a.border_t,
          t.atoms.border_contrast_low,
          inputInsetStyle,
        ]}>
        <TextInput
          testID="gameChatInput"
          accessibilityLabel="Game chat input"
          accessibilityHint="Type a message to the room"
          value={input}
          onChangeText={setInput}
          placeholder={placeholder}
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
            {maxHeight: 100},
            // iOS Safari auto-zooms the page when a focused input's font is
            // under 16px, and the zoom outlives the keyboard — with this
            // screen's overflow:hidden viewport cap that clipped the whole
            // right edge (send button, own bubbles). 16px disarms the zoom.
            web({fontSize: 16}),
          ]}
          onSubmitEditing={doSend}
          blurOnSubmit={false}
        />
        <Button
          testID="gameChatSend"
          label="Send"
          size="small"
          shape="round"
          variant="solid"
          color="primary"
          disabled={input.trim().length === 0}
          onPress={doSend}>
          <ButtonIcon icon={SendIcon} />
        </Button>
      </Animated.View>
    </View>
  )
}
