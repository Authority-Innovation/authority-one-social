/**
 * Screen tests for Agent Live, over the real session controller and api
 * module answering with the runtime's recorded replies (live.json):
 * - flag off (and Android): no Go live button, no session, no LiveKit SDK;
 * - flag on: nothing starts on arrival; Continue → the consent sheet (per
 *   kind, all off, AI processing required) → Go live → the stage, with mic,
 *   blind and camera controls; the recording indicator when the session
 *   records; reuse asks first; drops and failures show what happened; End
 *   ends the runtime session and goes back.
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
const mockToastShow = jest.fn()
jest.mock('#/components/Toast', () => ({
  show: (...args: unknown[]) => mockToastShow(...args),
}))
jest.mock('#/components/forms/Toggle', () => {
  const {Pressable, Text} = require('react-native')
  return {
    Item: ({
      children,
      name,
      label,
      value,
      onChange,
      disabled,
    }: {
      children: React.ReactNode
      name: string
      label: string
      value: boolean
      onChange: (v: boolean) => void
      disabled?: boolean
    }) => (
      <Pressable
        testID={`agentLiveConsent-${name}`}
        accessibilityLabel={label}
        accessibilityHint=""
        accessibilityState={{checked: value, disabled: !!disabled}}
        disabled={disabled}
        onPress={() => onChange(!value)}>
        {children}
      </Pressable>
    ),
    LabelText: ({children}: {children: React.ReactNode}) => (
      <Text>{children}</Text>
    ),
    Platform: () => null,
  }
})
const mockEnv = {android: false}
jest.mock('#/env', () => ({
  get IS_ANDROID() {
    return mockEnv.android
  },
}))
jest.mock('#/lib/agent-runtime/authToken', () => ({
  getAgentRuntimeAccessToken: jest.fn(() =>
    Promise.resolve('opaque-owner-session-bearer'),
  ),
}))
jest.mock('#/lib/agent-runtime/config', () => ({
  AGENT_RUNTIME_BASE_URL: 'https://runtime.test',
}))
jest.mock('#/state/persisted', () => ({
  get: jest.fn(() => ({
    currentAccount: {did: 'did:plc:tatenantowner0000000001'},
  })),
}))
jest.mock('#/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))
jest.mock('#/features/agentLive/deviceKey', () => ({getDeviceKey: jest.fn()}))
const mockHeld = {here: true}
jest.mock('#/features/agentLive/heldSessions', () => ({
  wasHeldHere: () => Promise.resolve(mockHeld.here),
  markHeldHere: () => Promise.resolve(),
}))
jest.mock('#/features/agentLive/permissions', () => ({
  requestMicAccess: jest.fn(),
  requestCameraAccess: jest.fn(),
}))

const mockNavigate = jest.fn()
const mockNav: {
  canGoBack: boolean
  prevent: boolean
  onPrevented: (type?: string) => void
  listeners: Record<string, () => void>
  gesture: boolean[]
} = {
  canGoBack: true,
  prevent: false,
  onPrevented: () => {},
  listeners: {},
  gesture: [],
}
const mockNavObject = {
  navigate: (...args: unknown[]) => mockNavigate(...args),
  goBack: () => mockGoBack(),
  dispatch: (a: unknown) => mockDispatch(a),
  canGoBack: () => mockNav.canGoBack,
  setOptions: (o: {gestureEnabled?: boolean}) => {
    if (o.gestureEnabled !== undefined) mockNav.gesture.push(o.gestureEnabled)
  },
  addListener: (event: string, handler: () => void) => {
    mockNav.listeners[event] = handler
    return () => {
      delete mockNav.listeners[event]
    }
  },
}
const mockShell = {
  minimal: jest.fn(),
  drawerSwipeDisabled: [] as boolean[],
  // Stable, like the real context value: a lock pushes true, its release false.
  lock: () => {
    mockShell.drawerSwipeDisabled.push(true)
    return () => {
      mockShell.drawerSwipeDisabled.push(false)
    }
  },
}
jest.mock('#/state/shell', () => ({
  useEnableMinimalShellModeForScreen: () => mockShell.minimal(),
  useLockDrawerSwipe: () => mockShell.lock,
}))
const mockGoBack = jest.fn()
const mockDispatch = jest.fn()
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavObject,
  // Runs like an effect: the screen is focused while mounted in these tests.
  useFocusEffect: (cb: () => void | (() => void)) =>
    jest
      .requireActual<{
        useEffect: (f: () => void | (() => void), deps: unknown[]) => void
      }>('react')
      .useEffect(cb, [cb]),
  // The latest usePreventRemove call, so a test can swipe back.
  usePreventRemove: (
    prevent: boolean,
    cb: (e: {data: {action: {type: string}}}) => void,
  ) => {
    mockNav.prevent = prevent
    // The owner going back by default; a test can pass another action type.
    mockNav.onPrevented = (type = 'GO_BACK') => cb({data: {action: {type}}})
  },
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

// Evaluating either SDK module calls this. Flag off must never do so.
const mockSdkLoaded = jest.fn()
jest.mock('@livekit/react-native', () => {
  mockSdkLoaded('@livekit/react-native')
  return {}
})
jest.mock('livekit-client', () => {
  mockSdkLoaded('livekit-client')
  return {}
})

import {createFakeRoom} from '#/features/agentLive/__fixtures__/fakeRoom'
import LEGACY from '#/features/agentLive/__fixtures__/legacy-ac11bd0.json'
import {createRuntimeFetch} from '#/features/agentLive/__fixtures__/runtimeFetch'
import {
  AGENT_DID,
  AGENT_HANDLE,
  DEVICE_SEED,
  OWNER_DID,
  reply,
  tokenOf,
} from '#/features/agentLive/__fixtures__/runtimeLive'
import {getDeviceKey} from '#/features/agentLive/deviceKey'
import {GoLiveButton} from '#/features/agentLive/GoLiveButton'
import {
  requestCameraAccess,
  requestMicAccess,
} from '#/features/agentLive/permissions'
import {deviceKeyFromSeed} from '#/features/agentLive/pop'
import {
  endOpenLiveSessions,
  forgetLiveSessionsForTests,
} from '#/features/agentLive/registry'
import {loadLiveRoomFactory} from '#/features/agentLive/room'
import {AgentLiveScreen} from '../index'

i18n.loadAndActivate({locale: 'en', messages: {}})

const mockLoad = loadLiveRoomFactory as jest.Mock<typeof loadLiveRoomFactory>
const mockKey = getDeviceKey as jest.Mock<typeof getDeviceKey>
const mockMic = requestMicAccess as jest.Mock<typeof requestMicAccess>
const mockCam = requestCameraAccess as jest.Mock<typeof requestCameraAccess>

const OWNED: Agent = {handle: AGENT_HANDLE, did: AGENT_DID, displayName: 'Bob'}
let rt: ReturnType<typeof createRuntimeFetch>

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
    for (let i = 0; i < 30; i++) await Promise.resolve()
  })
}

async function press(el: Parameters<typeof fireEvent.press>[0]) {
  act(() => {
    fireEvent.press(el)
  })
  await flush()
}

beforeEach(() => {
  // Sessions a test's screen left running stay registered for sign-out.
  forgetLiveSessionsForTests()
  mockFlag.on = false
  mockEnv.android = false
  mockOwned.agent = OWNED
  mockOwned.loading = false
  mockNav.canGoBack = true
  mockNav.listeners = {}
  mockNav.gesture = []
  mockShell.minimal.mockReset()
  mockShell.drawerSwipeDisabled.length = 0
  mockNavigate.mockReset()
  mockGoBack.mockReset()
  mockToastShow.mockReset()
  mockLoad.mockReset()
  mockKey.mockReset().mockResolvedValue(deviceKeyFromSeed(DEVICE_SEED))
  mockHeld.here = true
  mockMic.mockReset().mockResolvedValue('granted')
  mockCam.mockReset().mockResolvedValue('granted')
  rt = createRuntimeFetch()
  ;(globalThis as {fetch: unknown}).fetch = rt.fetch
  // The clock of the runtime's recorded tokens (60 s join tokens).
  jest
    .spyOn(Date, 'now')
    .mockReturnValue(
      ((reply('consentAdmitted').body.expiresAt as number) - 30) * 1000,
    )
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
    expect(rt.sent).toEqual([])
  })

  it('no LiveKit SDK module was evaluated', () => {
    expect(mockSdkLoaded).not.toHaveBeenCalled()
  })
})

describe('Android (no microphone foreground service yet)', () => {
  beforeEach(() => {
    mockFlag.on = true
    mockEnv.android = true
  })

  it('no Go live button, and the screen is off', async () => {
    expect(render(<GoLiveButton agent={OWNED} />).toJSON()).toBeNull()
    const {getByTestId} = screen()
    await flush()
    expect(getByTestId('agentLiveOff')).toBeTruthy()
    expect(mockLoad).not.toHaveBeenCalled()
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

  async function open() {
    const fake = createFakeRoom()
    mockLoad.mockResolvedValue(() => fake.room)
    const r = screen()
    await flush()
    return {...r, fake}
  }

  async function toSheet(start = 'startAwaitingConsent') {
    const r = await open()
    rt.on('/live/sessions', start)
    await press(r.getByTestId('agentLiveBeginButton'))
    return r
  }

  async function goLive(start?: {status: number; body: unknown}) {
    const fake = createFakeRoom()
    mockLoad.mockResolvedValue(() => fake.room)
    const r = screen()
    await flush()
    rt.on('/live/sessions', start ?? 'startAwaitingConsent')
    await press(r.getByTestId('agentLiveBeginButton'))
    rt.on('/live/sessions/:sid/consent', 'consentAdmitted')
    rt.on('/live/join/prove', 'proveExchange')
    await press(r.getByTestId('agentLiveConsent-ai_process'))
    await press(r.getByTestId('agentLiveConsentSubmit'))
    return {...r, fake}
  }

  it('an agent the person does not own: no session', async () => {
    mockOwned.agent = undefined
    const {getByTestId} = screen()
    await flush()
    expect(getByTestId('agentLiveNotOwned')).toBeTruthy()
    expect(mockLoad).not.toHaveBeenCalled()
    expect(rt.sent).toEqual([])
  })

  it('arriving (a deep link too) starts nothing: no request, no mic', async () => {
    const {getByTestId, fake} = await open()
    expect(getByTestId('agentLiveIntro')).toBeTruthy()
    expect(getByTestId('agentLiveAiLabel')).toBeTruthy()
    expect(rt.sent).toEqual([])
    expect(mockMic).not.toHaveBeenCalled()
    expect(fake.calls).toEqual([])
  })

  it('Continue asks for the mic, starts with {agentDid}, and shows the sheet with every kind off', async () => {
    const {getByTestId, fake} = await toSheet()
    expect(mockMic).toHaveBeenCalled()
    expect(rt.sent.map(s => s.path)).toEqual(['/live/sessions'])
    expect(rt.sent[0].body!.agentDid).toBe(AGENT_DID)
    expect(getByTestId('agentLiveConsentSheet')).toBeTruthy()
    for (const kind of reply('startAwaitingConsent').body
      .consentRequired as string[]) {
      expect(getByTestId(`agentLiveConsent-${kind}`)).toHaveProp(
        'accessibilityState',
        expect.objectContaining({checked: false}),
      )
    }
    // Go live needs AI processing.
    expect(getByTestId('agentLiveConsentSubmit')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({disabled: true}),
    )
    expect(getByTestId('agentLiveConsentNeedsAi')).toBeTruthy()
    expect(fake.calls).toEqual([])
  })

  it('mic access refused: no session, and a way to Settings', async () => {
    mockMic.mockResolvedValue('denied')
    const {getByTestId} = await open()
    await press(getByTestId('agentLiveBeginButton'))
    expect(rt.sent).toEqual([])
    expect(getByTestId('agentLiveFailed')).toBeTruthy()
    expect(getByTestId('agentLiveOpenSettingsButton')).toBeTruthy()
  })

  it('Go live sends the owner’s own decisions, then joins and turns the mic on', async () => {
    const {getByTestId, fake} = await goLive()
    expect(rt.to('/live/sessions/:sid/consent')[0].body!.decisions).toEqual({
      record_audio: 'refused',
      record_video: 'refused',
      transcribe: 'refused',
      ai_process: 'given',
      remember: 'refused',
    })
    // R2 v2: the proven token is exchanged; the returned one joins.
    expect(fake.connects()[0].token).toBe(tokenOf('proveExchange'))
    expect(fake.calls[fake.calls.length - 1]).toEqual({op: 'mic', on: true})
    expect(getByTestId('agentLiveMicIndicator')).toBeTruthy()
  })

  it('cancelling the sheet ends the session and goes back; nothing was published', async () => {
    const {getByTestId, fake} = await toSheet()
    rt.on('/live/sessions/:sid/end', 'end')
    await press(getByTestId('agentLiveConsentCancel'))
    expect(rt.to('/live/sessions/:sid/end')).toHaveLength(1)
    expect(fake.calls).toEqual([])
    expect(mockGoBack).toHaveBeenCalled()
  })

  it('a reused session asks before continuing; “not now” leaves it running', async () => {
    const {getByTestId} = await toSheet('startReused')
    expect(getByTestId('agentLiveReuse')).toBeTruthy()
    await press(getByTestId('agentLiveNotNowButton'))
    expect(rt.to('/live/sessions/:sid/end')).toEqual([])
    expect(mockGoBack).toHaveBeenCalled()
  })

  it('renders the stage full screen, with mic and blind controls', async () => {
    const {getByTestId, fake} = await goLive()
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
    await flush()
    expect(
      within(getByTestId('agentLiveStage')).getByTestId('fakeStageVideo'),
    ).toBeTruthy()
    expect(getByTestId('agentLiveMicButton')).toBeTruthy()
    expect(getByTestId('agentLiveBlindButton')).toBeTruthy()
    expect(getByTestId('agentLiveAiLabel')).toBeTruthy()
  })

  it('no recording indicator on an unrecorded session; one throughout a recorded one', async () => {
    const plain = await goLive()
    expect(plain.queryByTestId('agentLiveRecordingIndicator')).toBeNull()
    plain.unmount()

    const recorded = await goLive({
      status: 200,
      body: {...reply('startAwaitingConsent').body, recordPolicy: 'record'},
    })
    expect(recorded.getByTestId('agentLiveRecordingIndicator')).toBeTruthy()
  })

  it('the sheet warns when the session records', async () => {
    const r = await open()
    rt.on('/live/sessions', {
      status: 200,
      body: {...reply('startAwaitingConsent').body, recordPolicy: 'record'},
    })
    await press(r.getByTestId('agentLiveBeginButton'))
    expect(r.getByTestId('agentLiveConsentRecordingNote')).toBeTruthy()
  })

  it('mic toggles off and the indicator goes', async () => {
    const {getByTestId, queryByTestId, fake} = await goLive()
    await press(getByTestId('agentLiveMicButton'))
    expect(fake.calls[fake.calls.length - 1]).toEqual({op: 'mic', on: false})
    expect(queryByTestId('agentLiveMicIndicator')).toBeNull()
  })

  it('the blind control sends the ruling 2 message', async () => {
    const {getByTestId, getByLabelText, fake} = await goLive()
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
    const {getByTestId, getByLabelText, fake} = await goLive()
    expect(getByLabelText('Turn camera on')).toBeTruthy()
    expect(fake.cameraPublishes()).toBe(0)
    expect(rt.to('/live/sessions/:sid/token')).toEqual([])

    rt.on('/live/sessions/:sid/token', 'tokenCamera')
    rt.on('/live/join/prove', 'proveExchange')
    await press(getByTestId('agentLiveCameraButton'))
    expect(rt.to('/live/sessions/:sid/token')[0].body!.camera).toBe(true)
    expect(fake.cameraPublishes()).toBe(1)
    const lastConnect = fake.calls.map(c => c.op).lastIndexOf('connect')
    const publish = fake.calls.findIndex(c => c.op === 'camera' && c.on)
    expect(lastConnect).toBeLessThan(publish)
    expect(fake.calls[lastConnect]).toMatchObject({
      token: tokenOf('proveExchange'),
    })
    expect(getByLabelText('Turn camera off')).toBeTruthy()
  })

  it('no agent stage 45 s after going live: the stage says so (30f293f4 G1)', async () => {
    const real = global.setTimeout
    let wait: (() => void) | undefined
    const spy = jest.spyOn(global, 'setTimeout').mockImplementation(((
      cb: () => void,
      ms?: number,
    ) => {
      if (ms === 45_000) {
        wait = cb
        return 0
      }
      return real(cb, ms)
    }) as typeof setTimeout)
    try {
      const {getByTestId, getByText} = await goLive()
      expect(wait).toBeDefined()
      act(() => wait!())
      expect(getByTestId('agentLiveNotice')).toBeTruthy()
      expect(
        getByText(
          'Your agent hasn’t joined yet. Keep waiting, or end and try again later.',
        ),
      ).toBeTruthy()
    } finally {
      spy.mockRestore()
    }
  })

  it('camera access refused: a notice on the stage, still live', async () => {
    mockCam.mockResolvedValue('denied')
    const {getByTestId, fake} = await goLive()
    await press(getByTestId('agentLiveCameraButton'))
    expect(getByTestId('agentLiveNotice')).toBeTruthy()
    expect(fake.cameraPublishes()).toBe(0)
    expect(getByTestId('agentLiveScreen')).toBeTruthy()
  })

  it.each<['removed' | 'room_deleted' | 'duplicate_identity', string]>([
    ['removed', 'You were removed from the live session.'],
    ['room_deleted', 'The live session has ended.'],
    ['duplicate_identity', 'This live session moved to another device.'],
  ])('a %s drop shows what happened, not “Mic on”', async (reason, text) => {
    const {getByTestId, queryByTestId, fake} = await goLive()
    act(() => fake.drop(reason))
    await flush()
    expect(queryByTestId('agentLiveMicIndicator')).toBeNull()
    expect(getByTestId('agentLiveEnded')).toBeTruthy()
    expect(getByTestId('agentLiveFinishedMessage')).toHaveTextContent(text)
  })

  it('F12: End with /end failing: never “ended” while ending or after it gave up', async () => {
    jest.useFakeTimers({doNotFake: ['Date']})
    try {
      const {getByTestId} = await goLive()
      const e503 = {status: 503, body: {error: 'unavailable'}}
      rt.on('/live/sessions/:sid/end', e503, e503, e503, e503)
      await press(getByTestId('agentLiveEndButton'))
      expect(getByTestId('agentLiveFinishedMessage')).toHaveTextContent(
        'Ending the live session.',
      )
      for (const ms of [1000, 3000, 7000]) {
        act(() => {
          jest.advanceTimersByTime(ms)
        })
        await flush()
      }
      expect(getByTestId('agentLiveEndFailed')).toBeTruthy()
      expect(getByTestId('agentLiveFinishedMessage')).toHaveTextContent(
        'The live session may not have ended.',
      )
    } finally {
      jest.useRealTimers()
    }
  })

  it('F12: a reconnect that gave up while /end fails says “Couldn’t reconnect.”, not “has ended”', async () => {
    const {getByTestId, fake} = await goLive()
    jest.useFakeTimers({doNotFake: ['Date']})
    try {
      const e503 = {status: 503, body: {error: 'unavailable'}}
      rt.on('/live/sessions/:sid/token', e503, e503, e503, e503, e503)
      rt.on('/live/sessions/:sid/end', e503, e503, e503, e503)
      act(() => fake.drop('network'))
      await flush()
      for (const ms of [1000, 2000, 4000, 8000, 16000, 1000, 3000, 7000]) {
        act(() => {
          jest.advanceTimersByTime(ms)
        })
        await flush()
      }
      expect(getByTestId('agentLiveEndFailed')).toBeTruthy()
      expect(getByTestId('agentLiveFinishedMessage')).toHaveTextContent(
        'Couldn’t reconnect.',
      )
    } finally {
      jest.useRealTimers()
    }
  })

  it('a drop it can’t recover from: “Reconnecting”, then “reconnect failed” after the backoff', async () => {
    const {getByTestId, queryByTestId, fake} = await goLive()
    jest.useFakeTimers({doNotFake: ['Date']})
    try {
      const e503 = {status: 503, body: {error: 'unavailable'}}
      rt.on('/live/sessions/:sid/token', e503, e503, e503, e503, e503)
      rt.on('/live/sessions/:sid/end', 'end')
      act(() => fake.drop('network'))
      await flush()
      expect(getByTestId('agentLiveReconnecting')).toBeTruthy()
      expect(queryByTestId('agentLiveMicIndicator')).toBeNull()
      for (const ms of [1000, 2000, 4000, 8000, 16000]) {
        act(() => {
          jest.advanceTimersByTime(ms)
        })
        await flush()
      }
      expect(getByTestId('agentLiveFailed')).toBeTruthy()
      expect(getByTestId('agentLiveFinishedMessage')).toHaveTextContent(
        'Couldn’t reconnect, so the live session has ended.',
      )
      expect(rt.to('/live/sessions/:sid/token')).toHaveLength(5)
    } finally {
      jest.useRealTimers()
    }
  })

  it('m2: every rejoin proof refused: “Couldn’t reconnect… wasn’t ended”, no /end', async () => {
    const {getByTestId, fake} = await goLive()
    jest.useFakeTimers({doNotFake: ['Date']})
    try {
      const bad = {status: 401, body: {error: 'bad_proof'}}
      for (let i = 0; i < 5; i++) {
        rt.on('/live/sessions/:sid/token', 'tokenForJoin')
        rt.on('/live/join/prove', bad)
      }
      rt.on('/live/sessions/:sid/end', 'end')
      act(() => fake.drop('network'))
      await flush()
      for (const ms of [1000, 2000, 4000, 8000, 16000]) {
        act(() => {
          jest.advanceTimersByTime(ms)
        })
        await flush()
      }
      expect(getByTestId('agentLiveFinishedMessage')).toHaveTextContent(
        'Couldn’t reconnect: this device’s joins were refused, so it stopped here. The live session wasn’t ended: open Live again to end it, or it ends on its own at its time limit.',
      )
      expect(rt.to('/live/sessions/:sid/end')).toEqual([])
    } finally {
      jest.useRealTimers()
    }
  })

  it('reconnecting shows on the stage and the controls are off', async () => {
    const {getByTestId, queryByTestId, fake} = await goLive()
    act(() => fake.emit({type: 'reconnecting'}))
    await flush()
    expect(getByTestId('agentLiveReconnecting')).toBeTruthy()
    expect(queryByTestId('agentLiveMicIndicator')).toBeNull()
    expect(getByTestId('agentLiveMicButton')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({disabled: true}),
    )
  })

  it('End ends the runtime session (stopping the agent), leaves the room and goes back', async () => {
    const {getByTestId, fake} = await goLive()
    rt.on('/live/sessions/:sid/end', 'end')
    await press(getByTestId('agentLiveEndButton'))
    expect(rt.to('/live/sessions/:sid/end')).toHaveLength(1)
    expect(fake.calls[fake.calls.length - 1].op).toBe('disconnect')
    expect(mockGoBack).toHaveBeenCalled()
  })

  it('H2: End stays on “Ending…” until /end answers, then goes back', async () => {
    const {getByTestId, queryByTestId} = await goLive()
    let release!: () => void
    const gate = new Promise<void>(r => (release = r))
    const real = rt.fetch
    ;(globalThis as {fetch: unknown}).fetch = async (
      u: string,
      i: RequestInit,
    ) => {
      if (new URL(u).pathname.endsWith('/end')) await gate
      return real(u, i)
    }
    rt.on('/live/sessions/:sid/end', 'end')
    await press(getByTestId('agentLiveEndButton'))
    expect(getByTestId('agentLiveEnding')).toBeTruthy()
    expect(mockGoBack).not.toHaveBeenCalled()
    release()
    await flush()
    expect(queryByTestId('agentLiveEnding')).toBeNull()
    expect(mockGoBack).toHaveBeenCalledTimes(1)
  })

  it('H2: a failed /end stays on screen with Try again and Leave anyway', async () => {
    jest.useFakeTimers({doNotFake: ['Date']})
    try {
      const {getByTestId} = await goLive()
      const e503 = {status: 503, body: {error: 'unavailable'}}
      rt.on('/live/sessions/:sid/end', e503, e503, e503, e503)
      await press(getByTestId('agentLiveEndButton'))
      for (const ms of [1000, 3000, 7000]) {
        act(() => {
          jest.advanceTimersByTime(ms)
        })
        await flush()
      }
      expect(getByTestId('agentLiveEndFailed')).toBeTruthy()
      expect(mockGoBack).not.toHaveBeenCalled()
      rt.on('/live/sessions/:sid/end', 'end')
      await press(getByTestId('agentLiveRetryEndButton'))
      expect(rt.to('/live/sessions/:sid/end')).toHaveLength(5)
      expect(mockGoBack).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })

  it('H2: Leave anyway leaves while the end has failed', async () => {
    jest.useFakeTimers({doNotFake: ['Date']})
    try {
      const {getByTestId} = await goLive()
      const e503 = {status: 503, body: {error: 'unavailable'}}
      rt.on('/live/sessions/:sid/end', e503, e503, e503, e503)
      await press(getByTestId('agentLiveEndButton'))
      for (const ms of [1000, 3000, 7000]) {
        act(() => {
          jest.advanceTimersByTime(ms)
        })
        await flush()
      }
      expect(getByTestId('agentLiveDoneButton')).toHaveProp(
        'accessibilityLabel',
        'Leave anyway',
      )
      await press(getByTestId('agentLiveDoneButton'))
      expect(mockGoBack).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })

  it('d8f8f16e H2: a /end that hangs offers Leave anyway after 8 s; leaving keeps the end going and a give-up is a toast', async () => {
    jest.useFakeTimers({doNotFake: ['Date']})
    try {
      const {getByTestId, queryByTestId, unmount} = await goLive()
      // The server accepts /end and never answers.
      const real = rt.fetch
      ;(globalThis as {fetch: unknown}).fetch = (u: string, i: RequestInit) =>
        new URL(u).pathname.endsWith('/end')
          ? new Promise<Response>(() => {})
          : real(u, i)
      await press(getByTestId('agentLiveEndButton'))
      expect(getByTestId('agentLiveEnding')).toBeTruthy()
      expect(queryByTestId('agentLiveLeaveAnywayButton')).toBeNull()
      act(() => {
        jest.advanceTimersByTime(8000)
      })
      await flush()
      expect(getByTestId('agentLiveEndSlow')).toBeTruthy()
      expect(mockNav.prevent).toBe(true)
      await press(getByTestId('agentLiveLeaveAnywayButton'))
      expect(mockGoBack).toHaveBeenCalledTimes(1)
      expect(mockNav.prevent).toBe(false)
      expect(mockNav.gesture[mockNav.gesture.length - 1]).toBe(true)
      // Each try times out at 10 s; after the last, the owner is told.
      expect(mockToastShow).not.toHaveBeenCalled()
      for (const ms of [2000, 1000, 10000, 3000, 10000, 7000, 10000]) {
        act(() => {
          jest.advanceTimersByTime(ms)
        })
        await flush()
      }
      expect(mockToastShow).toHaveBeenCalledTimes(1)
      unmount()
      await flush()
      expect(mockToastShow).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })

  it('d8f8f16e H1: End, then a push over Live: a /end that gives up is a toast, once', async () => {
    jest.useFakeTimers({doNotFake: ['Date']})
    try {
      const {getByTestId, unmount} = await goLive()
      const e503 = {status: 503, body: {error: 'unavailable'}}
      rt.on('/live/sessions/:sid/end', e503, e503, e503, e503)
      await press(getByTestId('agentLiveEndButton'))
      act(() => {
        mockNav.listeners.blur?.()
      })
      await flush()
      for (const ms of [1000, 3000, 7000]) {
        act(() => {
          jest.advanceTimersByTime(ms)
        })
        await flush()
      }
      expect(rt.to('/live/sessions/:sid/end')).toHaveLength(4)
      expect(mockToastShow).toHaveBeenCalledTimes(1)
      // Unmounting later doesn't report it again.
      unmount()
      await flush()
      expect(mockToastShow).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })

  it('d8f8f16e H1: back in front, a give-up is the panel again, not a toast', async () => {
    jest.useFakeTimers({doNotFake: ['Date']})
    try {
      const {getByTestId} = await goLive()
      const e503 = {status: 503, body: {error: 'unavailable'}}
      rt.on('/live/sessions/:sid/end', e503, e503, e503, e503)
      await press(getByTestId('agentLiveEndButton'))
      act(() => {
        mockNav.listeners.blur?.()
        mockNav.listeners.focus?.()
      })
      await flush()
      for (const ms of [1000, 3000, 7000]) {
        act(() => {
          jest.advanceTimersByTime(ms)
        })
        await flush()
      }
      expect(getByTestId('agentLiveEndFailed')).toBeTruthy()
      expect(mockToastShow).not.toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })

  it('N2: an agent that couldn’t start says so; nothing joins', async () => {
    const fake = createFakeRoom()
    mockLoad.mockResolvedValue(() => fake.room)
    const r = screen()
    await flush()
    rt.on('/live/sessions', 'startAwaitingConsent')
    await press(r.getByTestId('agentLiveBeginButton'))
    rt.on('/live/sessions/:sid/consent', 'consentAgentUnavailable')
    rt.on('/live/sessions/:sid/end', 'end')
    await press(r.getByTestId('agentLiveConsent-ai_process'))
    await press(r.getByTestId('agentLiveConsentSubmit'))
    expect(r.getByTestId('agentLiveFinishedMessage')).toHaveTextContent(
      'Your agent couldn’t start. Try again later.',
    )
    expect(fake.connects()).toEqual([])
  })

  it('ruling: the server says it is open and this device held it: “Still open on your other device”, Take over here, End', async () => {
    const {getByTestId} = await toSheet('startReused')
    expect(getByTestId('agentLiveReuseTitle')).toHaveTextContent(
      'Still open on your other device',
    )
    expect(getByTestId('agentLiveContinueHereButton')).toHaveProp(
      'accessibilityLabel',
      'Take the live session over here',
    )
    expect(getByTestId('agentLiveEndOpenButton')).toBeTruthy()
  })

  it('ruling (563477989 R1): bound, but another device holds it: “Still open on your other device”, no Take over, no /end', async () => {
    mockHeld.here = false
    const {getByTestId, queryByTestId} = await toSheet('startReused')
    expect(getByTestId('agentLiveReuseTitle')).toHaveTextContent(
      'Still open on your other device',
    )
    expect(queryByTestId('agentLiveContinueHereButton')).toBeNull()
    await press(getByTestId('agentLiveNotNowButton'))
    expect(rt.to('/live/sessions/:sid/end')).toEqual([])
    expect(mockGoBack).toHaveBeenCalled()
  })

  it('n6: End is on the bound non-holder panel too', async () => {
    mockHeld.here = false
    const {getByTestId} = await toSheet('startReused')
    expect(getByTestId('agentLiveEndOpenButton')).toBeTruthy()
  })

  it('P3: pushed over the open-session panel: it stays, nothing ends', async () => {
    const {getByTestId} = await toSheet('startReused')
    act(() => {
      mockNav.listeners.blur?.()
    })
    await flush()
    expect(getByTestId('agentLiveReuse')).toBeTruthy()
    expect(rt.to('/live/sessions/:sid/end')).toEqual([])
  })

  it('m3: leaving the open-session panel by unmount leaves it running and owes no /end to sign-out', async () => {
    mockHeld.here = false
    const {unmount} = await toSheet('startReused')
    unmount()
    await flush()
    endOpenLiveSessions()
    await flush()
    expect(rt.to('/live/sessions/:sid/end')).toEqual([])
  })

  it('ruling (563477989 R2): unbound, it can’t continue: “Couldn’t reconnect”, no Take over', async () => {
    mockKey.mockReset().mockResolvedValue(null)
    const {getByTestId, queryByTestId} = await toSheet('startReused')
    expect(getByTestId('agentLiveReuseTitle')).toHaveTextContent(
      'Couldn’t reconnect',
    )
    expect(queryByTestId('agentLiveContinueHereButton')).toBeNull()
  })

  it('ruling on 7f87024af: a refused proof on a new session says it was refused and not ended (no /end)', async () => {
    const fake = createFakeRoom()
    mockLoad.mockResolvedValue(() => fake.room)
    const r = screen()
    await flush()
    rt.on('/live/sessions', 'startAwaitingConsent')
    await press(r.getByTestId('agentLiveBeginButton'))
    rt.on('/live/sessions/:sid/consent', 'consentAdmitted')
    rt.on('/live/join/prove', {status: 404, body: {error: 'not found'}})
    await press(r.getByTestId('agentLiveConsent-ai_process'))
    await press(r.getByTestId('agentLiveConsentSubmit'))
    await flush()
    expect(r.getByTestId('agentLiveFinishedMessage')).toHaveTextContent(
      'The live session was refused here, so it stopped on this device. It wasn’t ended: open Live again to end it, or it ends on its own at its time limit.',
    )
    expect(rt.to('/live/sessions/:sid/end')).toEqual([])
  })

  it('N6: a takeover that fails says the session is still open and was not ended', async () => {
    const {getByTestId} = await toSheet('startReused')
    await press(getByTestId('agentLiveContinueHereButton'))
    rt.on('/live/sessions/:sid/consent', 'consentAdmitted')
    rt.on('/live/join/prove', {status: 401, body: {error: 'bad_proof'}})
    await press(getByTestId('agentLiveConsent-ai_process'))
    await press(getByTestId('agentLiveConsentSubmit'))
    await flush()
    expect(getByTestId('agentLiveFinishedMessage')).toHaveTextContent(
      'Couldn’t take the live session over: it’s still open on your other device, and it wasn’t ended. End it there, or open Live again to end it.',
    )
    expect(rt.to('/live/sessions/:sid/end')).toEqual([])
  })

  it('R3f: End on the open-session panel ends it for every device, then leaves', async () => {
    mockKey.mockReset().mockResolvedValue(null)
    const {getByTestId} = await toSheet('startReused')
    rt.on('/live/sessions/:sid/end', 'end')
    await press(getByTestId('agentLiveEndOpenButton'))
    await flush()
    expect(rt.to('/live/sessions/:sid/end')).toHaveLength(1)
    expect(mockGoBack).toHaveBeenCalledTimes(1)
  })

  it('K3: back in front of a Live left under another route, Done works again', async () => {
    mockNav.canGoBack = false
    const {getByTestId} = await goLive()
    rt.on('/live/sessions/:sid/end', 'end')
    await press(getByTestId('agentLiveEndButton'))
    expect(mockNavigate).toHaveBeenCalledTimes(1)
    act(() => {
      mockNav.listeners.focus?.()
    })
    await press(getByTestId('agentLiveDoneButton'))
    expect(mockNavigate).toHaveBeenCalledTimes(2)
  })

  it('J9: an old server shows the “needs a server update” copy', async () => {
    const fake = createFakeRoom()
    mockLoad.mockResolvedValue(() => fake.room)
    const r = screen()
    await flush()
    rt.on('/live/sessions', 'startAwaitingConsent')
    await press(r.getByTestId('agentLiveBeginButton'))
    rt.on('/live/sessions/:sid/consent', 'consentAdmitted')
    rt.on('/live/join/prove', LEGACY.proveOk)
    rt.on('/live/sessions/:sid/end', 'end')
    await press(r.getByTestId('agentLiveConsent-ai_process'))
    await press(r.getByTestId('agentLiveConsentSubmit'))
    await flush()
    expect(r.getByTestId('agentLiveFinishedMessage')).toHaveTextContent(
      'Live needs a server update that isn’t available yet, so Live stopped on this device. Try again after the update.',
    )
  })

  it('c23bdc031 F1 (ruling): a notification that pops the stack while live is refused: Live stays and keeps running, no /end', async () => {
    mockDispatch.mockClear()
    const {getByTestId, fake} = await goLive()
    rt.on('/live/sessions/:sid/end', 'end')
    act(() => {
      mockNav.onPrevented('POP_TO_TOP')
    })
    await flush()
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(mockNav.prevent).toBe(true)
    expect(getByTestId('agentLiveScreen')).toBeTruthy()
    expect(fake.calls.map(c => c.op)).not.toContain('disconnect')
    expect(rt.to('/live/sessions/:sid/end')).toEqual([])
  })

  it('c23bdc031 F1: once ending, a programmatic pop goes through (nothing left to keep)', async () => {
    mockDispatch.mockClear()
    const {getByTestId} = await goLive()
    let release!: () => void
    const gate = new Promise<void>(r => (release = r))
    const real = rt.fetch
    ;(globalThis as {fetch: unknown}).fetch = async (
      u: string,
      i: RequestInit,
    ) => {
      if (new URL(u).pathname.endsWith('/end')) await gate
      return real(u, i)
    }
    rt.on('/live/sessions/:sid/end', 'end')
    await press(getByTestId('agentLiveEndButton'))
    act(() => {
      mockNav.onPrevented('POP_TO_TOP')
    })
    await flush()
    expect(mockDispatch).toHaveBeenCalledWith({type: 'POP_TO_TOP'})
    release()
    await flush()
  })

  it('c23bdc031 F1: the owner’s header back (POP) is still End', async () => {
    const {getByTestId} = await goLive()
    rt.on('/live/sessions/:sid/end', 'end')
    act(() => {
      mockNav.onPrevented('POP')
    })
    await flush()
    expect(rt.to('/live/sessions/:sid/end')).toHaveLength(1)
    expect(getByTestId).toBeTruthy()
  })

  it('F2: a drop we didn’t ask for says the connection closed and the session wasn’t ended', async () => {
    const {getByTestId, fake} = await goLive()
    act(() => fake.drop('client'))
    await flush()
    expect(getByTestId('agentLiveFinishedMessage')).toHaveTextContent(
      'The connection to the live session closed.',
    )
    expect(getByTestId('agentLiveLeftRunning')).toHaveTextContent(
      'The live session wasn’t ended: open Live again to end it, or it ends on its own at its time limit.',
    )
    expect(rt.to('/live/sessions/:sid/end')).toEqual([])
  })

  it('F1: a swipe-back while live is prevented and becomes End (waits for /end, then goes back)', async () => {
    await goLive()
    expect(mockNav.prevent).toBe(true)
    rt.on('/live/sessions/:sid/end', 'end')
    act(() => {
      mockNav.onPrevented()
    })
    await flush()
    expect(rt.to('/live/sessions/:sid/end')).toHaveLength(1)
    expect(mockGoBack).toHaveBeenCalledTimes(1)
  })

  it('F1: removal is not prevented before a session or after it ended', async () => {
    const {getByTestId} = await open()
    expect(getByTestId('agentLiveIntro')).toBeTruthy()
    expect(mockNav.prevent).toBe(false)
  })

  it('F1: no Done while “Ending…” shows', async () => {
    const {getByTestId, queryByTestId} = await goLive()
    let release!: () => void
    const gate = new Promise<void>(r => (release = r))
    const real = rt.fetch
    ;(globalThis as {fetch: unknown}).fetch = async (
      u: string,
      i: RequestInit,
    ) => {
      if (new URL(u).pathname.endsWith('/end')) await gate
      return real(u, i)
    }
    rt.on('/live/sessions/:sid/end', 'end')
    await press(getByTestId('agentLiveEndButton'))
    expect(getByTestId('agentLiveEnding')).toBeTruthy()
    expect(queryByTestId('agentLiveDoneButton')).toBeNull()
    expect(mockNav.prevent).toBe(true)
    release()
    await flush()
    expect(mockGoBack).toHaveBeenCalledTimes(1)
  })

  it('F1: Cancel while the session is starting ends it, then goes back', async () => {
    const {getByTestId} = await open()
    let release!: () => void
    const gate = new Promise<void>(r => (release = r))
    const real = rt.fetch
    ;(globalThis as {fetch: unknown}).fetch = async (
      u: string,
      i: RequestInit,
    ) => {
      if (new URL(u).pathname === '/live/sessions') await gate
      return real(u, i)
    }
    rt.on('/live/sessions', 'startAwaitingConsent')
    rt.on('/live/sessions/:sid/end', 'end')
    await press(getByTestId('agentLiveBeginButton'))
    await press(getByTestId('agentLiveCancelButton'))
    // F18: nothing has ended yet, so it says "stopping", with no Done.
    expect(getByTestId('agentLiveFinishedMessage')).toHaveTextContent(
      'Stopping the live session.',
    )
    expect(() => getByTestId('agentLiveDoneButton')).toThrow()
    expect(mockGoBack).not.toHaveBeenCalled()
    release()
    await flush()
    expect(rt.to('/live/sessions/:sid/end')).toHaveLength(1)
    expect(mockGoBack).toHaveBeenCalledTimes(1)
  })

  it('P3: the screen unmounts: the session is kept; sign-out ends it, and a give-up then is a toast, once', async () => {
    jest.useFakeTimers({doNotFake: ['Date']})
    try {
      const {unmount, fake} = await goLive()
      unmount()
      await act(async () => {
        for (let i = 0; i < 30; i++) await Promise.resolve()
      })
      // Left the room (no mic with no screen), but no /end.
      expect(fake.calls.map(c => c.op)).toContain('disconnect')
      expect(rt.to('/live/sessions/:sid/end')).toEqual([])
      const e503 = {status: 503, body: {error: 'unavailable'}}
      rt.on('/live/sessions/:sid/end', e503, e503, e503, e503)
      endOpenLiveSessions()
      for (const ms of [0, 1000, 3000, 7000]) {
        await act(async () => {
          jest.advanceTimersByTime(ms)
          for (let i = 0; i < 30; i++) await Promise.resolve()
        })
      }
      expect(rt.to('/live/sessions/:sid/end')).toHaveLength(4)
      expect(mockToastShow).toHaveBeenCalledTimes(1)
      expect(mockToastShow.mock.calls[0][0]).toMatch(/may still be live/)
    } finally {
      jest.useRealTimers()
    }
  })

  it('F1: Leave anyway after a failed /end shows no second warning', async () => {
    jest.useFakeTimers({doNotFake: ['Date']})
    try {
      const {getByTestId, unmount} = await goLive()
      const e503 = {status: 503, body: {error: 'unavailable'}}
      rt.on('/live/sessions/:sid/end', e503, e503, e503, e503)
      await press(getByTestId('agentLiveEndButton'))
      for (const ms of [1000, 3000, 7000]) {
        act(() => {
          jest.advanceTimersByTime(ms)
        })
        await flush()
      }
      expect(getByTestId('agentLiveEndFailed')).toBeTruthy()
      expect(mockNav.prevent).toBe(false)
      await press(getByTestId('agentLiveDoneButton'))
      unmount()
      expect(mockToastShow).not.toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })

  it('F1: the back swipe is off while a session is open or ending, on again after', async () => {
    const r = await open()
    expect(mockNav.gesture[mockNav.gesture.length - 1]).toBe(true)
    rt.on('/live/sessions', 'startAwaitingConsent')
    await press(r.getByTestId('agentLiveBeginButton'))
    expect(mockNav.gesture[mockNav.gesture.length - 1]).toBe(false)
    let release!: () => void
    const gate = new Promise<void>(res => (release = res))
    const real = rt.fetch
    ;(globalThis as {fetch: unknown}).fetch = async (
      u: string,
      i: RequestInit,
    ) => {
      if (new URL(u).pathname.endsWith('/end')) await gate
      return real(u, i)
    }
    rt.on('/live/sessions/:sid/end', 'end')
    mockNav.canGoBack = false
    await press(r.getByTestId('agentLiveConsentCancel'))
    expect(r.getByTestId('agentLiveEnding')).toBeTruthy()
    expect(mockNav.gesture[mockNav.gesture.length - 1]).toBe(false)
    release()
    await flush()
    expect(mockNav.gesture[mockNav.gesture.length - 1]).toBe(true)
  })

  it('F1: Live is immersive - minimal shell, drawer swipe off while focused, back on when it goes', async () => {
    const {unmount} = await goLive()
    expect(mockShell.minimal).toHaveBeenCalled()
    expect(mockShell.drawerSwipeDisabled[0]).toBe(true)
    rt.on('/live/sessions/:sid/end', 'end')
    unmount()
    await flush()
    expect(
      mockShell.drawerSwipeDisabled[mockShell.drawerSwipeDisabled.length - 1],
    ).toBe(false)
  })

  it('H4: the back swipe is on again when the screen goes, even mid-session', async () => {
    const {unmount} = await goLive()
    expect(mockNav.gesture[mockNav.gesture.length - 1]).toBe(false)
    rt.on('/live/sessions/:sid/end', 'end')
    unmount()
    expect(mockNav.gesture[mockNav.gesture.length - 1]).toBe(true)
  })

  it('P3: something pushed over a live session (blur) does NOT end it: Live keeps running behind', async () => {
    const {getByTestId, fake} = await goLive()
    act(() => {
      mockNav.listeners.blur?.()
    })
    await flush()
    expect(rt.to('/live/sessions/:sid/end')).toEqual([])
    expect(getByTestId('agentLiveScreen')).toBeTruthy()
    expect(fake.calls.map(c => c.op)).not.toContain('disconnect')
    expect(mockGoBack).not.toHaveBeenCalled()
  })

  it('F1: a blur before any session starts nothing', async () => {
    await open()
    act(() => {
      mockNav.listeners.blur?.()
    })
    expect(rt.sent).toEqual([])
  })

  it('End with nothing to go back to opens the agent’s hub', async () => {
    mockNav.canGoBack = false
    const {getByTestId} = await goLive()
    rt.on('/live/sessions/:sid/end', 'end')
    await press(getByTestId('agentLiveEndButton'))
    expect(mockNavigate).toHaveBeenCalledWith('AgentHub', {agent: AGENT_HANDLE})
  })

  it('P3: an unmount leaves the room but sends no /end; sign-out then ends it, with this account’s bearer', async () => {
    const {unmount} = await goLive()
    rt.on('/live/sessions/:sid/end', 'end')
    unmount()
    await flush()
    expect(rt.to('/live/sessions/:sid/end')).toEqual([])
    endOpenLiveSessions()
    await flush()
    const end = rt.to('/live/sessions/:sid/end')
    expect(end).toHaveLength(1)
    expect(end[0].headers.Authorization).toBe(
      'Bearer opaque-owner-session-bearer',
    )
    expect(JSON.stringify(end[0])).not.toContain(OWNER_DID)
  })

  it('the injected room kept the SDK out of these tests too', () => {
    expect(mockSdkLoaded).not.toHaveBeenCalled()
  })
})
