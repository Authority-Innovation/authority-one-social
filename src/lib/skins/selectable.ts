import {type SkinDefinition} from '#/lib/skins/types'

/**
 * The skins a user may pick in the app. A `pending` skin is registered on
 * placeholder tokens (brand assets not in hand), so it is never offered: picking
 * it would reskin the AO app with stand-in colours (decision N3).
 *
 * Pure (no skin definition imports) so it is unit-testable under jest-expo.
 */
export function selectableSkins(skins: SkinDefinition[]): SkinDefinition[] {
  return skins.filter(skin => !skin.pending)
}
