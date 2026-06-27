/**
 * Bottom padding for the AgentChat composer (the "Message <agent>…" row).
 *
 * This is a pure function precisely so it's testable without the heavy
 * `#/alf` → Layout → native import chain (jest-expo can't evaluate it), the
 * same reason channelBadge / composerPlaceholder live in their own modules.
 *
 * KEYBOARD CLOSED → return the full `bottomBarOffset` so the composer clears
 * the bottom tab bar (without this it hides BEHIND the tab bar — the original
 * bug this offset was added to fix).
 *
 * KEYBOARD OPEN → return 0. On iOS the composer is wrapped in a
 * `KeyboardAvoidingView` with `behavior="padding"`, which already lifts the
 * composer up by the FULL keyboard height — and on iOS that frame spans the
 * bottom safe-area inset (home indicator) too. The tab bar is now covered by
 * the keyboard, so adding `bottomBarOffset` on top double-counts it and floats
 * the composer above the keyboard by exactly that gap. Dropping the offset lets
 * the input sit flush, just above the keyboard.
 *
 * Works for devices with and without a home indicator: the safe-area inset is
 * baked into `bottomBarOffset` (used only when closed) and into the iOS
 * keyboard frame (which positions the open state), so neither path adds it
 * twice.
 */
export function composerBottomOffset(
  bottomBarOffset: number,
  isKeyboardVisible: boolean,
): number {
  return isKeyboardVisible ? 0 : bottomBarOffset
}

/**
 * `keyboardVerticalOffset` for the AgentChat `KeyboardAvoidingView`.
 *
 * MUST be 0. The KAV is a normal flex child rendered BELOW the screen header,
 * so React Native measures its on-screen frame at the correct Y; with
 * `behavior="padding"` the bottom padding it inserts already equals the
 * keyboard's overlap with that frame — which lifts the composer flush to the
 * keyboard top. Any NON-ZERO `keyboardVerticalOffset` is ADDED on top of that
 * overlap, opening exactly that much empty band between the input and the
 * keyboard — the "composer floats too high" bug. A prior version set
 * `insets.top + 44`, which is precisely the wasted gap users saw.
 *
 * Closed-keyboard tab-bar clearance is unaffected: that comes from
 * `composerBottomOffset` (the View paddingBottom), not from this value, which
 * only participates in the open-keyboard padding calc.
 */
export const COMPOSER_KEYBOARD_VERTICAL_OFFSET = 0

/**
 * Total empty band between the composer and the keyboard top when the keyboard
 * is OPEN = the KAV vertical offset (added above the keyboard overlap) plus the
 * View's own bottom padding. Both must be 0 for the input to hug the keyboard.
 * Exposed as a pure helper so the "no wasted band" invariant is testable.
 */
export function composerKeyboardGap(
  bottomBarOffset: number,
  keyboardVerticalOffset: number = COMPOSER_KEYBOARD_VERTICAL_OFFSET,
): number {
  return composerBottomOffset(bottomBarOffset, true) + keyboardVerticalOffset
}
