import {View} from 'react-native'
import {Image} from 'expo-image'

import {type ApprovalAction, type ChatMessage} from '#/lib/agent-runtime'
import {atoms as a, useTheme} from '#/alf'
import {Microphone_Stroke2_Corner0_Rounded as MicIcon} from '#/components/icons/Microphone'
import {Loader} from '#/components/Loader'
import {RichText} from '#/components/RichText'
import {Text} from '#/components/Typography'
import {ApprovalCard} from './ApprovalCard'
import {channelBadge} from './channelBadge'

/**
 * A single chat bubble. User messages align right (primary), assistant left (contrast).
 * Assistant bubbles render streamed text live and any attached approval cards. Both
 * roles render a small channel annotation when the turn originated off the in-app text
 * channel (SMS/WhatsApp/voice/iMessage) and inline image thumbnails for any mediaUrls.
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
  const hasText = message.text.length > 0
  const media = message.mediaUrls ?? []
  const showLoader = message.pending && !hasText && media.length === 0
  const badge = channelBadge(message.channel)

  return (
    <View style={[a.w_full, isUser ? a.align_end : a.align_start]}>
      {/* Channel annotation — unobtrusive caption above the bubble. Only present for
          off-app-text origins; in-app text turns render nothing here. */}
      {badge ? (
        <View
          style={[
            a.flex_row,
            a.align_center,
            a.gap_xs,
            a.mb_2xs,
            a.px_xs,
          ]}>
          {badge.mic ? (
            <MicIcon size="xs" fill={t.atoms.text_contrast_low.color} />
          ) : null}
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
            {badge.label}
          </Text>
        </View>
      ) : null}

      <View
        style={[
          a.px_md,
          a.py_sm,
          a.rounded_md,
          {maxWidth: '80%'},
          isUser
            ? [{backgroundColor: t.palette.primary_500}, {borderBottomRightRadius: 4}]
            : [t.atoms.bg_contrast_50, {borderBottomLeftRadius: 4}],
        ]}>
        {showLoader ? (
          <Loader size="sm" />
        ) : (
          <>
            {hasText ? (
              // Render the message as RichText so URLs in the text become
              // tappable links. We pass the plain string straight through —
              // RichText runs `detectFacetsWithoutResolution()` internally and
              // renders detected URLs via `InlineLinkText`, reusing the app's
              // standard link-opening path (consent dialog, in-app browser
              // preference, share/peek menu, link proxying). `interactiveStyle`
              // underlines links; the link color defaults to the terracotta
              // accent (primary_500) in agent bubbles, and inherits the white
              // bubble-text color in user bubbles so it stays legible on the
              // accent background. `emojiMultiplier={1}` preserves the prior
              // plain-text sizing (no emoji-only upscaling surprise).
              <RichText
                value={message.text}
                style={[
                  a.text_md,
                  a.leading_snug,
                  // User bubbles: white text on the terracotta background; the
                  // white color also flows to links so they stay legible. Agent
                  // bubbles: omit an explicit color so plain text inherits the
                  // theme text color (Typography `Text` defaults to it) while
                  // links keep `InlineLinkText`'s terracotta accent (primary_500).
                  isUser ? {color: t.palette.white} : undefined,
                ]}
                interactiveStyle={a.underline}
                emojiMultiplier={1}
                shouldProxyLinks={true}
              />
            ) : null}

            {/* Inline media — public R2 URLs the turn generated (or carried). Rendered
                as rounded thumbnails under the text, in the same bubble. */}
            {media.map((url, i) => (
              <Image
                key={`${url}_${i}`}
                source={{uri: url}}
                style={[
                  a.rounded_sm,
                  a.mt_xs,
                  {width: 220, height: 220},
                ]}
                contentFit="cover"
                accessibilityIgnoresInvertColors
                // Plain literal alt text (not Lingui) so it never depends on the
                // compiled catalog.
                alt="Image from your agent"
              />
            ))}
          </>
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
