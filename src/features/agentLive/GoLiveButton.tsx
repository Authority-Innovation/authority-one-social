/**
 * "Go live" on an agent the signed-in person owns (design r2 §6 step 1).
 *
 * Renders nothing, not a disabled button, unless EXPO_PUBLIC_AGENT_LIVE_ENABLED
 * is on and the agent is owned with a known DID. It imports no LiveKit code:
 * the SDK loads only when the session screen starts a session.
 */
import {useLingui} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {type OwnerAgent} from '#/lib/agent-runtime'
import {type NavigationProp} from '#/lib/routes/types'
import {atoms as a} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {Live_Stroke2_Corner0_Rounded as LiveIcon} from '#/components/icons/Live'
import {AGENT_LIVE_ENABLED} from './flag'

export function GoLiveButton({agent}: {agent: OwnerAgent | undefined}) {
  const {t: l} = useLingui()
  const navigation = useNavigation<NavigationProp>()

  if (!AGENT_LIVE_ENABLED || !agent?.did) return null

  return (
    <Button
      testID="agentGoLiveButton"
      label={l`Go live with your agent`}
      color="primary"
      size="small"
      style={[a.self_start]}
      onPress={() => navigation.navigate('AgentLive', {agent: agent.handle})}>
      <ButtonIcon icon={LiveIcon} />
      <ButtonText>{l({message: 'Go live', context: 'Button'})}</ButtonText>
    </Button>
  )
}
