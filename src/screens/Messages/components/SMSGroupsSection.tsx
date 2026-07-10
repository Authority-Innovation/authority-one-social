import {useCallback, useState} from 'react'
import {ActivityIndicator, Pressable, View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'
import {useFocusEffect, useNavigation} from '@react-navigation/native'

import {fetchOwnerGroups, type MirrorGroup} from '#/lib/agent-runtime'
import {type NavigationProp} from '#/lib/routes/types'
import {atoms as a, useTheme} from '#/alf'
import {ChevronRight_Stroke2_Corner0_Rounded as ChevronRightIcon} from '#/components/icons/Chevron'
import {Text} from '#/components/Typography'

/**
 * "SMS groups" — a read-only mirror of the SMS/MMS groups the logged-in owner's
 * agent hosts, surfaced at the BOTTOM of the Chats page. Twilio Conversations is
 * the source of truth; this is a read surface only (tapping a group opens a
 * read-only thread with display-name attribution — no composer). Owner-scoped:
 * the runtime resolves the account from the atproto session, so we never send an
 * owner id and each owner only ever sees their own groups.
 *
 * `fetchOwnerGroups` never throws — an unreachable/undeployed runtime degrades to
 * an empty list, so this section quietly shows its empty state rather than
 * breaking the Chats page.
 */
export function SMSGroupsSection() {
  const {t: l} = useLingui()
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  // null = still loading (first fetch), [] = loaded but the owner hosts none.
  const [groups, setGroups] = useState<MirrorGroup[] | null>(null)

  const load = useCallback(async () => {
    const g = await fetchOwnerGroups()
    setGroups(g)
  }, [])

  // Fetches on first focus (mount) and refreshes whenever the Chats tab regains
  // focus, so a newly-created group appears without a manual reload.
  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const onOpen = useCallback(
    (g: MirrorGroup) => {
      navigation.navigate('MessagesSmsGroupThread', {
        sid: g.conversationSid,
        name: g.title ?? undefined,
      })
    },
    [navigation],
  )

  return (
    <View
      style={[a.px_lg, a.py_md, a.border_t, t.atoms.border_contrast_low]}
      testID="smsGroupsSection">
      <Text
        style={[
          a.text_sm,
          a.font_bold,
          a.mb_2xs,
          t.atoms.text_contrast_medium,
        ]}>
        <Trans>SMS groups</Trans>
      </Text>
      <Text style={[a.text_xs, a.mb_sm, t.atoms.text_contrast_low]}>
        <Trans>Read-only mirror · display names only, no phone numbers.</Trans>
      </Text>

      {groups === null ? (
        <View style={[a.py_lg, a.align_center]}>
          <ActivityIndicator />
        </View>
      ) : groups.length === 0 ? (
        <Text style={[a.text_sm, a.py_sm, t.atoms.text_contrast_low]}>
          <Trans>
            No SMS groups yet. When your agent hosts one, it shows up here.
          </Trans>
        </Text>
      ) : (
        <View style={[a.gap_sm]}>
          {groups.map(g => (
            <Pressable
              key={g.conversationSid}
              accessibilityRole="button"
              accessibilityLabel={l`Open SMS group`}
              accessibilityHint={l`Opens a read-only mirror of this group`}
              onPress={() => onOpen(g)}
              style={[
                a.flex_row,
                a.align_center,
                a.gap_sm,
                a.p_md,
                a.rounded_md,
                a.border,
                t.atoms.border_contrast_low,
                t.atoms.bg_contrast_25,
              ]}>
              <View style={[a.flex_1]}>
                <Text style={[a.text_md, a.font_bold]} numberOfLines={1}>
                  {g.title || g.conversationSid}
                </Text>
                <Text
                  style={[
                    a.text_xs,
                    a.mt_2xs,
                    t.atoms.text_contrast_medium,
                  ]}>
                  {g.memberCount}{' '}
                  {g.memberCount === 1 ? l`member` : l`members`}
                  {g.openJoin ? ` · ${l`open`}` : ''}
                </Text>
              </View>
              <ChevronRightIcon
                size="sm"
                fill={t.atoms.text_contrast_low.color}
              />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}
