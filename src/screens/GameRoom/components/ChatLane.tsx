import {useCallback, useRef, useState} from 'react'
import {ScrollView, TextInput, View} from 'react-native'

import {type ChatMessage} from '#/lib/agent-runtime'
import {isSelfSender} from '#/screens/AgentChat/attribution'
import {MessageBubble} from '#/screens/AgentChat/MessageBubble'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon} from '#/components/Button'
import {PaperPlaneVertical_Filled_Stroke2_Corner1_Rounded as SendIcon} from '#/components/icons/PaperPlane'
import {Text} from '#/components/Typography'

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
}: {
  messages: ChatMessage[]
  /** The viewer's sender identity strings, lowercased (playerID today; DID/handle live). */
  selfIds: ReadonlySet<string>
  onSend: (text: string) => void
  placeholder?: string
}) {
  const t = useTheme()
  const [input, setInput] = useState('')
  const scrollRef = useRef<ScrollView>(null)

  const doSend = () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    onSend(text)
  }

  // Keep pinned to the newest message, same as the agent chat surface.
  const onContentSizeChange = useCallback(() => {
    scrollRef.current?.scrollToEnd({animated: true})
  }, [])

  return (
    <View style={[a.flex_1]}>
      <ScrollView
        ref={scrollRef}
        style={[a.flex_1]}
        contentContainerStyle={[a.px_md, a.py_md, a.gap_sm, {flexGrow: 1}]}
        onContentSizeChange={onContentSizeChange}
        keyboardDismissMode="interactive">
        {messages.length === 0 ? (
          <View style={[a.flex_1, a.align_center, a.justify_center]}>
            <Text
              style={[a.text_sm, t.atoms.text_contrast_medium, a.text_center]}>
              Game chat — trash talk encouraged.
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

      <View
        style={[
          a.flex_row,
          a.align_center,
          a.gap_sm,
          a.px_md,
          a.py_sm,
          a.border_t,
          t.atoms.border_contrast_low,
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
      </View>
    </View>
  )
}
