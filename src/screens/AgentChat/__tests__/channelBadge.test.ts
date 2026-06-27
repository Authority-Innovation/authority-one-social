/**
 * The cross-channel origin annotation shown on AgentChat bubbles. The chat window is
 * UNIFIED — a turn may have arrived over SMS/WhatsApp/voice/iMessage — so each off-app
 * turn carries a small badge. This pins:
 *   - the EXACT plain-string labels (a Lingui macro here would render a raw msg id, the
 *     bug already fixed for the composer placeholder / approval buttons), and
 *   - that in-app text ('app') and live turns (undefined) get NO badge.
 *
 * `channelBadge` lives in its own pure module precisely so it's testable without the
 * heavy `#/alf` → MessageBubble native import chain (which jest-expo can't evaluate).
 */
import {describe, expect, it} from '@jest/globals'

import {channelBadge} from '../channelBadge'

describe('channelBadge', () => {
  it('returns plain-string labels for off-app channels', () => {
    expect(channelBadge('sms')).toEqual({label: 'via SMS', mic: false})
    expect(channelBadge('whatsapp')).toEqual({label: 'via WhatsApp', mic: false})
    expect(channelBadge('imessage')).toEqual({label: 'via iMessage', mic: false})
  })

  it('flags voice for the mic glyph with a "Voice" label', () => {
    expect(channelBadge('voice')).toEqual({label: 'Voice', mic: true})
  })

  it('renders NO badge for in-app text and for live (untagged) turns', () => {
    expect(channelBadge('app')).toBeNull()
    expect(channelBadge(undefined)).toBeNull()
    // A future/unknown runtime channel also gets no badge (open union, fail-safe).
    expect(channelBadge('telegram')).toBeNull()
  })

  it('labels are stable plain strings (no raw Lingui message ids)', () => {
    for (const ch of ['sms', 'whatsapp', 'imessage', 'voice'] as const) {
      const badge = channelBadge(ch)
      expect(badge).not.toBeNull()
      // A garbled Lingui id is a short opaque token like "ZVCRHy" — our labels are
      // human words. Assert they contain a space or a known word, never look like ids.
      expect(badge!.label).toMatch(/SMS|WhatsApp|iMessage|Voice/)
    }
  })
})
