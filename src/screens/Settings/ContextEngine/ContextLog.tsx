import {useEffect} from 'react'
import {View} from 'react-native'
import {Trans} from '@lingui/react/macro'

import {type ContextEvent} from '#/lib/contextEngine/types'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {useContextEngine} from '#/state/contextEngine/ContextEngineProvider'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {ArrowRotateCounterClockwise_Stroke2_Corner0_Rounded as RefreshIcon} from '#/components/icons/ArrowRotate'
import {Trash_Stroke2_Corner0_Rounded as TrashIcon} from '#/components/icons/Trash'
import * as Layout from '#/components/Layout'
import * as Prompt from '#/components/Prompt'
import {Text} from '#/components/Typography'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'ContextLog'>

const PLACE_LABEL: Record<ContextEvent['place'], string> = {
  home: 'Home',
  work: 'Work',
  named: 'Place',
  venue: 'Venue',
  out: 'Out',
  unknown: 'Unknown',
}

function formatWhen(at: number): string {
  if (!at) return ''
  try {
    return new Date(at).toLocaleString()
  } catch {
    return ''
  }
}

/** View + delete the local (and synced) context conclusions. */
export function ContextLogScreen({}: Props) {
  const t = useTheme()
  const {events, deleteEvent, clearAll, refresh} = useContextEngine()
  const clearPrompt = Prompt.usePromptControl()

  // Pull any synced conclusions on open (no-op if the worker isn't deployed).
  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <Layout.Screen>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>Context log</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot>
          <Button
            label="Refresh"
            size="small"
            variant="ghost"
            color="secondary"
            shape="round"
            onPress={() => refresh()}>
            <ButtonIcon icon={RefreshIcon} />
          </Button>
        </Layout.Header.Slot>
      </Layout.Header.Outer>

      <Layout.Content>
        <SettingsList.Container>
          {events.length === 0 ? (
            <View style={[a.p_xl, a.gap_sm]}>
              <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
                <Trans>No conclusions yet</Trans>
              </Text>
              <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                <Trans>
                  Conclusions appear here as you move between places while the
                  app is open and the Context Engine is on. Only conclusions are
                  stored — never your raw location.
                </Trans>
              </Text>
            </View>
          ) : (
            events.map(ev => (
              <SettingsList.Item key={ev.id}>
                <View style={[a.flex_1, a.gap_2xs]}>
                  <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
                    {PLACE_LABEL[ev.place]}
                    {ev.placeRef ? ` · ${ev.placeRef}` : ''}
                  </Text>
                  <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                    {ev.attention.durationMin} min ·{' '}
                    {Math.round(ev.confidence * 100)}% · {formatWhen(ev.at)}
                  </Text>
                </View>
                <Button
                  label={`Delete this entry`}
                  size="small"
                  variant="ghost"
                  color="negative"
                  shape="round"
                  onPress={() => deleteEvent(ev.id)}>
                  <ButtonIcon icon={TrashIcon} />
                </Button>
              </SettingsList.Item>
            ))
          )}

          {events.length > 0 ? (
            <>
              <SettingsList.Divider />
              <View style={[a.px_lg, a.py_sm]}>
                <Button
                  label="Clear all context entries"
                  size="large"
                  variant="solid"
                  color="negative"
                  onPress={() => clearPrompt.open()}>
                  <ButtonIcon icon={TrashIcon} />
                  <ButtonText>
                    <Trans>Clear all</Trans>
                  </ButtonText>
                </Button>
              </View>
            </>
          ) : null}
        </SettingsList.Container>
      </Layout.Content>

      <Prompt.Basic
        control={clearPrompt}
        title="Clear all context entries?"
        description="This deletes every stored conclusion on this device (and asks the runtime to delete its copies). This can't be undone."
        confirmButtonCta="Clear all"
        confirmButtonColor="negative"
        onConfirm={() => clearAll()}
      />
    </Layout.Screen>
  )
}
