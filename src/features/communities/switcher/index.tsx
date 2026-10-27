/**
 * Community switcher for the Home header. See ./README.md.
 */
import {useEffect, useState} from 'react'
import {Pressable, ScrollView, View} from 'react-native'
import {useLingui} from '@lingui/react/macro'

import {type Community} from '#/lib/agent-runtime/communitiesClient'
import {
  ALL_COMMUNITIES_FEED,
  type CommunityFeedDescriptor,
  communityFeedDescriptor,
  useSelectedCommunityFeed,
  useSetSelectedCommunityFeed,
} from '#/state/shell/selected-community'
import {atoms as a, useTheme} from '#/alf'
import * as Dialog from '#/components/Dialog'
import {Text} from '#/components/Typography'
import {CommunitySheet} from './CommunitySheet'
import {useMyCommunitiesQuery} from './useMyCommunitiesQuery'
import {isCommunitySwitcherEnabled, resolveSelection, safeAccent} from './util'

export function CommunitySwitcher() {
  if (!isCommunitySwitcherEnabled()) return null
  return <CommunitySwitcherInner />
}

function CommunitySwitcherInner() {
  const {t: l} = useLingui()
  const {data: communities = [], isSuccess} = useMyCommunitiesQuery()
  const selected = useSelectedCommunityFeed()
  const setSelected = useSetSelectedCommunityFeed()
  const sheetControl = Dialog.useDialogControl()
  const [sheetCommunity, setSheetCommunity] = useState<Community | null>(null)

  const effective = resolveSelection(selected, communities)
  const selectedCommunity = communities.find(
    c => communityFeedDescriptor(c.id) === effective,
  )
  // N3: the accent is drawn on the chip and this header row only.
  const headerAccent = safeAccent(selectedCommunity?.accent)

  useEffect(() => {
    // Once a fresh list is in, drop a selection the person no longer has.
    if (isSuccess && effective !== selected) {
      setSelected(effective)
    }
  }, [isSuccess, effective, selected, setSelected])

  const onLongPressCommunity = (community: Community) => {
    setSheetCommunity(community)
    sheetControl.open()
  }

  return (
    <View
      testID="communitySwitcher"
      style={[
        a.w_full,
        headerAccent
          ? {borderBottomWidth: 2, borderBottomColor: headerAccent}
          : null,
      ]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        contentContainerStyle={[a.flex_row, a.gap_sm, a.px_lg, a.py_sm]}>
        <Chip
          testID="communityChip-all"
          label={l`All`}
          accessibilityLabel={l`All communities and Following`}
          accessibilityHint={l`Shows Following and all your communities`}
          selected={effective === ALL_COMMUNITIES_FEED}
          onPress={() => setSelected(ALL_COMMUNITIES_FEED)}
        />
        {communities.map(community => {
          const descriptor: CommunityFeedDescriptor = communityFeedDescriptor(
            community.id,
          )
          return (
            <Chip
              key={community.id}
              testID={`communityChip-${community.id}`}
              label={community.name}
              accessibilityLabel={community.name}
              accessibilityHint={l`Long press for more options`}
              accent={safeAccent(community.accent)}
              selected={effective === descriptor}
              onPress={() => setSelected(descriptor)}
              onLongPress={() => onLongPressCommunity(community)}
            />
          )
        })}
      </ScrollView>

      <CommunitySheet
        control={sheetControl}
        community={sheetCommunity}
        onSelect={id => setSelected(communityFeedDescriptor(id))}
      />
    </View>
  )
}

function Chip({
  testID,
  label,
  accessibilityLabel,
  accessibilityHint,
  accent,
  selected,
  onPress,
  onLongPress,
}: {
  testID: string
  label: string
  accessibilityLabel: string
  accessibilityHint?: string
  accent?: string
  selected: boolean
  onPress: () => void
  onLongPress?: () => void
}) {
  const t = useTheme()

  return (
    <Pressable
      testID={testID}
      accessibilityRole="tab"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{selected}}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        a.flex_row,
        a.align_center,
        a.gap_xs,
        a.px_md,
        a.py_xs,
        a.rounded_full,
        a.border,
        selected ? t.atoms.bg_contrast_25 : t.atoms.bg,
        selected
          ? {borderColor: accent ?? t.palette.primary_500}
          : t.atoms.border_contrast_low,
      ]}>
      {accent ? (
        <View
          testID={`${testID}-accent`}
          style={[
            a.rounded_full,
            {width: 8, height: 8, backgroundColor: accent},
          ]}
        />
      ) : null}
      <Text
        emoji
        numberOfLines={1}
        style={[
          a.text_sm,
          selected ? a.font_semi_bold : a.font_medium,
          selected ? t.atoms.text : t.atoms.text_contrast_medium,
        ]}>
        {label}
      </Text>
    </Pressable>
  )
}
