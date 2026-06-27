/**
 * The AgentChat ("Talk to Bob") header title renders ~20% larger than the shared
 * Layout header default, applied ONLY on this screen. `agentChatHeaderTitleSize`
 * is the pure size calc, isolated so it's testable without the native render chain
 * (same pattern as composerOffset).
 */
import {describe, expect, it} from '@jest/globals'

import {
  agentChatHeaderTitleSize,
  HEADER_TITLE_SCALE,
} from '../headerTitleStyle'

// Mirrors alf typography tokens (a.text_lg / a.text_xl) the default TitleText uses.
const BASE_MOBILE = 16.9
const BASE_WIDE = 18.8

describe('agentChatHeaderTitleSize', () => {
  it('scales the title ~20% larger than the default', () => {
    expect(HEADER_TITLE_SCALE).toBeCloseTo(1.2, 5)
  })

  it('returns an enlarged size on narrow (mobile) screens', () => {
    const size = agentChatHeaderTitleSize(false)
    expect(size).toBeCloseTo(BASE_MOBILE * 1.2, 2) // 20.28
    expect(size).toBeGreaterThan(BASE_MOBILE)
  })

  it('returns an enlarged size on wide (gtMobile) screens', () => {
    const size = agentChatHeaderTitleSize(true)
    expect(size).toBeCloseTo(BASE_WIDE * 1.2, 2) // 22.56
    expect(size).toBeGreaterThan(BASE_WIDE)
  })

  it('wide is larger than mobile (keeps the breakpoint relationship)', () => {
    expect(agentChatHeaderTitleSize(true)).toBeGreaterThan(
      agentChatHeaderTitleSize(false),
    )
  })

  it('produces a usable, non-clipping font size (no negative/zero/NaN)', () => {
    for (const gtMobile of [true, false]) {
      const size = agentChatHeaderTitleSize(gtMobile)
      expect(Number.isFinite(size)).toBe(true)
      expect(size).toBeGreaterThan(0)
    }
  })
})
