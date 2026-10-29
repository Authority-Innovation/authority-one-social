import {beforeEach, describe, expect, it, jest} from '@jest/globals'
import {i18n} from '@lingui/core'
import {I18nProvider} from '@lingui/react'
import {
  act,
  fireEvent,
  render as rtlRender,
} from '@testing-library/react-native'

// The real #/alf barrel drags in Layout -> Dialog -> the native bottom-sheet
// module, which cannot load under jest. Proxy stubs are faithful enough here.
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
      children,
      label,
      onPress,
      testID,
    }: {
      children: React.ReactNode
      label: string
      onPress: () => void
      testID: string
    }) => (
      <Pressable
        accessibilityLabel={label}
        accessibilityHint=""
        onPress={onPress}
        testID={testID}>
        {children}
      </Pressable>
    ),
    ButtonText: ({children}: {children: React.ReactNode}) => (
      <Text>{children}</Text>
    ),
  }
})

jest.mock('#/lib/agent-runtime/communitiesClient', () => ({
  launchCommunityAgent: jest.fn(),
}))

const mockFlags = {communities: true}
jest.mock('#/env', () => ({
  get COMMUNITIES_ENABLED() {
    return mockFlags.communities
  },
}))

import {launchCommunityAgent} from '#/lib/agent-runtime/communitiesClient'
import {AgentLaunchControl} from '../AgentLaunchControl'
import {isCommunityAdmin} from '../isCommunityAdmin'

i18n.loadAndActivate({locale: 'en', messages: {}})

const mockLaunch = launchCommunityAgent as jest.Mock<
  typeof launchCommunityAgent
>

function render(ui: React.ReactElement) {
  return rtlRender(<I18nProvider i18n={i18n}>{ui}</I18nProvider>)
}

async function press(el: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(el)
    await Promise.resolve()
  })
}

const ID = 'btb-listeners'

beforeEach(() => {
  mockFlags.communities = true
  mockLaunch.mockReset()
})

describe('AgentLaunchControl', () => {
  it('an admin sees the control, and pressing launches once', async () => {
    mockLaunch.mockResolvedValue({ok: true, data: null})
    const onLaunched = jest.fn()
    const {getByTestId, queryByTestId} = render(
      <AgentLaunchControl
        community={{id: ID, viewerIsAdmin: true}}
        onLaunched={onLaunched}
      />,
    )
    const button = getByTestId('communityAgentLaunchButton')
    expect(button.props.accessibilityLabel).toBe('Launch community agent')

    await press(button)
    expect(mockLaunch).toHaveBeenCalledTimes(1)
    expect(mockLaunch).toHaveBeenCalledWith(ID)
    expect(onLaunched).toHaveBeenCalledTimes(1)
    expect(getByTestId('communityAgentLaunched')).toBeTruthy()
    expect(queryByTestId('communityAgentLaunchButton')).toBeNull()
    expect(queryByTestId('communityAgentLaunchError')).toBeNull()
  })

  it('a plain member sees nothing', () => {
    const {toJSON} = render(
      <AgentLaunchControl community={{id: ID, viewerIsAdmin: false}} />,
    )
    expect(toJSON()).toBeNull()
  })

  it('an owner or moderator role without viewerIsAdmin sees nothing', () => {
    const owner = {id: ID, role: 'owner'}
    const moderator = {id: ID, role: 'moderator'}
    expect(render(<AgentLaunchControl community={owner} />).toJSON()).toBeNull()
    expect(
      render(<AgentLaunchControl community={moderator} />).toJSON(),
    ).toBeNull()
  })

  it('absent viewerIsAdmin sees nothing', () => {
    const {toJSON} = render(<AgentLaunchControl community={{id: ID}} />)
    expect(toJSON()).toBeNull()
  })

  it('a former admin (viewerIsAdmin false on refetch) sees nothing', () => {
    const {rerender, getByTestId, toJSON} = render(
      <AgentLaunchControl community={{id: ID, viewerIsAdmin: true}} />,
    )
    expect(getByTestId('communityAgentLaunchButton')).toBeTruthy()
    rerender(
      <I18nProvider i18n={i18n}>
        <AgentLaunchControl community={{id: ID, viewerIsAdmin: false}} />
      </I18nProvider>,
    )
    expect(toJSON()).toBeNull()
  })

  it('no community renders nothing', () => {
    expect(render(<AgentLaunchControl community={undefined} />).toJSON()).toBe(
      null,
    )
  })

  it('flag off renders nothing, even for an admin', () => {
    mockFlags.communities = false
    const {toJSON} = render(
      <AgentLaunchControl community={{id: ID, viewerIsAdmin: true}} />,
    )
    expect(toJSON()).toBeNull()
    expect(mockLaunch).not.toHaveBeenCalled()
  })

  it('a launch failure shows an error and does not change state', async () => {
    mockLaunch.mockResolvedValue({
      ok: false,
      error: {kind: 'http', status: 403, message: 'not an admin'},
    })
    const onLaunched = jest.fn()
    const {getByTestId, queryByTestId} = render(
      <AgentLaunchControl
        community={{id: ID, viewerIsAdmin: true}}
        onLaunched={onLaunched}
      />,
    )
    await press(getByTestId('communityAgentLaunchButton'))
    expect(mockLaunch).toHaveBeenCalledTimes(1)
    expect(getByTestId('communityAgentLaunchError')).toBeTruthy()
    expect(onLaunched).not.toHaveBeenCalled()
    expect(queryByTestId('communityAgentLaunched')).toBeNull()
    // Still offered, so the admin can try again.
    expect(getByTestId('communityAgentLaunchButton')).toBeTruthy()

    mockLaunch.mockResolvedValue({ok: true, data: null})
    await press(getByTestId('communityAgentLaunchButton'))
    expect(queryByTestId('communityAgentLaunchError')).toBeNull()
    expect(getByTestId('communityAgentLaunched')).toBeTruthy()
  })
})

describe('isCommunityAdmin', () => {
  it('is true only for a literal viewerIsAdmin === true', () => {
    expect(isCommunityAdmin({viewerIsAdmin: true})).toBe(true)
    expect(isCommunityAdmin({viewerIsAdmin: false})).toBe(false)
    expect(isCommunityAdmin({})).toBe(false)
    expect(isCommunityAdmin(null)).toBe(false)
    expect(isCommunityAdmin(undefined)).toBe(false)
    expect(isCommunityAdmin({viewerIsAdmin: 'true'})).toBe(false)
    expect(isCommunityAdmin({viewerIsAdmin: 1})).toBe(false)
    expect(
      isCommunityAdmin({role: 'owner'} as {viewerIsAdmin?: unknown}),
    ).toBe(false)
    expect(
      isCommunityAdmin({role: 'moderator'} as {viewerIsAdmin?: unknown}),
    ).toBe(false)
  })
})
