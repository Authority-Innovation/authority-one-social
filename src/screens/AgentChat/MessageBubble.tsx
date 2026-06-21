import {View} from 'react-native'

import {type ApprovalAction, type ChatMessage} from '#/lib/agent-runtime'
import {atoms as a, useTheme} from '#/alf'
import {Loader} from '#/components/Loader'
import {Text} from '#/components/Typography'
import {ApprovalCard} from './ApprovalCard'

/**
 * A single chat bubble. User messages align right (primary), assistant left (contrast).
 * Assistant bubbles render streamed text live and any attached approval cards.
 */
export function MessageBubble({
  message,
  decideDisabled,
  onDecision,
}: {
  message: ChatMessage
  decideDisabled?: boolean
  onDecision: (action: ApprovalAction, decision: 'approve' | 'reject') => void
}) {
  const t = useTheme()
  const isUser = message.role === 'user'
  const showLoader = message.pending && message.text.length === 0

  return (
    <View style={[a.my_xs, a.w_full, isUser ? a.align_end : a.align_start]}>
      <View
        style={[
          a.px_md,
          a.py_sm,
          a.rounded_md,
          {maxWidth: '85%'},
          isUser
            ? [t.atoms.bg_contrast_975, {borderBottomRightRadius: 4}]
            : [t.atoms.bg_contrast_50, {borderBottomLeftRadius: 4}],
        ]}>
        {showLoader ? (
          <Loader size="sm" />
        ) : (
          <Text
            style={[
              a.text_md,
              a.leading_snug,
              isUser ? {color: t.palette.white} : t.atoms.text,
            ]}>
            {message.text}
          </Text>
        )}

        {message.actions?.map(action => (
          <ApprovalCard
            key={action.id}
            action={action}
            disabled={decideDisabled}
            onDecision={decision => onDecision(action, decision)}
          />
        ))}
      </View>
    </View>
  )
}
