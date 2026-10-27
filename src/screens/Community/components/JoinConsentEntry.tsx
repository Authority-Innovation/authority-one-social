/**
 * Where the community home hands off to the join-and-consent sheet.
 *
 * T9 owns `src/screens/Community/JoinConsent.tsx` (consent rows, agent
 * disclosure, `communitiesClient.join(id, consentVersion)`). It had not landed
 * when this screen was built, so this entry renders a holding sheet that
 * shows the community and joins nothing. When T9 merges, swap the body of
 * this component for `<JoinConsent ... />`; the screen does not change.
 */
import {View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'

import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {Text} from '#/components/Typography'
import {type CommunityDescriptor} from '../descriptor'

export function JoinConsentEntry({
  control,
  community,
}: {
  control: Dialog.DialogControlProps
  community: CommunityDescriptor
}) {
  return (
    <Dialog.Outer control={control}>
      <Dialog.Handle />
      <Inner control={control} community={community} />
    </Dialog.Outer>
  )
}

function Inner({
  control,
  community,
}: {
  control: Dialog.DialogControlProps
  community: CommunityDescriptor
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  return (
    <Dialog.ScrollableInner label={l`Join community`}>
      <View style={[a.gap_md]}>
        <Text style={[a.text_xl, a.font_bold]}>
          <Trans>Join community</Trans>
        </Text>
        <Text emoji style={[a.text_md, a.font_semi_bold]}>
          {community.name}
        </Text>
        <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
          <Trans>
            Joining isn’t open yet. Before you join, you’ll see what membership
            shares, and with whom.
          </Trans>
        </Text>
        <Button
          label={l`Not now`}
          onPress={() => control.close()}
          color="secondary"
          size="large">
          <ButtonText>
            <Trans>Not now</Trans>
          </ButtonText>
        </Button>
      </View>
      <Dialog.Close />
    </Dialog.ScrollableInner>
  )
}
