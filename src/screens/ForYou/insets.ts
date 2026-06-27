import {createContext, useContext} from 'react'

/**
 * Bottom inset for full-screen feed overlays (caption, action rail, dots).
 *
 * The media fills the entire frame edge-to-edge BEHIND the persistent bottom tab
 * bar (TikTok-style — the bar stays visible). Overlaid controls must therefore sit
 * ABOVE the tab bar + home-indicator safe area so they're never occluded. This is
 * the bug from live testing: content wasn't inset, so it got cut off.
 *
 * Mirrors `useBottomBarOffset`: clamp(60 + safeBottom, 60, 75) covers the bar +
 * home indicator; `pad` adds breathing room above it.
 */
export function overlayBottomInset(safeBottom: number, pad = 12): number {
  const barRegion = Math.min(Math.max(60 + safeBottom, 60), 75)
  return barRegion + pad
}

export interface ForYouInsets {
  /** Bottom offset that clears the tab bar + home indicator. */
  bottom: number
  /** Top offset that clears the status bar / notch. */
  top: number
}

const ForYouInsetsContext = createContext<ForYouInsets>({bottom: 84, top: 12})

export const ForYouInsetsProvider = ForYouInsetsContext.Provider

/** Overlay insets for the current full-screen feed item. */
export function useForYouInsets(): ForYouInsets {
  return useContext(ForYouInsetsContext)
}
