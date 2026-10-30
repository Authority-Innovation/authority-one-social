/**
 * Screen tests for Agent Live:
 * - flag off: no Go live button, no session, no LiveKit SDK evaluated;
 * - flag on: the stage fills the screen with mic and blind controls on top,
 *   the camera is off by default and publishes only after the owner turns it
 *   on and the camera token arrives.
 */
import {StyleSheet} from 'react-native'
import {beforeEach, describe, expect, it, jest} from '@jest/globals'
import {i18n} from '@lingui/core'
import {I18nProvider} from '@lingui/react'
import {
  act,
  fireEvent,
  render as rtlRender,
  within,
} from '@testing-library/react-native'

// Real static atoms (so "full screen" is checked against real styles), a
// stub theme. The #/alf barrel itself drags in native-only modules.
jest.mock('#/alf', () => {
  const themeProxy: Record<string, object> = new Proxy({}, {get: () => ({})})
  return {
    atoms: jest.requireActual<{atoms: object}>('@bsky.app/alf').atoms,
    useTheme: () => ({
      atoms: themeProxy,
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
      disabled,
    }: {
      children: React.ReactNode
      label: string
      onPress: () => void
      testID: string
      disabled?: boolean
    }) => (
      <Pressable
        accessibilityLabel={label}
        accessibilityHint=""
        accessibilityState={{disabled: !!disabled}}
        disabled={disabled}
        onPress={onPress}
        testID={testID}>
        {children}
      </Pressable>
    ),
    ButtonText: ({children}: {children: React.ReactNode}) => (
      <Text>{children}</Text>
    ),
    ButtonIcon: () => null,
  }
})

jest.mock('#/components/icons/Live', () => ({
  Live_Stroke2_Corner0_Rounded: () => null,
}))
jest.mock('#/components/icons/Camera', () => ({
  Camera_Stroke2_Corner0_Rounded: () => null,
}))
jest.mock('#/components/icons/Eye', () => ({
  Eye_Stroke2_Corner0_Rounded: () => null,
}))
jest.mock('#/components/icons/EyeSlash', () => ({
  EyeSlash_Stroke2_Corner0_Rounded: () => null,
}))
jest.mock('#/components/icons/Microphone', () => ({
  Microphone_Stroke2_Corner0_Rounded: () => null,
}))
jest.mock('#/lib/agent-runtime', () => ({}))

const mockNavigate = jest.fn()
const mockGoBack = jest.fn()
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    canGoBack: () => true,
  }),
}))

type Agent = {handle: string; did?: string; displayName?: string}
const mockOwned: {agent: Agent | undefined; loading: boolean} = {
  agent: undefined,
  loading: false,
}
jest.mock('#/state/queries/agents', () => ({
  useOwnedAgent: () => mockOwned.agent,
  useOwnerAgentsQuery: () => ({isLoading: mockOwned.loading}),
}))

const mockFlag = {on: false}
jest.mock('#/features/agentLive/flag', () => ({
  get AGENT_LIVE_ENABLED() {
    return mockFlag.on
  },
}))

jest.mock('#/features/agentLive/room', () => ({
  loadLiveRoomFactory: jest.fn(),
}))

jest.mock('#/features/agentLive/api', () => ({
  startLiveSession: jest.fn(),
  requestLiveToken: jest.fn(),
  endLiveSession: jest.fn(),
}))

// Evaluating either SDK module calls this. Flag off must never do so.
const mockSdkLoaded = jest.fn()
jest.mock('@livekit/react-native', () => {
  mockSdkLoaded('@livekit/react-native')
  return {
    registerGlobals: () => {},
    AudioSession: {
      startAudioSession: async () => {},
      stopAudioSession: async () => {},
    },
    VideoTrack: () => null,
  }
})
jest.mock('livekit-client', () => {
  mockSdkLoaded('livekit-client')
  class Room {
    remoteParticipants = new Map()
    on() {
      return this
    }
  }
  return {
    Room,
    RoomEvent: {},
    Track: {Kind: {}, Source: {}},
  }
})

import {createFakeRoom} from '#/features/agentLive/__fixtures__/fakeRoom'
import {
  AGENT_DID,
  AGENT_HANDLE,
  CAMERA_TOKEN_FIXTURE,
  SESSION_FIXTURE,
} from '#/features/agentLive/__fixtures__/piece1Live'
import {
  endLiveSession,
  requestLiveToken,
  startLiveSession,
} from '#/features/agentLive/api'
import {GoLiveButton} from '#/features/agentLive/GoLiveButton'
import {loadLiveRoomFactory} from '#/features/agentLive/room'
import {AgentLiveScreen} from '../index'

i18n.loadAndActivate({locale: 'en', messages: {}})

const mockLoad = loadLiveRoomFactory as jest.Mock<typeof loadLiveRoomFactory>
const mockStart = startLiveSession as jest.Mock<typeof startLiveSession>
const mockToken = requestLiveToken as jest.Mock<typeof requestLiveToken>
const mockEnd = endLiveSession as jest.Mock<typeof endLiveSession>

const OWNED: Agent = {handle: AGENT_HANDLE, did: AGENT_DID, displayName: 'Bob'}

function render(ui: React.ReactElement) {
  return rtlRender(<I18nProvider i18n={i18n}>{ui}</I18nProvider>)
}

function screen() {
  const props = {
    route: {
      key: 'AgentLive-1',
      name: 'AgentLive',
      params: {agent: AGENT_HANDLE},
    },
    navigation: {},
  } as unknown as React.ComponentProps<typeof AgentLiveScreen>
  return render(<AgentLiveScreen {...props} />)
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve()
  })
}

async function press(el: Parameters<typeof fireEvent.press>[0]) {
  act(() => {
    fireEvent.press(el)
  })
  await flush()
}

beforeEach(() => {
  mockFlag.on = false
  mockOwned.agent = OWNED
  mockOwned.loading = false
  mockNavigate.mockReset()
  mockGoBack.mockReset()
  mockLoad.mockReset()
  mockStart.mockReset().mockResolvedValue({ok: true, data: SESSION_FIXTURE})
  mockToken
    .mockReset()
    .mockResolvedValue({ok: true, data: CAMERA_TOKEN_FIXTURE})
  mockEnd.mockReset().mockResolvedValue({ok: true, data: null})
})

describe('flag off (EXPO_PUBLIC_AGENT_LIVE_ENABLED)', () => {
  it('no Go live button, even on an owned agent', () => {
    const {toJSON, queryByTestId} = render(<GoLiveButton agent={OWNED} />)
    expect(toJSON()).toBeNull()
    expect(queryByTestId('agentGoLiveButton')).toBeNull()
  })

  it('the session screen starts nothing and loads no media code', async () => {
    const {getByTestId, queryByTestId} = screen()
    await flush()
    expect(getByTestId('agentLiveOff')).toBeTruthy()
    expect(queryByTestId('agentLiveStage')).toBeNull()
    expect(mockLoad).not.toHaveBeenCalled()
    expect(mockStart).not.toHaveBeenCalled()
  })

  it('no LiveKit SDK module was evaluated', () => {
    expect(mockSdkLoaded).not.toHaveBeenCalled()
  })
})

describe('Go live button (flag on)', () => {
  beforeEach(() => {
    mockFlag.on = true
  })

  it('shows on an owned agent and opens its session screen', async () => {
    const {getByTestId} = render(<GoLiveButton agent={OWNED} />)
    await press(getByTestId('agentGoLiveButton'))
    expect(mockNavigate).toHaveBeenCalledWith('AgentLive', {
      agent: AGENT_HANDLE,
    })
  })

  it('nothing without an agent DID', () => {
    expect(
      render(<GoLiveButton agent={{handle: AGENT_HANDLE}} />).toJSON(),
    ).toBeNull()
    expect(render(<GoLiveButton agent={undefined} />).toJSON()).toBeNull()
  })
})

describe('session screen (flag on)', () => {
  beforeEach(() => {
    mockFlag.on = true
  })

  async function startScreen() {
    const fake = createFakeRoom()
    mockLoad.mockResolvedValue(() => fake.room)
    const r = screen()
    await flush()
    return {...r, fake}
  }

  it('an agent the person does not own: no session', async () => {
    mockOwned.agent = undefined
    const {getByTestId} = screen()
    await flush()
    expect(getByTestId('agentLiveNotOwned')).toBeTruthy()
    expect(mockLoad).not.toHaveBeenCalled()
    expect(mockStart).not.toHaveBeenCalled()
  })

  it('starts with {agentDid} only', async () => {
    await startScreen()
    expect(mockStart).toHaveBeenCalledTimes(1)
    expect(mockStart).toHaveBeenCalledWith({agentDid: AGENT_DID})
  })

  it('renders the stage full screen, with mic and blind controls', async () => {
    const {getByTestId, fake} = await startScreen()
    const stage = getByTestId('agentLiveStage')
    const {style} = (stage as unknown as {props: {style: unknown}}).props
    expect(StyleSheet.flatten(style as object)).toMatchObject({
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    })
    act(() => fake.showStage('agent-stage'))
    // The agent's stage video is inside the full-screen stage view.
    expect(within(stage).getByTestId('fakeStageVideo')).toBeTruthy()
    expect(getByTestId('agentLiveMicButton')).toBeTruthy()
    expect(getByTestId('agentLiveMicIndicator')).toBeTruthy()
    expect(getByTestId('agentLiveBlindButton')).toBeTruthy()
    expect(getByTestId('agentLiveAiLabel')).toBeTruthy()
  })

  it('mic toggles off and the indicator goes', async () => {
    const {getByTestId, queryByTestId, fake} = await startScreen()
    await press(getByTestId('agentLiveMicButton'))
    expect(fake.calls[fake.calls.length - 1]).toEqual({op: 'mic', on: false})
    expect(queryByTestId('agentLiveMicIndicator')).toBeNull()
  })

  it('the blind control sends the ruling 2 message', async () => {
    const {getByTestId, getByLabelText, fake} = await startScreen()
    await press(getByTestId('agentLiveBlindButton'))
    expect(fake.calls.filter(c => c.op === 'data')).toEqual([
      {
        op: 'data',
        text: '{"t":"blind","on":true,"src":"*"}',
        topic: 'stage.reply',
        reliable: true,
      },
    ])
    expect(getByLabelText('Let your agent see')).toBeTruthy()
  })

  it('camera is off by default and publishes only once turned on', async () => {
    const {getByTestId, getByLabelText, fake} = await startScreen()
    expect(getByLabelText('Turn camera on')).toBeTruthy()
    expect(fake.cameraPublishes()).toBe(0)
    expect(mockToken).not.toHaveBeenCalled()

    await press(getByTestId('agentLiveCameraButton'))
    expect(mockToken).toHaveBeenCalledWith({
      sid: SESSION_FIXTURE.sid,
      camera: true,
    })
    expect(fake.cameraPublishes()).toBe(1)
    // The camera token joined the room before the camera published.
    const lastConnect = fake.calls.map(c => c.op).lastIndexOf('connect')
    const publish = fake.calls.findIndex(c => c.op === 'camera' && c.on)
    expect(lastConnect).toBeLessThan(publish)
    expect(fake.calls[lastConnect]).toMatchObject({
      token: CAMERA_TOKEN_FIXTURE.token,
    })
    expect(getByLabelText('Turn camera off')).toBeTruthy()
  })

  it('end leaves the room, ends the session and goes back', async () => {
    const {getByTestId, fake} = await startScreen()
    await press(getByTestId('agentLiveEndButton'))
    expect(fake.calls[fake.calls.length - 1]).toEqual({op: 'disconnect'})
    expect(mockEnd).toHaveBeenCalledWith({sid: SESSION_FIXTURE.sid})
    expect(mockGoBack).toHaveBeenCalled()
  })

  it('leaving the screen ends the session', async () => {
    const {unmount} = await startScreen()
    unmount()
    await flush()
    expect(mockEnd).toHaveBeenCalledWith({sid: SESSION_FIXTURE.sid})
  })

  it('the injected room kept the SDK out of these tests too', () => {
    expect(mockSdkLoaded).not.toHaveBeenCalled()
  })
})
