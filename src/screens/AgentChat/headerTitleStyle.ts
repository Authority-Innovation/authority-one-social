/**
 * Font size for the AgentChat ("Talk to <agent>") screen header title.
 *
 * Pure + dependency-free on purpose, so it's testable without the heavy
 * `#/alf` → Layout → native import chain (jest-expo can't evaluate it) — the
 * same isolation pattern as composerOffset / channelBadge.
 *
 * The shared `Layout.Header.TitleText` renders at `a.text_lg` on narrow screens
 * and `a.text_xl` on wide (gtMobile). This screen wants its title ~20% LARGER
 * than that default, applied ONLY here (via the TitleText `style` override prop)
 * so every other screen's header is untouched. The title is in the Fraunces
 * headline face, which scales cleanly.
 *
 * Base sizes mirror the alf typography tokens as literals (text_lg = 16.9,
 * text_xl = 18.8) to keep this module free of the alf import. If those tokens
 * ever change, update the literals here.
 */
const BASE_FONT_SIZE_MOBILE = 16.9 // alf a.text_lg.fontSize
const BASE_FONT_SIZE_WIDE = 18.8 // alf a.text_xl.fontSize

/** How much larger than the default header title this screen renders. */
export const HEADER_TITLE_SCALE = 1.2

/**
 * The enlarged header-title font size for this screen.
 *
 * `gtMobile` selects the same breakpoint base the default TitleText uses, then
 * scales it. Rounded to 2dp to avoid noise. Line height is intentionally NOT
 * returned: TitleText keeps its relative `leading_tight` (1.15), which the Text
 * normalizer multiplies by this fontSize, so the line box grows with the text
 * and nothing clips.
 */
export function agentChatHeaderTitleSize(gtMobile: boolean): number {
  const base = gtMobile ? BASE_FONT_SIZE_WIDE : BASE_FONT_SIZE_MOBILE
  return Math.round(base * HEADER_TITLE_SCALE * 100) / 100
}
