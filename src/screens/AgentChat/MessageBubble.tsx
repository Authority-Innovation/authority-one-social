import {Pressable, View} from 'react-native'
import {Image} from 'expo-image'

import {type ApprovalAction, type ChatMessage} from '#/lib/agent-runtime'
import {atoms as a, useTheme} from '#/alf'
import {Microphone_Stroke2_Corner0_Rounded as MicIcon} from '#/components/icons/Microphone'
import {useLightboxControls} from '#/components/Lightbox/state'
import {Loader} from '#/components/Loader'
import {RichText} from '#/components/RichText'
import {Text} from '#/components/Typography'
import {ApprovalCard} from './ApprovalCard'
import {channelBadge} from './channelBadge'
import {CHAT_IMAGE_ALT, lightboxImagesForMedia} from './chatImageLightbox'

/**
 * A single chat bubble. The VIEWER's own messages align right (primary); everyone
 * else's — other humans AND agents — align left (contrast). In a GROUP thread the
 * screen passes `isSelf` (a strict sender-identity match), which decides alignment:
 * another member's `role:'user'` row must NOT render as the viewer's own. In 1:1
 * chat `isSelf` is undefined and role decides — the only human there is the viewer.
 * Assistant bubbles render streamed text live and any attached approval cards. Both
 * roles render a small channel annotation when the turn originated off the in-app text
 * channel (SMS/WhatsApp/voice/iMessage) and inline image thumbnails for any mediaUrls.
 */
export function MessageBubble({
  message,
  senderName,
  isSelf,
  decideDisabled,
  onDecision,
}: {
  message: ChatMessage
  /** Sender attribution for GROUP threads (e.g. "Bob", "Stormy", "You"). Undefined in
   *  1:1 chat — no per-message name there (the header already names the one agent). */
  senderName?: string
  /** GROUP threads: whether this row was sent by the CURRENT VIEWER (strict senderId
   *  match, see isSelfSender). Undefined in 1:1 chat — role-based alignment is
   *  correct there. */
  isSelf?: boolean
  decideDisabled?: boolean
  onDecision: (action: ApprovalAction, decision: 'approve' | 'reject') => void
}) {
  const t = useTheme()
  const {openLightbox} = useLightboxControls()
  const isMine = isSelf ?? message.role === 'user'
  const hasText = message.text.length > 0
  const media = message.mediaUrls ?? []
  const hasActions = (message.actions?.length ?? 0) > 0
  const showLoader = message.pending && !hasText && media.length === 0
  const badge = channelBadge(message.channel)

  // Nothing to show: a settled turn with no text, media, or actions — e.g. a
  // deliberately SILENT agent turn. Render no bubble at all (an empty bubble would
  // otherwise draw as a blank rounded rectangle). Defense-in-depth: the state layer
  // also drops silent turns, so this is a belt-and-braces guard for any stray empty.
  if (!message.pending && !hasText && media.length === 0 && !hasActions) {
    return null
  }

  return (
    <View style={[a.w_full, isMine ? a.align_end : a.align_start]}>
      {/* Sender attribution — a small name caption above the bubble in group threads, so
          it's clear who's speaking in a multi-participant chat. Plain string (set by the
          screen), so it never depends on the compiled catalog. */}
      {senderName ? (
        <Text
          style={[
            a.text_xs,
            a.font_bold,
            a.mb_2xs,
            a.px_xs,
            t.atoms.text_contrast_medium,
          ]}>
          {senderName}
        </Text>
      ) : null}

      {/* Channel annotation — unobtrusive caption above the bubble. Only present for
          off-app-text origins; in-app text turns render nothing here. */}
      {badge ? (
        <View style={[a.flex_row, a.align_center, a.gap_xs, a.mb_2xs, a.px_xs]}>
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
          isMine
            ? [
                {backgroundColor: t.palette.primary_500},
                {borderBottomRightRadius: 4},
              ]
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
                  isMine ? {color: t.palette.white} : undefined,
                ]}
                interactiveStyle={a.underline}
                emojiMultiplier={1}
                shouldProxyLinks={true}
              />
            ) : null}

            {/* Inline media — public R2 URLs the turn generated (or carried). Rendered
                as rounded thumbnails under the text, in the same bubble. Tapping opens
                the app's lightbox, which carries the Save/Download and Share actions
                (native: header Save button; web: image-options menu). */}
            {media.map((url, i) => (
              <Pressable
                key={`${url}_${i}`}
                accessibilityRole="imagebutton"
                accessibilityLabel={CHAT_IMAGE_ALT}
                accessibilityHint="Opens the image full screen, where it can be saved or shared"
                onPress={() =>
                  openLightbox({
                    images: lightboxImagesForMedia(media),
                    index: i,
                  })
                }>
                <Image
                  source={{uri: url}}
                  style={[a.rounded_sm, a.mt_xs, {width: 220, height: 220}]}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                  alt={CHAT_IMAGE_ALT}
                />
              </Pressable>
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
