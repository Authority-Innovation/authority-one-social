import {Fragment} from 'react'
import {View} from 'react-native'

import {
  listSkins,
  selectableSkins,
  type SkinDefinition,
  type SkinId,
} from '#/lib/skins'
import {useSetSkin, useSkinId} from '#/state/skin'
import {atoms as a, useTheme} from '#/alf'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {ColorPalette_Stroke2_Corner0_Rounded as ColorPaletteIcon} from '#/components/icons/ColorPalette'
import {Text} from '#/components/Typography'
import * as SettingsList from './components/SettingsList'

/**
 * App-theme ("skin") picker. Data-driven from the skin registry (#/lib/skins):
 * every registered skin shows up here with a color swatch and switches the theme
 * live (and, on native, the app icon). Adding a skin requires no change to this
 * file. Skins marked `pending` are filtered out and never offered.
 *
 * Strings here are PLAIN LITERALS on purpose -- brand/skin names are proper
 * nouns and the section copy must not depend on the compiled Lingui catalog
 * (see the appearance-labels regression test).
 */
export function SkinPicker() {
  const t = useTheme()
  // Pending (placeholder) skins are registered but never offered.
  const skins = selectableSkins(listSkins())
  const activeSkinId = useSkinId()
  const setSkin = useSetSkin()

  return (
    <Fragment>
      <SettingsList.Group iconInset={false}>
        <SettingsList.ItemIcon icon={ColorPaletteIcon} />
        <SettingsList.ItemText>App theme</SettingsList.ItemText>
        <Text
          style={[
            a.text_sm,
            a.leading_snug,
            t.atoms.text_contrast_medium,
            a.w_full,
          ]}>
          Reskin the app with a brand palette and type. Switches instantly — no
          restart needed.
        </Text>
      </SettingsList.Group>

      {skins.map(skin => (
        <SkinPickerRow
          key={skin.id}
          skin={skin}
          selected={skin.id === activeSkinId}
          onSelect={setSkin}
        />
      ))}
    </Fragment>
  )
}

function SkinPickerRow({
  skin,
  selected,
  onSelect,
}: {
  skin: SkinDefinition
  selected: boolean
  onSelect: (id: SkinId) => void
}) {
  const t = useTheme()
  return (
    <SettingsList.PressableItem
      label={skin.displayName}
      onPress={() => onSelect(skin.id)}
      contentContainerStyle={[a.gap_md, a.align_center]}>
      <Swatch skin={skin} />
      <View style={[a.flex_1, a.gap_2xs]}>
        <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
          {skin.displayName}
        </Text>
        {skin.pending && (
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
            Preview — final assets pending
          </Text>
        )}
      </View>
      {selected && (
        <CheckIcon size="md" fill={t.palette.primary_500} style={[a.z_20]} />
      )}
    </SettingsList.PressableItem>
  )
}

/** Two-tone swatch: the skin's background paired with its accent. */
function Swatch({skin}: {skin: SkinDefinition}) {
  const t = useTheme()
  return (
    <View
      style={[
        a.flex_row,
        a.rounded_sm,
        a.overflow_hidden,
        a.border,
        t.atoms.border_contrast_low,
        {width: 32, height: 32},
      ]}>
      <View style={[a.flex_1, {backgroundColor: skin.swatch.background}]} />
      <View style={[a.flex_1, {backgroundColor: skin.swatch.accent}]} />
    </View>
  )
}
