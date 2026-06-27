import {useState} from 'react'
import {View} from 'react-native'
import {Trans} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {useCreateThreadMutation} from '#/state/queries/threads'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as TextField from '#/components/forms/TextField'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'
import {AddPeople} from './AddPeople'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'NewGroup'>

/**
 * Create a group (name) then add people. The creator is seeded as owner/guardian by the
 * runtime. After creation we stay on-screen to add members, then Done returns to the list.
 */
export function NewGroupScreen({}: Props) {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const create = useCreateThreadMutation()

  const [name, setName] = useState('')
  const [threadId, setThreadId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onCreate = () => {
    const title = name.trim()
    if (!title || create.isPending) return
    setError(null)
    create.mutate(
      {kind: 'group', title},
      {
        onSuccess: res => {
          if (res.ok && res.data?.id) setThreadId(res.data.id)
          else if (res.signedOut) setError('Sign in to create a group.')
          else setError(res.error ?? 'Could not create the group.')
        },
        onError: () => setError('Could not create the group.'),
      },
    )
  }

  return (
    <Layout.Screen>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>New group</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot>
          {threadId ? (
            <Button
              label="Done"
              size="small"
              variant="solid"
              color="primary"
              onPress={() => navigation.navigate('ChatList')}>
              <ButtonText>
                <Trans>Done</Trans>
              </ButtonText>
            </Button>
          ) : null}
        </Layout.Header.Slot>
      </Layout.Header.Outer>

      <Layout.Content>
        <View style={[a.p_lg, a.gap_lg]}>
          {!threadId ? (
            <>
              <View style={[a.gap_xs]}>
                <TextField.LabelText>
                  <Trans>Group name</Trans>
                </TextField.LabelText>
                <TextField.Root>
                  <TextField.Input
                    label="Group name"
                    placeholder="e.g. Family"
                    defaultValue={name}
                    onChangeText={setName}
                  />
                </TextField.Root>
              </View>
              {error ? (
                <Text style={[a.text_sm, {color: t.palette.negative_500}]}>
                  {error}
                </Text>
              ) : null}
              <Button
                label="Create group"
                size="large"
                variant="solid"
                color="primary"
                disabled={!name.trim() || create.isPending}
                onPress={onCreate}>
                <ButtonText>
                  <Trans>Create group</Trans>
                </ButtonText>
              </Button>
            </>
          ) : (
            <>
              <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
                <Trans>Add people to “{name.trim()}”</Trans>
              </Text>
              <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                <Trans>
                  Friends you’re connected with are added right away. Anyone else gets an
                  invite to accept. You can also add agent personas.
                </Trans>
              </Text>
              <AddPeople threadId={threadId} />
            </>
          )}
        </View>
      </Layout.Content>
    </Layout.Screen>
  )
}
