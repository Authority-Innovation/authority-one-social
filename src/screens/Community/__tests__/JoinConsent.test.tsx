import {beforeEach, describe, expect, it, jest} from '@jest/globals'
import {i18n} from '@lingui/core'
import {I18nProvider} from '@lingui/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {fireEvent, render, waitFor} from '@testing-library/react-native'

let mockCommunitiesEnabled = true
jest.mock('#/env', () => ({
  get COMMUNITIES_ENABLED() {
    return mockCommunitiesEnabled
  },
}))

const mockNavigate = jest.fn()
const mockGoBack = jest.fn()
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    canGoBack: () => true,
  }),
}))

const mockJoin = jest.fn<(...args: unknown[]) => Promise<unknown>>()
const mockSetAgentGrant = jest.fn<(...args: unknown[]) => Promise<unknown>>()
const mockGetJoinInfo = jest.fn<(...args: unknown[]) => Promise<unknown>>()
const mockGetCommunity = jest.fn<(...args: unknown[]) => Promise<unknown>>()
jest.mock('#/lib/agent-runtime/communitiesClient', () => ({
  join: (...args: unknown[]) => mockJoin(...args),
  setAgentGrant: (...args: unknown[]) => mockSetAgentGrant(...args),
  getJoinInfo: (...args: unknown[]) => mockGetJoinInfo(...args),
  // The door answers GET /:id not_found to a non-member: never called here.
  getCommunity: (...args: unknown[]) => mockGetCommunity(...args),
}))

let mockOwnerAgents: {displayName?: string; handle: string}[] = []
jest.mock('#/state/queries/agents', () => ({
  useOwnerAgentsQuery: () => ({
    data: {agents: mockOwnerAgents, signedOut: false},
  }),
}))

// The real #/alf barrel and the form components drag in native modules that
// cannot load under jest. The screen only needs their behaviour: pressable,
// disabled, and toggled state.
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

jest.mock('#/components/Layout', () => {
  const {Text, View} = require('react-native')
  const pass = ({
    children,
    testID,
  }: {
    children?: React.ReactNode
    testID?: string
  }) => <View testID={testID}>{children}</View>
  return {
    Screen: pass,
    Content: pass,
    Header: {
      Outer: pass,
      Content: pass,
      TitleText: ({children}: {children?: React.ReactNode}) => (
        <Text>{children}</Text>
      ),
      Slot: pass,
      BackButton: () => null,
    },
  }
})

jest.mock('#/components/Button', () => {
  const {Pressable, Text} = require('react-native')
  return {
    Button: ({
      children,
      onPress,
      disabled,
      testID,
    }: {
      children?: React.ReactNode
      onPress?: () => void
      disabled?: boolean
      testID?: string
    }) => (
      <Pressable
        accessibilityRole="button"
        testID={testID}
        accessibilityState={{disabled: !!disabled}}
        disabled={disabled}
        onPress={onPress}>
        {children}
      </Pressable>
    ),
    ButtonText: ({children}: {children?: React.ReactNode}) => (
      <Text>{children}</Text>
    ),
  }
})

jest.mock('#/components/forms/Toggle', () => {
  const {Pressable, Text, View} = require('react-native')
  return {
    Item: ({
      children,
      name,
      value,
      onChange,
    }: {
      children?: React.ReactNode
      name: string
      value: boolean
      onChange: (v: boolean) => void
    }) => (
      <Pressable
        accessibilityRole="button"
        testID={`toggle-${name}`}
        accessibilityState={{checked: value}}
        onPress={() => onChange(!value)}>
        {children}
      </Pressable>
    ),
    LabelText: ({children}: {children?: React.ReactNode}) => (
      <Text>{children}</Text>
    ),
    Checkbox: () => <View />,
    Platform: () => <View />,
  }
})

jest.mock('#/components/Link', () => {
  const {Text} = require('react-native')
  return {
    InlineLinkText: ({children}: {children?: React.ReactNode}) => (
      <Text>{children}</Text>
    ),
  }
})

jest.mock('#/components/Loader', () => ({Loader: () => null}))
jest.mock('#/components/icons/Check', () => ({
  Check_Stroke2_Corner0_Rounded: () => null,
}))
jest.mock('#/components/icons/Times', () => ({
  TimesLarge_Stroke2_Corner0_Rounded: () => null,
}))
jest.mock('#/components/icons/Lock', () => ({
  Lock_Stroke2_Corner0_Rounded: () => null,
}))

import {
  asClientCommunity,
  DEV_RUNTIME,
  DOOR,
  doorCommunity,
} from '#/lib/communities/__fixtures__/door'
import {applyCommunitiesFlag} from '#/screens/Community/linking'
import {router} from '#/routes'
import {agreeAndJoin, consentGateFor, consentVersionFor} from '../consent'
import {CommunityJoinScreen} from '../JoinConsent'

const CONSENT_BOX = 'toggle-community_join_consent'
const AGENT_TOGGLE = 'toggle-community_agent_grant'

i18n.loadAndActivate({locale: 'en', messages: {}})

// The Dev runtime's real join-info: wording version 1, the only version this
// build has copy for.
const JOIN_INFO = DEV_RUNTIME.joininfo
// door.json's community, as the join answers it (`{community, joined}`).
const JOINED = {community: asClientCommunity(doorCommunity()), joined: true}

function renderScreen(params: {id: string; invite?: string} = {id: 'btb'}) {
  const queryClient = new QueryClient({
    defaultOptions: {queries: {retry: false}},
  })
  const props = {
    route: {key: 'k', name: 'CommunityJoin', params},
    navigation: {},
  } as unknown as React.ComponentProps<typeof CommunityJoinScreen>
  return render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <CommunityJoinScreen {...props} />
      </QueryClientProvider>
    </I18nProvider>,
  )
}

function isChecked(el: {props: {accessibilityState?: {checked?: boolean}}}) {
  return el.props.accessibilityState?.checked === true
}

function isDisabled(el: {props: {accessibilityState?: {disabled?: boolean}}}) {
  return el.props.accessibilityState?.disabled === true
}

beforeEach(() => {
  mockCommunitiesEnabled = true
  mockOwnerAgents = [{displayName: 'Bob', handle: 'bob.example'}]
  mockNavigate.mockReset()
  mockGoBack.mockReset()
  mockJoin.mockReset()
  mockSetAgentGrant.mockReset()
  mockGetJoinInfo.mockReset()
  mockGetCommunity.mockReset()
  mockGetJoinInfo.mockResolvedValue({ok: true, data: JOIN_INFO})
  mockJoin.mockResolvedValue({ok: true, data: JOINED})
  mockSetAgentGrant.mockResolvedValue({
    ok: true,
    data: {communityId: 'btb', on: true},
  })
})

describe('CommunityJoinScreen', () => {
  it('reads only join-info, never the member-only community route', async () => {
    const r = renderScreen()
    await r.findByTestId('communityJoinAgreeButton')
    expect(mockGetJoinInfo).toHaveBeenCalledWith('btb')
    expect(mockGetCommunity).not.toHaveBeenCalled()
  })

  it('shows the mockup (d) copy from what join-info gives: the id and the wording version', async () => {
    const r = renderScreen()
    await r.findByText('Join community')
    r.getByTestId('communityJoinScreen')
    await r.findByText('btb')
    r.getByText('Members only')
    r.getByText(
      'Before you join: here is what membership shares, and with whom.',
    )
    r.getByText('Your name, handle and picture')
    r.getByText('Posts and replies you make here')
    r.getByText('Your posts in other communities')
    r.getByText('A public record that you joined')
    r.getByText('Let Bob read this community for me')
    // join-info names no agent, sponsor or rules, so none is shown.
    expect(r.queryByText('The community agent')).toBeNull()
    expect(r.queryByText(/terms and privacy/i)).toBeNull()
    r.getByText(
      'I’ve read what joining shares and I agree to the community rules.',
    )
    r.getByText('Consent version 1 · saved with your membership.')
    r.getByText('Agree and join')
    r.getByText('Not now')
  })

  it('keeps “Agree and join” disabled until the box is ticked', async () => {
    const r = renderScreen()
    const button = await r.findByTestId('communityJoinAgreeButton')
    expect(isDisabled(button)).toBe(true)

    fireEvent.press(r.getByTestId(CONSENT_BOX))
    expect(isDisabled(r.getByTestId('communityJoinAgreeButton'))).toBe(false)

    fireEvent.press(r.getByTestId(CONSENT_BOX))
    expect(isDisabled(r.getByTestId('communityJoinAgreeButton'))).toBe(true)
  })

  it('makes no join call before the box is ticked and the button pressed', async () => {
    const r = renderScreen()
    const button = await r.findByTestId('communityJoinAgreeButton')
    fireEvent.press(button)
    expect(mockJoin).not.toHaveBeenCalled()

    fireEvent.press(r.getByTestId(CONSENT_BOX))
    expect(mockJoin).not.toHaveBeenCalled()

    fireEvent.press(r.getByTestId('communityJoinAgreeButton'))
    await waitFor(() => expect(mockJoin).toHaveBeenCalled())
    expect(mockJoin).toHaveBeenCalledTimes(1)
  })

  it('joins with the wording version from join-info', async () => {
    const r = renderScreen()
    fireEvent.press(await r.findByTestId(CONSENT_BOX))
    fireEvent.press(r.getByTestId('communityJoinAgreeButton'))
    await waitFor(() => expect(mockJoin).toHaveBeenCalled())
    expect(mockJoin).toHaveBeenCalledWith('btb', 1)
    await r.findByText('You’re in.')
    // The join's own answer names the community.
    r.getByText(`Welcome to ${JOINED.community.name}.`)
    fireEvent.press(r.getByTestId('communityJoinGoButton'))
    expect(mockNavigate).toHaveBeenCalledWith('Community', {id: 'btb'})
  })

  it('fails closed on a consent version this build has no copy for', async () => {
    mockGetJoinInfo.mockResolvedValue({ok: true, data: {wording_version: 3}})
    const r = renderScreen()
    await r.findByText('This community needs a newer version of the app.')
    expect(r.queryByTestId(CONSENT_BOX)).toBeNull()
    expect(r.queryByTestId('communityJoinAgreeButton')).toBeNull()
    expect(r.queryByText(/Consent version/)).toBeNull()
    expect(r.queryByText('Agree and join')).toBeNull()
    fireEvent.press(r.getByTestId('communityJoinNotNowButton'))
    expect(mockGoBack).toHaveBeenCalled()
    expect(mockJoin).not.toHaveBeenCalled()
    expect(mockSetAgentGrant).not.toHaveBeenCalled()
  })

  it.each([
    // door.json's join-info: the platform names no wording version.
    ['null (door.json)', {ok: true, data: DOOR.joinInfo}],
    ['a failed join-info read', {ok: false, error: {kind: 'network'}}],
  ])('does not offer join for %s', async (_label, result) => {
    mockGetJoinInfo.mockResolvedValue(result)
    const r = renderScreen()
    await r.findByText('We couldn’t load this community. Please try again.')
    r.getByTestId('communityJoinLoadError')
    expect(r.queryByTestId(CONSENT_BOX)).toBeNull()
    expect(r.queryByTestId('communityJoinAgreeButton')).toBeNull()
    expect(mockJoin).not.toHaveBeenCalled()
  })

  it('does not set the agent grant when the toggle is left off', async () => {
    const r = renderScreen()
    fireEvent.press(await r.findByTestId(CONSENT_BOX))
    fireEvent.press(r.getByTestId('communityJoinAgreeButton'))
    await waitFor(() => expect(mockJoin).toHaveBeenCalled())
    await r.findByText('You’re in.')
    expect(mockJoin).toHaveBeenCalledTimes(1)
    expect(mockSetAgentGrant).not.toHaveBeenCalled()
  })

  it('sets the agent grant after joining when the toggle is on', async () => {
    const r = renderScreen()
    const toggle = await r.findByTestId(AGENT_TOGGLE)
    expect(isChecked(toggle)).toBe(false)
    fireEvent.press(toggle)
    fireEvent.press(r.getByTestId(CONSENT_BOX))
    fireEvent.press(r.getByTestId('communityJoinAgreeButton'))
    await waitFor(() => expect(mockJoin).toHaveBeenCalled())
    await r.findByText('You’re in.')
    expect(mockSetAgentGrant).toHaveBeenCalledWith('btb', true)
    expect(mockJoin.mock.invocationCallOrder[0]).toBeLessThan(
      mockSetAgentGrant.mock.invocationCallOrder[0],
    )
  })

  it('does not set the agent grant when the join fails', async () => {
    mockJoin.mockResolvedValue({ok: false, error: {kind: 'network'}})
    const r = renderScreen()
    fireEvent.press(await r.findByTestId(AGENT_TOGGLE))
    fireEvent.press(r.getByTestId(CONSENT_BOX))
    fireEvent.press(r.getByTestId('communityJoinAgreeButton'))
    await waitFor(() => expect(mockJoin).toHaveBeenCalled())
    await r.findByText('Couldn’t join right now. Please try again.')
    expect(mockSetAgentGrant).not.toHaveBeenCalled()
  })

  it('hides the agent toggle when the person has no agent', async () => {
    mockOwnerAgents = []
    const r = renderScreen()
    await r.findByTestId('communityJoinAgreeButton')
    expect(r.queryByTestId(AGENT_TOGGLE)).toBeNull()
  })

  it('does not call join when opened from an invite link', async () => {
    const r = renderScreen({id: 'btb', invite: 'abc123'})
    const button = await r.findByTestId('communityJoinAgreeButton')
    expect(isDisabled(button)).toBe(true)
    await waitFor(() => expect(mockGetJoinInfo).toHaveBeenCalled())
    expect(mockJoin).not.toHaveBeenCalled()
    expect(mockSetAgentGrant).not.toHaveBeenCalled()
    expect(isChecked(r.getByTestId(CONSENT_BOX))).toBe(false)
  })

  it('is unreachable with the flag off: renders nothing and goes Home', async () => {
    mockCommunitiesEnabled = false
    const r = renderScreen()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Home'))
    expect(r.queryByTestId('communityJoinScreen')).toBeNull()
    expect(mockGetJoinInfo).not.toHaveBeenCalled()
    expect(mockJoin).not.toHaveBeenCalled()
  })

  it('“Not now” leaves without joining', async () => {
    const r = renderScreen()
    fireEvent.press(await r.findByTestId('communityJoinNotNowButton'))
    expect(mockGoBack).toHaveBeenCalled()
    expect(mockJoin).not.toHaveBeenCalled()
  })
})

describe('CommunityJoin route', () => {
  it('resolves /c/:id/join and builds back', () => {
    expect(router.matchPath('/c/abc/join')).toEqual([
      'CommunityJoin',
      {id: 'abc'},
    ])
    expect(router.matchName('CommunityJoin')?.build({id: 'abc'})).toBe(
      '/c/abc/join',
    )
  })

  it('carries an invite as a plain param, nothing more', () => {
    expect(router.matchPath('/c/abc/join?invite=xyz')).toEqual([
      'CommunityJoin',
      {id: 'abc', invite: 'xyz'},
    ])
  })

  it('lands on Home with the flag off', () => {
    expect(
      applyCommunitiesFlag(router.matchPath('/c/abc/join'), false),
    ).toEqual(['Home', {}])
    expect(
      applyCommunitiesFlag(router.matchPath('/c/abc/join?invite=x'), false),
    ).toEqual(['Home', {}])
    expect(applyCommunitiesFlag(router.matchPath('/c/abc/join'), true)).toEqual(
      ['CommunityJoin', {id: 'abc'}],
    )
  })
})

describe('agreeAndJoin', () => {
  const client = {
    join: mockJoin as never,
    setAgentGrant: mockSetAgentGrant as never,
  }

  it('never calls join without consent', async () => {
    const out = await agreeAndJoin(
      {id: 'btb', consentVersion: '1', consented: false, agentGrant: true},
      client,
    )
    expect(out).toEqual({ok: false, reason: 'no_consent'})
    expect(mockJoin).not.toHaveBeenCalled()
    expect(mockSetAgentGrant).not.toHaveBeenCalled()
  })

  it('never calls join with a version this build has no copy for', async () => {
    const out = await agreeAndJoin(
      {id: 'btb', consentVersion: '3', consented: true, agentGrant: true},
      client,
    )
    expect(out).toEqual({ok: false, reason: 'unsupported_version'})
    expect(mockJoin).not.toHaveBeenCalled()
    expect(mockSetAgentGrant).not.toHaveBeenCalled()
  })

  it('keeps the membership when only the grant fails', async () => {
    mockSetAgentGrant.mockResolvedValue({ok: false, error: {kind: 'network'}})
    const out = await agreeAndJoin(
      {id: 'btb', consentVersion: '1', consented: true, agentGrant: true},
      client,
    )
    expect(out).toMatchObject({ok: true, agentGrantFailed: true})
  })
})

describe('consentVersionFor', () => {
  it('uses join-info’s wording_version and never falls back to 1', () => {
    expect(consentVersionFor(DEV_RUNTIME.joininfo)).toBe('1')
    expect(consentVersionFor({wording_version: 2})).toBe('2')
    expect(consentVersionFor(DOOR.joinInfo)).toBeNull()
    expect(consentVersionFor({wording_version: NaN})).toBeNull()
    expect(consentVersionFor(undefined)).toBeNull()
  })
})

describe('consentGateFor', () => {
  it('is joinable only for a version this build has copy for', () => {
    expect(consentGateFor({wording_version: 1})).toEqual({
      kind: 'ok',
      version: '1',
    })
    expect(consentGateFor({wording_version: 3})).toEqual({
      kind: 'unsupported',
      version: '3',
    })
  })

  it('is not joinable for a null or absent version', () => {
    expect(consentGateFor({wording_version: null})).toEqual({kind: 'missing'})
    expect(consentGateFor(undefined)).toEqual({kind: 'missing'})
  })
})
