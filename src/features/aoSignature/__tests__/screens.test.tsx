import {beforeEach, describe, expect, it, jest} from '@jest/globals'
import {act, fireEvent, render, screen} from '@testing-library/react-native'

// Review edcf058f8 H1: committed render tests for Community's terms screen and
// the one-time "Connect your Community account" screen. The UI kit is stubbed
// with host elements that keep the props these rules live in (a toggle's
// value, a button's disabled state, a field's text), so the screens' own
// state and handlers are what is under test.
jest.mock('#/alf', () => ({
  atoms: new Proxy({}, {get: () => ({})}),
  useTheme: () => ({atoms: new Proxy({}, {get: () => ({})})}),
}))
jest.mock('#/components/Button', () => {
  const {Pressable} = require('react-native')
  return {
    Button: ({
      testID,
      label,
      disabled,
      onPress,
    }: {
      testID?: string
      label: string
      disabled?: boolean
      onPress: () => void
    }) => (
      <Pressable
        accessibilityRole="button"
        testID={testID ?? `button:${label}`}
        accessibilityState={{disabled: !!disabled}}
        disabled={!!disabled}
        onPress={onPress}
        // the raw handler, so a test can call it past `disabled`
        rawOnPress={onPress}
      />
    ),
    ButtonText: () => null,
  }
})
jest.mock('#/components/forms/Toggle', () => {
  const {Pressable} = require('react-native')
  return {
    Item: ({
      name,
      value,
      onChange,
    }: {
      name: string
      value: boolean
      onChange: (v: boolean) => void
    }) => (
      <Pressable
        accessibilityRole="checkbox"
        testID={`toggle:${name}`}
        accessibilityState={{checked: value}}
        onPress={() => onChange(!value)}
      />
    ),
    Checkbox: () => null,
    LabelText: () => null,
  }
})
jest.mock('#/components/forms/TextField', () => {
  const {TextInput} = require('react-native')
  return {
    Root: ({children}: {children: unknown}) => children,
    Input: ({
      testID,
      value,
      onChangeText,
    }: {
      testID: string
      value: string
      onChangeText: (v: string) => void
    }) => (
      <TextInput
        accessibilityRole="text"
        testID={testID}
        value={value}
        onChangeText={onChangeText}
      />
    ),
  }
})
jest.mock('#/components/forms/FormError', () => ({FormError: () => null}))
jest.mock('#/components/Loader', () => ({Loader: () => null}))
jest.mock('#/components/Typography', () => ({Text: () => null}))
jest.mock('@lingui/react', () => ({
  useLingui: () => ({
    _: (d: {message?: string}) => d.message ?? '',
    i18n: {_: () => ''},
  }),
}))
jest.mock('@lingui/react/macro', () => ({Trans: () => null}))
jest.mock('#/lib/constants', () => ({DEFAULT_SERVICE: 'https://pds.test'}))

const mockClient = {
  enrollment: jest.fn<(t: string) => Promise<unknown>>(),
  enroll: jest.fn<(t: string, b: unknown) => Promise<void>>(),
}
const mockBroker = {get: jest.fn<(r: unknown) => Promise<unknown>>()}
jest.mock('../controller', () => ({
  aoClient: () => mockClient,
  aoPdsBroker: () => mockBroker,
}))
const mockAdopt = jest.fn<(sid: string) => Promise<void>>()
const mockNoteEnrollment = jest.fn<(token: string) => void>()
jest.mock('../session', () => ({
  adoptEnrollment: (sid: string) => mockAdopt(sid),
  noteAOEnrollmentRequired: (token: string) => mockNoteEnrollment(token),
}))
const mockConnect = jest.fn<(args: unknown) => Promise<void>>()
jest.mock('../pdsBroker', () => ({
  ...jest.requireActual<object>('../pdsBroker'),
  connectCommunityAccount: (args: unknown) => mockConnect(args),
}))

import {AOConnectCommunity} from '../components/ConnectCommunity'
import {AOEnrollment} from '../components/Enrollment'
import {AOSignatureError} from '../errors'
import {type AORecord} from '../store'
import {type AOEnrollmentAsk} from '../wire'

const ASK: AOEnrollmentAsk = {
  app: 'community',
  termsUrl: 'https://authority-one.com/terms',
  privacyUrl: 'https://authority-one.com/privacy',
  termsVersion: '2026-11-03',
  privacyVersion: '2026-11-03',
  consents: [{name: 'marketing', version: '2026-11-03'}],
}
const NEWER: AOEnrollmentAsk = {
  ...ASK,
  termsVersion: '2026-12-01',
  privacyVersion: '2026-12-01',
}
const RECORD: AORecord = {
  v: 1,
  token: 'aos1.tok',
  sid: 'sid-1',
  did: 'did:plc:x',
  handle: null,
  expiresAt: '2099-01-01T00:00:00.000Z',
  primary: 'agent',
  needsAgent: false,
  refreshedAt: 0,
  reverify: false,
  enrolled: true,
}

type StubProps = {
  accessibilityState: {checked?: boolean; disabled?: boolean}
  rawOnPress: () => void
  value?: string
}
const props = (id: string) =>
  (screen.getByTestId(id) as unknown as {props: StubProps}).props
const checked = (name: string) =>
  props(`toggle:${name}`).accessibilityState.checked
const continueDisabled = () =>
  props('aoEnrollmentAccept').accessibilityState.disabled
const flush = () => act(async () => {})

beforeEach(() => {
  jest.clearAllMocks()
  mockAdopt.mockResolvedValue()
})

describe("Community's terms screen", () => {
  it('every box starts UNTICKED and Continue is disabled', async () => {
    mockClient.enrollment.mockResolvedValue({enrolled: false, ask: ASK})
    render(<AOEnrollment token="aos1.tok" sid="sid-1" />)
    await flush()
    expect([
      checked('terms'),
      checked('privacy'),
      checked('marketing'),
    ]).toEqual([false, false, false])
    expect(continueDisabled()).toBe(true)
  })

  it('one tick is not enough; both enable Continue, which enrolls exactly once with the shown versions and marketing unticked', async () => {
    mockClient.enrollment.mockResolvedValue({enrolled: false, ask: ASK})
    mockClient.enroll.mockResolvedValue()
    render(<AOEnrollment token="aos1.tok" sid="sid-1" />)
    await flush()
    fireEvent.press(screen.getByTestId('toggle:terms'))
    expect(continueDisabled()).toBe(true)
    fireEvent.press(screen.getByTestId('aoEnrollmentAccept'))
    await flush()
    expect(mockClient.enroll).not.toHaveBeenCalled()
    fireEvent.press(screen.getByTestId('toggle:privacy'))
    expect(continueDisabled()).toBe(false)
    fireEvent.press(screen.getByTestId('aoEnrollmentAccept'))
    await flush()
    expect(mockClient.enroll).toHaveBeenCalledTimes(1)
    expect(mockClient.enroll).toHaveBeenCalledWith('aos1.tok', {
      ask: ASK,
      consents: {},
    })
    expect(mockAdopt).toHaveBeenCalledWith('sid-1')
  })

  it('the press handler itself refuses without both ticks (not only the disabled state)', async () => {
    mockClient.enrollment.mockResolvedValue({enrolled: false, ask: ASK})
    render(<AOEnrollment token="aos1.tok" sid="sid-1" />)
    await flush()
    fireEvent.press(screen.getByTestId('toggle:terms'))
    // Call the button's handler directly, bypassing `disabled`.
    act(() => {
      props('aoEnrollmentAccept').rawOnPress()
    })
    await flush()
    expect(mockClient.enroll).not.toHaveBeenCalled()
  })

  it('review M2: a stale accept reloads the NEWER terms with EVERY box unticked, marketing included', async () => {
    mockClient.enrollment
      .mockResolvedValueOnce({enrolled: false, ask: ASK})
      .mockResolvedValueOnce({enrolled: false, ask: NEWER})
    mockClient.enroll.mockRejectedValue(
      new AOSignatureError('refused', 409, 'terms-version-stale'),
    )
    render(<AOEnrollment token="aos1.tok" sid="sid-1" />)
    await flush()
    fireEvent.press(screen.getByTestId('toggle:terms'))
    fireEvent.press(screen.getByTestId('toggle:privacy'))
    fireEvent.press(screen.getByTestId('toggle:marketing'))
    fireEvent.press(screen.getByTestId('aoEnrollmentAccept'))
    await flush()
    expect(mockClient.enrollment).toHaveBeenCalledTimes(2)
    expect([
      checked('terms'),
      checked('privacy'),
      checked('marketing'),
    ]).toEqual([false, false, false])
    expect(continueDisabled()).toBe(true)
    expect(mockAdopt).not.toHaveBeenCalled()
  })

  it('already enrolled: adopts, shows no boxes', async () => {
    mockClient.enrollment.mockResolvedValue({enrolled: true, ask: ASK})
    render(<AOEnrollment token="aos1.tok" sid="sid-1" />)
    await flush()
    expect(mockAdopt).toHaveBeenCalledWith('sid-1')
    expect(screen.queryByTestId('toggle:terms')).toBeNull()
  })
})

describe('Connect your Community account', () => {
  const needsConnect = new AOSignatureError(
    'refused',
    409,
    'pds-credential-unavailable',
  )

  it('never self-mints on mount: it only asks for a PDS session, and shows the form on 409', async () => {
    mockBroker.get.mockRejectedValue(needsConnect)
    render(<AOConnectCommunity record={RECORD} />)
    await flush()
    expect(mockBroker.get).toHaveBeenCalledTimes(1)
    expect(mockConnect).not.toHaveBeenCalled()
    expect(screen.getByTestId('aoConnectCommunity')).toBeTruthy()
  })

  it('self-mint runs only on press, only with a handle AND a password, and the password is cleared after', async () => {
    mockBroker.get.mockRejectedValue(needsConnect)
    mockConnect.mockRejectedValue(new AOSignatureError('refused', 401, 'x'))
    render(<AOConnectCommunity record={RECORD} />)
    await flush()
    const connect = () => props('button:Connect')
    expect(connect().accessibilityState.disabled).toBe(true)
    fireEvent.changeText(screen.getByTestId('aoConnectIdentifier'), 'me.test')
    act(() => {
      connect().rawOnPress()
    })
    await flush()
    expect(mockConnect).not.toHaveBeenCalled()
    fireEvent.changeText(screen.getByTestId('aoConnectPassword'), 'pw')
    expect(connect().accessibilityState.disabled).toBe(false)
    fireEvent.press(screen.getByTestId('button:Connect'))
    await flush()
    expect(mockConnect).toHaveBeenCalledTimes(1)
    expect(mockConnect.mock.calls[0][0]).toMatchObject({
      record: RECORD,
      identifier: 'me.test',
      password: 'pw',
    })
    expect(props('aoConnectPassword').value).toBe('')
  })

  it("review M1: a 403 enrollment-required sends the person back to Community's terms (this session's token)", async () => {
    mockBroker.get.mockRejectedValue(
      new AOSignatureError('refused', 403, 'enrollment-required'),
    )
    render(<AOConnectCommunity record={RECORD} />)
    await flush()
    expect(mockNoteEnrollment).toHaveBeenCalledWith('aos1.tok')
    expect(mockConnect).not.toHaveBeenCalled()
  })

  it('review M1: so does an enrollment-required answer to the connect itself', async () => {
    mockBroker.get.mockRejectedValue(needsConnect)
    mockConnect.mockRejectedValue(
      new AOSignatureError('refused', 403, 'enrollment-required'),
    )
    render(<AOConnectCommunity record={RECORD} />)
    await flush()
    expect(mockNoteEnrollment).not.toHaveBeenCalled()
    fireEvent.changeText(screen.getByTestId('aoConnectIdentifier'), 'me.test')
    fireEvent.changeText(screen.getByTestId('aoConnectPassword'), 'pw')
    fireEvent.press(screen.getByTestId('button:Connect'))
    await flush()
    expect(mockNoteEnrollment).toHaveBeenCalledWith('aos1.tok')
  })
})
