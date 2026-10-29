import {View} from 'react-native'
import {plural} from '@lingui/core/macro'
import {Trans, useLingui} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {type Community} from '#/lib/agent-runtime/communitiesClient'
import {type NavigationProp} from '#/lib/routes/types'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {Text} from '#/components/Typography'

/**
 * Long-press sheet for a switcher chip, modelled on `SwitchAccountDialog`.
 * It shows what the switcher already has from the membership list and fetches
 * nothing itself.
 */
export function CommunitySheet({
  control,
  community,
  onSelect,
}: {
  control: Dialog.DialogControlProps
  community: Community | null
  onSelect: (id: string) => void
}) {
  return (
    <Dialog.Outer control={control} nativeOptions={{preventExpansion: true}}>
      <Dialog.Handle />
      {community ? (
        <CommunitySheetInner
          control={control}
          community={community}
          onSelect={onSelect}
        />
      ) : null}
    </Dialog.Outer>
  )
}

function CommunitySheetInner({
  control,
  community,
  onSelect,
}: {
  control: Dialog.DialogControlProps
  community: Community
  onSelect: (id: string) => void
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const navigation = useNavigation<NavigationProp>()

  const onPressShow = () => {
    control.close(() => {
      onSelect(community.id)
    })
  }

  const onPressOpen = () => {
    control.close(() => {
      navigation.navigate('Community', {id: community.id})
    })
  }

  return (
    <Dialog.ScrollableInner
      label={l`Community options`}
      testID="communitySwitcherSheet">
      <View style={[a.gap_lg]}>
        <View style={[a.gap_xs]}>
          <Text emoji style={[a.text_2xl, a.font_semi_bold]} numberOfLines={2}>
            {community.name}
          </Text>
          {typeof community.memberCount === 'number' ? (
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              {plural(community.memberCount, {
                one: '# member',
                other: '# members',
              })}
            </Text>
          ) : null}
          {community.description ? (
            <Text emoji style={[a.text_md, a.leading_snug]}>
              {community.description}
            </Text>
          ) : null}
        </View>

        <View style={[a.gap_sm]}>
          <Button
            testID="communitySwitcherSheetShow"
            label={l`Show in Home`}
            color="primary"
            size="large"
            onPress={onPressShow}>
            <ButtonText>
              <Trans>Show in Home</Trans>
            </ButtonText>
          </Button>
          <Button
            testID="communitySwitcherSheetOpen"
            label={l`Open community`}
            color="secondary"
            size="large"
            onPress={onPressOpen}>
            <ButtonText>
              <Trans>Open community</Trans>
            </ButtonText>
          </Button>
          <Button
            testID="communitySwitcherSheetClose"
            label={l`Close`}
            color="secondary"
            size="large"
            onPress={() => control.close()}>
            <ButtonText>
              <Trans>Close</Trans>
            </ButtonText>
          </Button>
        </View>
      </View>

      <Dialog.Close />
    </Dialog.ScrollableInner>
  )
}
