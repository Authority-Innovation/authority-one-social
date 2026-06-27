import {describe, expect, it} from '@jest/globals'

import {overlayBottomInset} from '../insets'

describe('overlayBottomInset', () => {
  it('clears the tab bar + home indicator + padding', () => {
    // clamp(60 + 0, 60, 75) = 60, + pad 12
    expect(overlayBottomInset(0)).toBe(72)
    // clamp(60 + 34, 60, 75) = 75, + pad 12
    expect(overlayBottomInset(34)).toBe(87)
    // custom pad
    expect(overlayBottomInset(10, 0)).toBe(70)
  })

  it('always sits above the tab-bar region regardless of safe-area inset', () => {
    for (const safeBottom of [0, 20, 34, 48]) {
      expect(overlayBottomInset(safeBottom)).toBeGreaterThanOrEqual(60)
    }
  })
})
