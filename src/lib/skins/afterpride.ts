import {
  createThemes,
  DEFAULT_PALETTE,
  DEFAULT_SUBDUED_PALETTE,
} from '@bsky.app/alf'

import {type LegacyThemeSet, type SkinDefinition} from '#/lib/skins/types'
import {darkTheme, defaultTheme, dimTheme} from '#/lib/themes'

/**
 * ============================================================================
 *  After Pride skin  -- PENDING (stub).
 * ============================================================================
 *
 * Placeholder skin. Brand colours and font pending.
 *
 * Every value below is a stand-in so the skin can be registered and wired end to
 * end before the brand's assets arrive:
 *   - HEX     placeholder violet ramp (NOT the brand colour).
 *   - FONT    none yet -> no `headingFont` (default UI font is used).
 *   - ICON    none yet -> `alternateIconName` is left undefined, so selecting
 *             this skin would never touch the app icon. No app.config.js entry.
 *
 * `pending: true` keeps it out of the in-app picker. Per decision N3 this skin
 * must never be the app default and must never reskin the AO app; a full
 * After Pride reskin only happens in a brand build (a later task).
 *
 * Brand values live in the `=== BRAND TOKENS ===` block below -- one place to edit.
 */

// === BRAND TOKENS (PLACEHOLDER) ============================================
const AFTERPRIDE = {
  /** Placeholder accent. Replace with the brand colour when supplied. */
  accent: '#7C3AED',
  /** Placeholder background. */
  background: '#FFFFFF',
}

/** Placeholder primary ramp anchored on the placeholder accent at 500. */
const AFTERPRIDE_PRIMARY_RAMP = {
  primary_25: '#F8F5FE',
  primary_50: '#F1EAFD',
  primary_100: '#E0D0FB',
  primary_200: '#C6A8F7',
  primary_300: '#AA7DF3',
  primary_400: '#9257F0',
  primary_500: '#7C3AED', // AFTERPRIDE.accent
  primary_600: '#6A27D6',
  primary_700: '#5720B0',
  primary_800: '#45198B',
  primary_900: '#331266',
  primary_950: '#250D4A',
  primary_975: '#190833',
}

/**
 * Placeholder contrast ramp: the base neutral ramp, unchanged. Listed explicitly
 * so the brand's neutrals have an obvious slot to land in later.
 */
const AFTERPRIDE_CONTRAST_RAMP = {
  contrast_0: DEFAULT_PALETTE.contrast_0,
  contrast_25: DEFAULT_PALETTE.contrast_25,
  contrast_50: DEFAULT_PALETTE.contrast_50,
  contrast_100: DEFAULT_PALETTE.contrast_100,
  contrast_200: DEFAULT_PALETTE.contrast_200,
  contrast_300: DEFAULT_PALETTE.contrast_300,
  contrast_400: DEFAULT_PALETTE.contrast_400,
  contrast_500: DEFAULT_PALETTE.contrast_500,
  contrast_600: DEFAULT_PALETTE.contrast_600,
  contrast_700: DEFAULT_PALETTE.contrast_700,
  contrast_800: DEFAULT_PALETTE.contrast_800,
  contrast_900: DEFAULT_PALETTE.contrast_900,
  contrast_950: DEFAULT_PALETTE.contrast_950,
  contrast_975: DEFAULT_PALETTE.contrast_975,
  contrast_1000: DEFAULT_PALETTE.contrast_1000,
}
// ===========================================================================

// --- ALF themes (base palette + placeholder ramps) --------------------------
const afterprideAlfThemes = createThemes({
  defaultPalette: {
    ...DEFAULT_PALETTE,
    ...AFTERPRIDE_CONTRAST_RAMP,
    ...AFTERPRIDE_PRIMARY_RAMP,
  },
  subduedPalette: {...DEFAULT_SUBDUED_PALETTE, ...AFTERPRIDE_PRIMARY_RAMP},
})

// --- Legacy ThemeContext themes (clone base, repoint link/primary) ----------
function withPrimaryLink<T extends typeof defaultTheme>(base: T): T {
  return {
    ...base,
    palette: {
      ...base.palette,
      default: {
        ...base.palette.default,
        link: AFTERPRIDE_PRIMARY_RAMP.primary_500,
      },
      primary: {
        ...base.palette.primary,
        background: AFTERPRIDE_PRIMARY_RAMP.primary_500,
        backgroundLight: AFTERPRIDE_PRIMARY_RAMP.primary_400,
        border: AFTERPRIDE_PRIMARY_RAMP.primary_600,
      },
    },
  }
}

const afterprideLegacyThemes: LegacyThemeSet = {
  default: withPrimaryLink(defaultTheme),
  dark: withPrimaryLink(darkTheme),
  dim: withPrimaryLink(dimTheme),
}

export const afterprideSkin: SkinDefinition = {
  id: 'afterpride',
  displayName: 'After Pride',

  alfThemes: afterprideAlfThemes,
  legacyThemes: afterprideLegacyThemes,

  // Brand font pending -> no heading override.
  headingFont: undefined,

  // Brand icon pending -> never touch the app icon.
  alternateIconName: undefined,

  swatch: {
    background: AFTERPRIDE.background,
    accent: AFTERPRIDE.accent,
  },

  // Placeholder tokens: hidden from the picker (see selectableSkins).
  pending: true,
}
