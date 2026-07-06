import {useState} from 'react'
import {ActivityIndicator, Pressable, View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'

import {
  type AgentUsage,
  formatCostUsd,
  formatTokens,
  type UsageWindow,
} from '#/lib/agent-runtime'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {sanitizeHandle} from '#/lib/strings/handles'
import {useOwnerUsageQuery} from '#/state/queries/agents'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import {atoms as a, useTheme} from '#/alf'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'AgentUsage'>

const WINDOWS: Array<{key: UsageWindow; label: string}> = [
  {key: 'today', label: 'Today'},
  {key: '7d', label: '7 days'},
  {key: '30d', label: '30 days'},
]

/**
 * AGENT BURN — read-only usage rollup across ALL the owner's agents: a headline
 * number (tokens + estimated $) per agent for the selected window, with a small
 * by-source breakdown (which channel the burn happened on). Data comes from
 * GET /app/usage; costs are estimates from published API prices, not a bill.
 */
export function AgentUsageScreen({}: Props) {
  const {t: l} = useLingui()
  const [window, setWindow] = useState<UsageWindow>('7d')
  const {data, isLoading, isFetching} = useOwnerUsageQuery(window)

  const usage = data?.usage ?? null
  const agents = usage?.agents ?? []

  return (
    <Layout.Screen>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>Agent Usage</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>

      <Layout.Content>
        <SettingsList.Container>
          <WindowToggle
            window={window}
            onSelect={setWindow}
            busy={isFetching}
          />

          {isLoading ? (
            <View style={[a.py_2xl, a.align_center]}>
              <ActivityIndicator />
            </View>
          ) : data?.signedOut ? (
            <Notice
              title={l`Sign in to see usage`}
              body={l`Your agents' usage appears here once you're signed in and the agent runtime is reachable.`}
            />
          ) : data?.error ? (
            <Notice title={l`Usage unavailable`} body={data.error} />
          ) : agents.length === 0 ? (
            <Notice
              title={l`No usage yet`}
              body={l`Once your agents start talking, their burn shows up here.`}
            />
          ) : (
            <>
              {usage ? (
                <GrandTotal
                  totalTokens={usage.total.totalTokens}
                  costUsd={usage.total.costUsd}
                />
              ) : null}
              {agents.map(agent => (
                <AgentUsageRow key={agent.agent} row={agent} />
              ))}
              <View style={[a.px_lg, a.py_md]}>
                <Text style={[a.text_xs, {opacity: 0.6}]}>
                  <Trans>
                    Dollar figures are estimates from published model prices —
                    not a bill. Very old activity ages out of the log.
                  </Trans>
                </Text>
              </View>
            </>
          )}
        </SettingsList.Container>
      </Layout.Content>
    </Layout.Screen>
  )
}

function WindowToggle({
  window,
  onSelect,
  busy,
}: {
  window: UsageWindow
  onSelect: (w: UsageWindow) => void
  busy: boolean
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  return (
    <View style={[a.flex_row, a.gap_sm, a.px_lg, a.py_md, a.align_center]}>
      {WINDOWS.map(w => {
        const selected = w.key === window
        return (
          <Pressable
            key={w.key}
            accessibilityRole="button"
            accessibilityLabel={l`Show usage for ${w.label}`}
            accessibilityHint={l`Switches the usage window`}
            onPress={() => onSelect(w.key)}
            style={[
              a.rounded_full,
              a.px_md,
              {paddingVertical: 6},
              {
                backgroundColor: selected
                  ? t.palette.primary_500
                  : t.palette.contrast_50,
              },
            ]}>
            <Text
              style={[
                a.text_sm,
                a.font_bold,
                {color: selected ? t.palette.white : t.palette.contrast_600},
              ]}>
              {w.label}
            </Text>
          </Pressable>
        )
      })}
      {busy ? <ActivityIndicator size="small" /> : null}
    </View>
  )
}

function GrandTotal({
  totalTokens,
  costUsd,
}: {
  totalTokens: number
  costUsd: number
}) {
  const t = useTheme()
  return (
    <View style={[a.px_lg, a.pb_md, a.flex_row, a.align_center, a.gap_sm]}>
      <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
        <Trans>All agents:</Trans>
      </Text>
      <Text style={[a.text_sm, a.font_bold, t.atoms.text]}>
        {formatTokens(totalTokens)} <Trans>tokens</Trans>
        {' · ~'}
        {formatCostUsd(costUsd)}
      </Text>
    </View>
  )
}

function AgentUsageRow({row}: {row: AgentUsage}) {
  const t = useTheme()
  const title = row.name || sanitizeHandle(row.agent, '@')
  return (
    <SettingsList.Item>
      <View style={[a.flex_1, a.gap_2xs]}>
        <View style={[a.flex_row, a.align_center, a.justify_between]}>
          <Text
            emoji
            style={[a.text_md, a.font_bold, t.atoms.text]}
            numberOfLines={1}>
            {title}
          </Text>
          <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
            {formatTokens(row.totalTokens)}
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              {' '}
              <Trans>tokens</Trans> {' · ~'}
              {formatCostUsd(row.costUsd)}
            </Text>
          </Text>
        </View>
        <Text
          style={[a.text_xs, t.atoms.text_contrast_medium]}
          numberOfLines={1}>
          {sanitizeHandle(row.agent, '@')}
        </Text>
        {row.bySource.length > 0 ? (
          <View style={[a.gap_2xs, a.pt_2xs]}>
            {row.bySource.map(s => (
              <View
                key={s.source}
                style={[a.flex_row, a.align_center, a.justify_between]}>
                <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                  {s.source}
                </Text>
                <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                  {formatTokens(s.totalTokens)} · ~{formatCostUsd(s.costUsd)}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
            <Trans>No activity in this window</Trans>
          </Text>
        )}
      </View>
    </SettingsList.Item>
  )
}

function Notice({title, body}: {title: string; body: string}) {
  const t = useTheme()
  return (
    <View style={[a.px_lg, a.py_2xl, a.gap_sm]}>
      <Text style={[a.text_md, a.font_bold, t.atoms.text]}>{title}</Text>
      <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>{body}</Text>
    </View>
  )
}
