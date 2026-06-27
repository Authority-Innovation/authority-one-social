import {type ChatChannel} from '#/lib/agent-runtime'

/**
 * The cross-channel origin annotation for a chat turn. The AgentChat window is unified
 * — a turn may have arrived over SMS/WhatsApp/voice/iMessage rather than in-app text —
 * so we tag where it came from. In-app text ('app') and live turns (no channel) get NO
 * badge. Returns the plain-string `label` and whether to show the mic glyph (voice),
 * or null when no annotation should render. PURE — no React/RN imports, so it is unit-
 * testable without the heavy `#/alf` native import chain.
 *
 * NB: the labels are plain string LITERALS, NOT Lingui `<Trans>`/`msg` — the compiled
 * catalog miss garbles custom labels into raw message ids (the same reason the composer
 * placeholder, listening-state copy, and approval buttons are plain literals).
 */
export function channelBadge(
  channel: ChatChannel | undefined,
): {label: string; mic: boolean} | null {
  switch (channel) {
    case 'sms':
      return {label: 'via SMS', mic: false}
    case 'whatsapp':
      return {label: 'via WhatsApp', mic: false}
    case 'imessage':
      return {label: 'via iMessage', mic: false}
    case 'voice':
      return {label: 'Voice', mic: true}
    // 'app' and undefined (live in-app text) → no annotation.
    default:
      return null
  }
}
