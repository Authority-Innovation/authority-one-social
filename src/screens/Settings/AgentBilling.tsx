import {ActivityIndicator, View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'

import {
  formatTokenAllowance,
  type OwnerBilling,
  PLAN_META,
  PLAN_ORDER,
  type PlanMeta,
} from '#/lib/agent-runtime'
import {useOpenLink} from '#/lib/hooks/useOpenLink'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {useOwnerBillingQuery} from '#/state/queries/agents'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'AgentBilling'>

/**
 * PLAN & BILLING — the customer's in-app billing surface: their CURRENT tier +
 * token allowance, this-cycle usage against that allowance, the three plans, and
 * Upgrade / Manage buttons that hand off to the AppView's Stripe flows.
 *
 * PREVIEW-AWARE: Stripe is disabled in this environment (`billingArmed:false`),
 * so a banner explains billing is in preview and the CTAs open the AppView's own
 * in-preview/stub page instead of a live Stripe redirect (never a broken link).
 * Data comes from GET /app/billing; token counts are the same estimate the Usage
 * screen shows.
 */
export function AgentBillingScreen({}: Props) {
  const {t: l} = useLingui()
  const {data, isLoading} = useOwnerBillingQuery()

  const billing = data?.billing ?? null

  return (
    <Layout.Screen>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>Plan & Billing</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>

      <Layout.Content>
        <SettingsList.Container>
          {isLoading ? (
            <View style={[a.py_2xl, a.align_center]}>
              <ActivityIndicator />
            </View>
          ) : data?.signedOut ? (
            <Notice
              title={l`Sign in to see your plan`}
              body={l`Your plan and billing appear here once you're signed in and the agent runtime is reachable.`}
            />
          ) : data?.error ? (
            <Notice title={l`Billing unavailable`} body={data.error} />
          ) : billing ? (
            <BillingBody billing={billing} />
          ) : (
            <Notice
              title={l`Billing unavailable`}
              body={l`We couldn't load your plan right now.`}
            />
          )}
        </SettingsList.Container>
      </Layout.Content>
    </Layout.Screen>
  )
}

function BillingBody({billing}: {billing: OwnerBilling}) {
  const {t: l} = useLingui()
  const openLink = useOpenLink()

  const onUpgrade = () => {
    if (billing.upgradeUrl) void openLink(billing.upgradeUrl)
  }
  const onManage = () => {
    if (billing.manageUrl) void openLink(billing.manageUrl)
  }

  const currentMeta = PLAN_META[billing.plan]

  return (
    <>
      {!billing.billingArmed ? <PreviewBanner /> : null}

      <CurrentPlanCard billing={billing} meta={currentMeta} />

      <UsageMeter billing={billing} />

      <SettingsList.Divider />

      <View style={[a.px_lg, a.pt_md, a.pb_2xs]}>
        <Text style={[a.text_sm, a.font_bold, {opacity: 0.8}]}>
          <Trans>Plans</Trans>
        </Text>
      </View>

      {PLAN_ORDER.map(id => (
        <PlanCard key={id} meta={PLAN_META[id]} current={id === billing.plan} />
      ))}

      <View style={[a.px_lg, a.py_md, a.gap_sm]}>
        {billing.upgradeUrl ? (
          <Button
            label={l`Change plan`}
            size="large"
            variant="solid"
            color="primary"
            onPress={onUpgrade}>
            <ButtonText>
              {billing.plan === 'scale' ? (
                <Trans>Change plan</Trans>
              ) : (
                <Trans>Upgrade plan</Trans>
              )}
            </ButtonText>
          </Button>
        ) : null}
        {billing.manageUrl ? (
          <Button
            label={l`Manage billing`}
            size="large"
            variant="outline"
            color="secondary"
            onPress={onManage}>
            <ButtonText>
              <Trans>Manage billing</Trans>
            </ButtonText>
          </Button>
        ) : null}
      </View>

      <View style={[a.px_lg, a.pb_2xl]}>
        <Text style={[a.text_xs, {opacity: 0.6}]}>
          {billing.billingArmed ? (
            <Trans>
              Upgrades and cancellations are handled through Stripe's secure
              hosted pages — we never see your card. Token figures are estimates
              from published model prices, not a bill.
            </Trans>
          ) : (
            <Trans>
              Billing is in preview. Choosing a plan opens a preview page rather
              than charging a card — no payment is taken while billing is off.
              Token figures are estimates from published model prices, not a
              bill.
            </Trans>
          )}
        </Text>
      </View>
    </>
  )
}

function PreviewBanner() {
  const t = useTheme()
  return (
    <View style={[a.px_lg, a.pt_md]}>
      <View
        style={[
          a.rounded_md,
          a.px_md,
          a.py_sm,
          {backgroundColor: t.palette.contrast_50},
        ]}>
        <Text style={[a.text_sm, a.font_bold, t.atoms.text]}>
          <Trans>Billing is in preview</Trans>
        </Text>
        <Text style={[a.text_xs, a.pt_2xs, t.atoms.text_contrast_medium]}>
          <Trans>
            Paid plans aren't armed yet — you can browse the tiers and see your
            current allowance, but selecting a plan won't charge a card.
          </Trans>
        </Text>
      </View>
    </View>
  )
}

function CurrentPlanCard({
  billing,
  meta,
}: {
  billing: OwnerBilling
  meta: PlanMeta
}) {
  const t = useTheme()
  return (
    <View style={[a.px_lg, a.pt_md]}>
      <View style={[a.flex_row, a.align_center, a.justify_between]}>
        <View>
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
            <Trans>Current plan</Trans>
          </Text>
          <Text style={[a.text_2xl, a.font_bold, t.atoms.text]}>
            {meta.name}
          </Text>
        </View>
        <View
          style={[
            a.rounded_full,
            a.px_md,
            {paddingVertical: 4, backgroundColor: t.palette.primary_500},
          ]}>
          <Text style={[a.text_sm, a.font_bold, {color: t.palette.white}]}>
            {meta.priceLabel}
          </Text>
        </View>
      </View>
      {billing.reached ? (
        <Text style={[a.text_xs, a.pt_2xs, {color: t.palette.negative_500}]}>
          <Trans>You've reached this plan's monthly allowance.</Trans>
        </Text>
      ) : billing.warn ? (
        <Text style={[a.text_xs, a.pt_2xs, {color: t.palette.primary_500}]}>
          <Trans>You're close to this plan's monthly allowance.</Trans>
        </Text>
      ) : null}
    </View>
  )
}

function UsageMeter({billing}: {billing: OwnerBilling}) {
  const t = useTheme()
  const pct =
    billing.allowance > 0
      ? Math.min(100, Math.round(billing.fraction * 100))
      : 0
  const barColor = billing.reached
    ? t.palette.negative_500
    : billing.warn
      ? t.palette.primary_500
      : t.palette.positive_500
  return (
    <View style={[a.px_lg, a.pt_md, a.gap_xs]}>
      <View style={[a.flex_row, a.align_center, a.justify_between]}>
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          <Trans>Usage this cycle</Trans>
        </Text>
        <Text style={[a.text_sm, a.font_bold, t.atoms.text]}>
          {formatTokenAllowance(billing.used)}
          {billing.allowance > 0 ? (
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              {' / '}
              {formatTokenAllowance(billing.allowance)}
            </Text>
          ) : null}
        </Text>
      </View>
      {billing.allowance > 0 ? (
        <View
          style={[
            a.rounded_full,
            {height: 8, backgroundColor: t.palette.contrast_100},
          ]}>
          <View
            style={[
              a.rounded_full,
              {height: 8, width: `${pct}%`, backgroundColor: barColor},
            ]}
          />
        </View>
      ) : null}
    </View>
  )
}

function PlanCard({meta, current}: {meta: PlanMeta; current: boolean}) {
  const t = useTheme()
  return (
    <SettingsList.Item>
      <View style={[a.flex_1, a.gap_2xs]}>
        <View style={[a.flex_row, a.align_center, a.gap_sm]}>
          <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
            {meta.name}
          </Text>
          {current ? (
            <View
              style={[
                a.rounded_full,
                a.px_sm,
                {paddingVertical: 2, backgroundColor: t.palette.positive_50},
              ]}>
              <Text
                style={[
                  a.text_xs,
                  a.font_bold,
                  {color: t.palette.positive_700},
                ]}>
                <Trans>Current</Trans>
              </Text>
            </View>
          ) : meta.recommended ? (
            <View
              style={[
                a.rounded_full,
                a.px_sm,
                {paddingVertical: 2, backgroundColor: t.palette.primary_50},
              ]}>
              <Text
                style={[
                  a.text_xs,
                  a.font_bold,
                  {color: t.palette.primary_600},
                ]}>
                <Trans>Recommended</Trans>
              </Text>
            </View>
          ) : null}
          <View style={[a.flex_1]} />
          <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
            {meta.priceLabel}
          </Text>
        </View>
        <View style={[a.gap_2xs, a.pt_2xs]}>
          {meta.features.map((f, i) => (
            <Text
              key={i}
              style={[a.text_xs, t.atoms.text_contrast_medium]}
              numberOfLines={1}>
              {'· '}
              {f}
            </Text>
          ))}
        </View>
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
