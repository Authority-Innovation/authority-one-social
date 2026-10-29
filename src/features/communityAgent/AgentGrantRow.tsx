/**
 * Per-community settings row for the COMMUNITY agent's grant.
 *
 * `setAgentGrant` turns the community agent's access to the caller's content
 * on or off (the contract in `communitiesClient.ts`). It does not
 * touch the person's own agent, so the copy must never name it. A separate
 * grant from membership, for this one community only, and off by default
 * (mockup d). Toggling calls `communitiesClient.setAgentGrant` once.
 * The switch moves straight away and snaps back if the runtime refuses.
 * Renders nothing with EXPO_PUBLIC_COMMUNITIES_ENABLED off.
 */
import {useState} from 'react'
import {View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'

import {setAgentGrant} from '#/lib/agent-runtime/communitiesClient'
import {atoms as a, useTheme} from '#/alf'
import * as Toggle from '#/components/forms/Toggle'
import {Text} from '#/components/Typography'
import {COMMUNITIES_ENABLED} from '#/env'

export function AgentGrantRow({
  communityId,
  initialValue = false,
}: {
  communityId: string
  initialValue?: boolean
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const [on, setOn] = useState(initialValue === true)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  if (!COMMUNITIES_ENABLED) return null

  // TODO(Elliott): final grant copy needs Elliott's sign-off. Until then it
  // uses only the runtime contract's words and makes no claim about which
  // posts the agent can read.
  const label = l`Give this community’s agent access to my content here`

  const onChange = async (next: boolean) => {
    if (pending) return
    setOn(next)
    setPending(true)
    setFailed(false)
    const res = await setAgentGrant(communityId, next)
    setPending(false)
    if (res.ok) {
      setOn(res.data.on)
    } else {
      setOn(!next)
      setFailed(true)
    }
  }

  return (
    <View testID="communityAgentGrantRow" style={[a.gap_xs]}>
      <Toggle.Item
        name={`community-agent-grant-${communityId}`}
        label={label}
        value={on}
        disabled={pending}
        onChange={next => void onChange(next)}
        style={[a.w_full]}>
        <Toggle.LabelText style={[a.flex_1]}>{label}</Toggle.LabelText>
        <Toggle.Platform />
      </Toggle.Item>
      <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
        <Trans>
          While this is on, the community’s agent has access to your content
          in this community. Off unless you turn it on. You can turn it off
          any time.
        </Trans>
      </Text>
      {failed ? (
        <Text
          testID="communityAgentGrantError"
          style={[a.text_xs, {color: t.palette.negative_500}]}>
          <Trans>Couldn’t save that change. Please try again.</Trans>
        </Text>
      ) : null}
    </View>
  )
}
