import {View} from 'react-native'
import {Trans} from '@lingui/react/macro'

import {type ApprovalAction} from '#/lib/agent-runtime'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Text} from '#/components/Typography'

/**
 * Renders one approval action (e.g. "Send email", "Create event") as a card with
 * Approve / Reject buttons. Nothing executes until the user approves — the runtime
 * enforces this with its structural write-gate.
 */
export function ApprovalCard({
  action,
  disabled,
  onDecision,
}: {
  action: ApprovalAction
  disabled?: boolean
  onDecision: (decision: 'approve' | 'reject') => void
}) {
  const t = useTheme()
  return (
    <View
      style={[
        a.mt_sm,
        a.p_md,
        a.rounded_md,
        a.border,
        t.atoms.border_contrast_low,
        t.atoms.bg_contrast_25,
      ]}>
      <Text
        style={[
          a.text_xs,
          a.font_bold,
          a.mb_2xs,
          t.atoms.text_contrast_medium,
        ]}>
        {action.kind.toUpperCase()}
      </Text>
      <Text style={[a.text_sm, a.font_bold]}>{action.title}</Text>
      {action.detail ? (
        <Text style={[a.text_sm, a.mt_2xs, t.atoms.text_contrast_high]}>
          {action.detail}
        </Text>
      ) : null}
      <View style={[a.flex_row, a.gap_sm, a.mt_sm]}>
        <Button
          label="Approve"
          size="small"
          color="primary"
          variant="solid"
          disabled={disabled}
          onPress={() => onDecision('approve')}
          style={[a.flex_1]}>
          <ButtonText>
            <Trans>Approve</Trans>
          </ButtonText>
        </Button>
        <Button
          label="Reject"
          size="small"
          color="secondary"
          variant="solid"
          disabled={disabled}
          onPress={() => onDecision('reject')}
          style={[a.flex_1]}>
          <ButtonText>
            <Trans>Reject</Trans>
          </ButtonText>
        </Button>
      </View>
    </View>
  )
}
