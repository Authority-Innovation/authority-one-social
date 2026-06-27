import {View} from 'react-native'
import {Trans} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {useGroupOpMutation} from '#/state/queries/threads'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'
import * as Prompt from '#/components/Prompt'
import {Text} from '#/components/Typography'
import {AddPeople} from './AddPeople'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'GroupManage'>

/**
 * Manage a group: add more people (friends -> add, others -> invite, personas -> add)
 * and leave the group. Member-level remove/admin ops are available via the group client
 * once a member-list endpoint surfaces them; leave + add are the v1 surface here.
 */
export function GroupManageScreen({route}: Props) {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const {threadId, title} = route.params
  const op = useGroupOpMutation()
  const leavePrompt = Prompt.usePromptControl()

  return (
    <Layout.Screen>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>{title}</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>

      <Layout.Content>
        <View style={[a.p_lg, a.gap_lg]}>
          <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
            <Trans>Add people</Trans>
          </Text>
          <AddPeople threadId={threadId} />

          <View style={[a.pt_lg, a.border_t, t.atoms.border_contrast_low]}>
            <Button
              label="Leave group"
              size="large"
              variant="solid"
              color="negative"
              disabled={op.isPending}
              onPress={() => leavePrompt.open()}>
              <ButtonText>
                <Trans>Leave group</Trans>
              </ButtonText>
            </Button>
          </View>
        </View>
      </Layout.Content>

      <Prompt.Basic
        control={leavePrompt}
        title="Leave this group?"
        description="You’ll stop receiving its messages. You can be re-invited later."
        confirmButtonCta="Leave"
        confirmButtonColor="negative"
        onConfirm={() => {
          op.mutate(
            {threadId, op: 'leave'},
            {onSuccess: () => navigation.navigate('ChatList')},
          )
        }}
      />
    </Layout.Screen>
  )
}
