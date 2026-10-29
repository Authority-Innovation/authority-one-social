import {beforeEach, describe, expect, it, jest} from '@jest/globals'
import {i18n} from '@lingui/core'
import {I18nProvider} from '@lingui/react'
import {fireEvent, render as rtlRender} from '@testing-library/react-native'

jest.mock('#/alf', () => {
  const styleProxy: Record<string, object> = new Proxy({}, {get: () => ({})})
  return {
    atoms: styleProxy,
    useTheme: () => ({
      atoms: styleProxy,
      palette: new Proxy({}, {get: () => '#000000'}),
    }),
  }
})

jest.mock('#/components/Typography', () => {
  const {Text} = require('react-native')
  return {Text}
})

jest.mock('#/components/Button', () => {
  const {Pressable, Text} = require('react-native')
  return {
    Button: ({
      testID,
      label,
      onPress,
      children,
    }: {
      testID?: string
      label: string
      onPress: () => void
      children: React.ReactNode
    }) => (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint=""
        onPress={onPress}>
        {children}
      </Pressable>
    ),
    ButtonText: ({children}: {children: React.ReactNode}) => (
      <Text>{children}</Text>
    ),
  }
})

jest.mock('#/components/forms/Toggle', () => {
  const {Pressable, Text} = require('react-native')
  return {
    Item: ({children}: {children: React.ReactNode}) => (
      <Pressable testID="agentGrantToggle" accessibilityRole="switch">
        {children}
      </Pressable>
    ),
    LabelText: ({children}: {children: React.ReactNode}) => (
      <Text>{children}</Text>
    ),
    Platform: () => null,
  }
})

jest.mock('#/lib/agent-runtime/communitiesClient', () => ({
  setAgentGrant: jest.fn(),
}))

const mockFlags = {communities: true}
jest.mock('#/env', () => ({
  get COMMUNITIES_ENABLED() {
    return mockFlags.communities
  },
}))

import {isCommunityAdmin} from '../adminGate'
import {AgentGrantRow} from '../AgentGrantRow'
import {AgentLaunchControl} from '../AgentLaunchControl'

i18n.loadAndActivate({locale: 'en', messages: {}})

function render(ui: React.ReactElement) {
  return rtlRender(<I18nProvider i18n={i18n}>{ui}</I18nProvider>)
}

const ID = 'btb-listeners'

beforeEach(() => {
  mockFlags.communities = true
})

describe('isCommunityAdmin', () => {
  it('is true only for viewerIsAdmin === true', () => {
    expect(isCommunityAdmin({viewerIsAdmin: true})).toBe(true)
    expect(isCommunityAdmin({viewerIsAdmin: false})).toBe(false)
    expect(isCommunityAdmin({})).toBe(false)
    expect(isCommunityAdmin({viewerIsAdmin: 'true'})).toBe(false)
    expect(isCommunityAdmin({viewerIsAdmin: 1})).toBe(false)
    expect(isCommunityAdmin(null)).toBe(false)
    expect(isCommunityAdmin(undefined)).toBe(false)
  })

  it('does not treat a membership role as admin', () => {
    expect(isCommunityAdmin({role: 'owner'} as {viewerIsAdmin?: unknown})).toBe(
      false,
    )
  })
})

describe('agent launch control', () => {
  it('an admin sees the launch control and pressing it launches once', () => {
    const onLaunch = jest.fn()
    const r = render(
      <AgentLaunchControl
        community={{id: ID, viewerIsAdmin: true}}
        onLaunch={onLaunch}
      />,
    )
    fireEvent.press(r.getByTestId('communityAgentLaunch'))
    expect(onLaunch).toHaveBeenCalledTimes(1)
    expect(onLaunch).toHaveBeenCalledWith(ID)
  })

  it('a non-admin sees no launch control, not even a disabled one', () => {
    const r = render(
      <AgentLaunchControl
        community={{id: ID, viewerIsAdmin: false}}
        onLaunch={jest.fn()}
      />,
    )
    expect(r.queryByTestId('communityAgentLaunch')).toBeNull()
    expect(r.toJSON()).toBeNull()
  })

  it('an absent admin field means no launch control', () => {
    const r = render(
      <AgentLaunchControl community={{id: ID}} onLaunch={jest.fn()} />,
    )
    expect(r.queryByTestId('communityAgentLaunch')).toBeNull()
    expect(r.toJSON()).toBeNull()
  })

  it('a missing community (e.g. a deep link before load) means no launch control', () => {
    const r = render(
      <AgentLaunchControl community={undefined} onLaunch={jest.fn()} />,
    )
    expect(r.toJSON()).toBeNull()
  })

  it('renders nothing with the flag off, even for an admin', () => {
    mockFlags.communities = false
    const r = render(
      <AgentLaunchControl
        community={{id: ID, viewerIsAdmin: true}}
        onLaunch={jest.fn()}
      />,
    )
    expect(r.toJSON()).toBeNull()
  })
})

describe('agent grant row', () => {
  it('never offers launch, to anyone', () => {
    const r = render(<AgentGrantRow communityId={ID} />)
    expect(r.getByTestId('communityAgentGrantRow')).toBeTruthy()
    expect(r.queryByTestId('communityAgentLaunch')).toBeNull()
    expect(JSON.stringify(r.toJSON())).not.toMatch(/launch|sponsor/i)
  })
})
