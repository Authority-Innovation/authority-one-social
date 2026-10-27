import {afterprideSkin} from '#/lib/skins/afterpride'
import {authoritySkin} from '#/lib/skins/authority'
import {hurricanesSkin} from '#/lib/skins/hurricanes'
import {DEFAULT_SKIN_ID} from '#/lib/skins/ids'
import {type SkinDefinition, type SkinId} from '#/lib/skins/types'

/**
 * Skin registry -- the single source of truth for every skin the app ships.
 *
 * To add a skin:
 *   1. write its definition file (see `./authority.ts` / `./hurricanes.ts`),
 *   2. add ONE entry to `SKIN_LIST` below.
 * Nothing else needs to change: persistence (`activeSkin` is a free-form string),
 * the picker (iterates this list), and every theme consumer (reads the active
 * skin via `useSkin()`) are all data-driven from here.
 *
 * Pure id/migration helpers live in `./ids.ts` (and are re-exported here).
 */

const defaultSkin: SkinDefinition = {
  id: DEFAULT_SKIN_ID,
  displayName: 'Default',
  // No overlays -> base ALF + legacy themes + default font are used.
  alfThemes: undefined,
  legacyThemes: undefined,
  headingFont: undefined,
  // Selecting the default skin resets to the primary bundled app icon.
  alternateIconName: null,
  swatch: {
    // The base app already ships the One orange ramp on neutral surfaces.
    background: '#FFFFFF',
    accent: '#E8431F',
  },
}

/**
 * Ordered for display in the picker. `default` first, then brand skins.
 * `pending` skins (e.g. `afterpride`) are registered but never offered by the
 * picker -- see `selectableSkins`.
 */
const SKIN_LIST: SkinDefinition[] = [
  defaultSkin,
  authoritySkin,
  hurricanesSkin,
  afterprideSkin,
]

const SKINS: Record<SkinId, SkinDefinition> = Object.fromEntries(
  SKIN_LIST.map(skin => [skin.id, skin]),
)

/** All skins, in display order. */
export function listSkins(): SkinDefinition[] {
  return SKIN_LIST
}

/** Look up a skin by id, falling back to the default skin for unknown ids. */
export function getSkin(id: SkinId | undefined): SkinDefinition {
  return (id && SKINS[id]) || SKINS[DEFAULT_SKIN_ID]
}

/** True when `id` names a real registered skin. */
export function isKnownSkinId(id: string | undefined): boolean {
  return !!id && id in SKINS
}

export {
  DEFAULT_SKIN_ID,
  legacyThemePackFromSkinId,
  skinIdFromLegacyThemePack,
} from '#/lib/skins/ids'
