import {Fragment, useCallback} from 'react'
import {View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {type OwnerAgent} from '#/lib/agent-runtime'
import {useAccountSwitcher} from '#/lib/hooks/useAccountSwitcher'
import {type NavigationProp} from '#/lib/routes/types'
import {sanitizeHandle} from '#/lib/strings/handles'
import {useOwnerAgentsQuery} from '#/state/queries/agents'
import {useProfilesQuery} from '#/state/queries/profile'
import {type SessionAccount, useSession} from '#/state/session'
import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {Button} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {ChevronRight_Stroke2_Corner0_Rounded as ChevronIcon} from '#/components/icons/Chevron'
import {AccountList} from '../AccountList'
import {Text} from '../Typography'

export function SwitchAccountDialog({
  control,
}: {
  control: Dialog.DialogControlProps
}) {
  const {_} = useLingui()
  const {currentAccount} = useSession()
  const {onPressSwitchAccount, pendingDid} = useAccountSwitcher()
  const {setShowLoggedOut} = useLoggedOutViewControls()

  const onSelectAccount = useCallback(
    (account: SessionAccount) => {
      if (account.did !== currentAccount?.did) {
        control.close(() => {
          onPressSwitchAccount(account, 'SwitchAccount')
        })
      } else {
        control.close()
      }
    },
    [currentAccount, control, onPressSwitchAccount],
  )

  const onPressAddAccount = useCallback(() => {
    control.close(() => {
      setShowLoggedOut(true)
    })
  }, [setShowLoggedOut, control])

  return (
    <Dialog.Outer control={control} nativeOptions={{preventExpansion: true}}>
      <Dialog.Handle />
      <Dialog.ScrollableInner label={_(msg`Switch account`)}>
        <View style={[a.gap_lg]}>
          <Text style={[a.text_2xl, a.font_semi_bold]}>
            <Trans>Switch account</Trans>
          </Text>

          <AccountList
            onSelectAccount={onSelectAccount}
            onSelectOther={onPressAddAccount}
            otherLabel={_(msg`Add account`)}
            pendingDid={pendingDid}
          />

          <YourAgentsSection control={control} />
        </View>

        <Dialog.Close />
      </Dialog.ScrollableInner>
    </Dialog.Outer>
  )
}

/**
 * "Your agents" under the human accounts: selecting an agent NAVIGATES to its
 * AgentHub (management context). It does NOT switch the session — the human
 * stays signed in as themselves; no agent session ever exists client-side.
 * Visually imitates the AccountList rows; mechanically it is navigation.
 */
function YourAgentsSection({control}: {control: Dialog.DialogControlProps}) {
  const t = useTheme()
  const {_} = useLingui()
  const navigation = useNavigation<NavigationProp>()
  const {data} = useOwnerAgentsQuery()
  const agents = data?.agents ?? []
  const {data: profiles} = useProfilesQuery({
    handles: agents.map(agent => agent.did ?? agent.handle),
  })

  if (agents.length === 0) return null

  const onSelectAgent = (agent: OwnerAgent) => {
    control.close(() => {
      navigation.navigate('AgentHub', {agent: agent.handle})
    })
  }

  return (
    <View style={[a.gap_sm]}>
      <Text style={[a.text_md, a.font_semi_bold, t.atoms.text_contrast_medium]}>
        <Trans>Your agents</Trans>
      </Text>
      <View
        style={[
          a.rounded_lg,
          a.overflow_hidden,
          a.border,
          t.atoms.border_contrast_low,
        ]}>
        {agents.map((agent, i) => {
          const profile = profiles?.profiles.find(
            p =>
              p.did === agent.did ||
              p.handle.toLowerCase() === agent.handle.toLowerCase(),
          )
          const name = profile?.displayName || agent.displayName || agent.handle
          return (
            <Fragment key={agent.handle}>
              {i > 0 && (
                <View style={[a.border_b, t.atoms.border_contrast_low]} />
              )}
              <Button
                testID={`manageAgentBtn-${agent.handle}`}
                style={[a.w_full]}
                onPress={() => onSelectAgent(agent)}
                label={_(msg`Manage ${name}`)}>
                {({hovered, pressed}) => (
                  <View
                    style={[
                      a.flex_1,
                      a.flex_row,
                      a.align_center,
                      a.p_lg,
                      a.gap_sm,
                      (hovered || pressed) && t.atoms.bg_contrast_25,
                    ]}>
                    <UserAvatar
                      avatar={profile?.avatar ?? agent.avatar}
                      size={48}
                      type="user"
                    />
                    <View style={[a.flex_1, a.gap_2xs]}>
                      <Text
                        emoji
                        style={[a.font_medium, a.leading_tight, a.text_md]}
                        numberOfLines={1}>
                        {name}
                      </Text>
                      <Text
                        style={[
                          a.leading_tight,
                          t.atoms.text_contrast_medium,
                          a.text_sm,
                        ]}
                        numberOfLines={1}>
                        {sanitizeHandle(agent.handle, '@')}
                      </Text>
                    </View>
                    <Text
                      style={[a.text_xs, t.atoms.text_contrast_low]}
                      numberOfLines={1}>
                      <Trans>Manage</Trans>
                    </Text>
                    <ChevronIcon
                      size="md"
                      style={[t.atoms.text_contrast_low]}
                    />
                  </View>
                )}
              </Button>
            </Fragment>
          )
        })}
      </View>
    </View>
  )
}
