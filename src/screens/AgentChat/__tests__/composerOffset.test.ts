/**
 * Regression test for the AgentChat composer bottom spacing.
 *
 * SYMPTOM (live, in-app): when the keyboard opened, the composer slid UP too far,
 * leaving a large empty gap between the input and the top of the keyboard. The
 * tab-bar offset (added so the composer clears the bottom tab bar when the
 * keyboard is CLOSED — see useBottomBarOffset) was being applied ON TOP of the
 * keyboard height pushed in by the iOS KeyboardAvoidingView, double-counting it.
 *
 * FIX: drop the tab-bar offset while the keyboard is open; keep it when closed.
 * `composerBottomOffset` is the pure offset calc, isolated so it's testable
 * without the native render chain.
 */
import {describe, expect, it} from '@jest/globals'

import {
  COMPOSER_KEYBOARD_VERTICAL_OFFSET,
  composerBottomOffset,
  composerKeyboardGap,
} from '../composerOffset'

describe('composerBottomOffset', () => {
  it('keeps the tab-bar offset when the keyboard is CLOSED (clears the tab bar)', () => {
    // 68 = clamp(60 + inset, 60, 75) + 8 modifier, e.g. on a home-indicator device.
    expect(composerBottomOffset(68, false)).toBe(68)
  })

  it('drops the offset to 0 when the keyboard is OPEN (sits flush above keyboard)', () => {
    expect(composerBottomOffset(68, true)).toBe(0)
  })

  it('still drops to 0 with no home indicator (smaller offset, same rule)', () => {
    // 60 = clamp floor when bottomInset is 0; offset must NOT be re-added over the
    // keyboard height, regardless of safe-area inset.
    expect(composerBottomOffset(60, true)).toBe(0)
    expect(composerBottomOffset(60, false)).toBe(60)
  })

  it('never returns a value above the closed offset (no extra gap)', () => {
    for (const offset of [0, 60, 68, 75]) {
      expect(composerBottomOffset(offset, true)).toBeLessThanOrEqual(offset)
      expect(composerBottomOffset(offset, false)).toBe(offset)
    }
  })
})

describe('composer keyboard offset (hug-the-keyboard fix)', () => {
  it('keyboardVerticalOffset for the KAV is 0 (no band added above the keyboard)', () => {
    // A non-zero value here is added ON TOP of the keyboard overlap → exactly the
    // wasted gap the prior `insets.top + 44` produced.
    expect(COMPOSER_KEYBOARD_VERTICAL_OFFSET).toBe(0)
  })

  it('total open-keyboard gap is 0 — composer sits flush above the keyboard', () => {
    // gap = View paddingBottom (composerBottomOffset, open) + KAV vertical offset.
    for (const offset of [0, 60, 68, 75]) {
      expect(composerKeyboardGap(offset)).toBe(0)
    }
  })

  it('any stray non-zero KAV offset would surface as a gap (regression guard)', () => {
    // If someone reintroduces a non-zero offset, the gap is exactly that value —
    // this documents the failure mode the fix prevents.
    expect(composerKeyboardGap(68, 44)).toBe(44)
  })
})
