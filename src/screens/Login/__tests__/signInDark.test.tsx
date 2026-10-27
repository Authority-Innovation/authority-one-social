// React Compiler would inject a memo cache into the inline mock components,
// which jest.mock factories may not reference.
'use no memo'

import {Keyboard} from 'react-native'
import {beforeEach, describe, expect, it, jest} from '@jest/globals'
import {render} from '@testing-library/react-native'

// Communities W1-T4: with no EXPO_PUBLIC_AO_SIGNATURE_* set, the sign-in
// screen must render exactly what it rendered before Signature P2b was merged.
// The snapshot was generated at the pre-merge build line (569b3b240) and must
// not change while Signature is dark.
//
// Everything AROUND the screen is stubbed (forms, layout, data hooks) so the
// snapshot captures the screen's own tree. `#/features/aoSignature` is NOT
// mocked: its real dark behavior is what is under test. The UI modules its
// armed components import are stubbed because they drag in native modules
// jest cannot load; while dark it returns null before touching them.

jest.mock('#/alf', () => {
  const styleProxy: Record<string, object> = new Proxy({}, {get: () => ({})})
  return {
    atoms: styleProxy,
    native: () => undefined,
    useTheme: () => ({
      atoms: styleProxy,
      palette: new Proxy({}, {get: () => '#000000'}),
    }),
  }
})
jest.mock('react-native-reanimated', () => {
  const {View} = require('react-native')
  return {
    __esModule: true,
    default: {View},
    FadeIn: {duration: () => ({})},
    LayoutAnimationConfig: ({children}: {children: React.ReactNode}) =>
      children,
  }
})
jest.mock('@lingui/react', () => ({
  useLingui: () => ({
    _: (m: {message?: string; id?: string}) => m.message ?? m.id,
  }),
}))
jest.mock('#/logger', () => ({logger: {warn: jest.fn()}}))
jest.mock('#/analytics', () => ({useAnalytics: () => ({metric: jest.fn()})}))
jest.mock('#/state/queries/service', () => ({
  useServiceQuery: () => ({data: undefined, error: null, refetch: jest.fn()}),
}))
const mockAccounts: {did: string; handle: string; service: string}[] = []
jest.mock('#/state/session', () => ({
  useSession: () => ({accounts: mockAccounts}),
  useAgent: () => {
    throw new Error('must not be reached while dark')
  },
}))
jest.mock('#/state/shell/logged-out', () => ({
  useLoggedOutView: () => ({requestedAccountSwitchTo: undefined}),
}))
jest.mock('#/view/com/util/layouts/LoggedOutLayout', () => {
  const {View, Text} = require('react-native')
  return {
    LoggedOutLayout: ({
      title,
      description,
      children,
    }: {
      title: string
      description: string
      children: React.ReactNode
    }) => (
      <View testID="loggedOutLayout">
        <Text>{title}</Text>
        <Text>{description}</Text>
        {children}
      </View>
    ),
  }
})
jest.mock('#/components/ScreenTransition', () => {
  const {View} = require('react-native')
  return {
    ScreenTransition: ({children}: {children: React.ReactNode}) => (
      <View testID="screenTransition">{children}</View>
    ),
  }
})
jest.mock('../components/AuthLayout', () => {
  const {View} = require('react-native')
  const Stub = () => <View />
  return {
    Header: {
      Outer: ({children}: {children: React.ReactNode}) => (
        <View testID="authHeader">{children}</View>
      ),
      BackButton: Stub,
      Content: Stub,
      Slot: Stub,
    },
  }
})
function mockForm(name: string) {
  const {View} = require('react-native')
  return function MockForm() {
    return <View testID={name} />
  }
}
jest.mock('#/screens/Login/LoginForm', () => ({
  LoginForm: mockForm('loginForm'),
}))
jest.mock('#/screens/Login/ForgotPasswordForm', () => ({
  ForgotPasswordForm: mockForm('forgotPasswordForm'),
}))
jest.mock('#/screens/Login/SetNewPasswordForm', () => ({
  SetNewPasswordForm: mockForm('setNewPasswordForm'),
}))
jest.mock('#/screens/Login/PasswordUpdatedForm', () => ({
  PasswordUpdatedForm: mockForm('passwordUpdatedForm'),
}))
jest.mock('../ChooseAccountForm', () => ({
  ChooseAccountForm: mockForm('chooseAccountForm'),
}))
jest.mock('#/components/Button', () => ({}))
jest.mock('#/components/forms/FormError', () => ({}))
jest.mock('#/components/forms/TextField', () => ({}))
jest.mock('#/components/Loader', () => ({}))
jest.mock('#/components/Typography', () => ({}))
jest.mock('#/components/Prompt', () => ({}))
jest.mock('#/view/com/auth/LoggedOut', () => ({}))
// Virtual: the pre-merge base does not depend on these native modules.
jest.mock('expo-secure-store', () => ({}), {virtual: true})
jest.mock('expo-crypto', () => ({}), {virtual: true})

import {Login} from '../index'

describe('sign-in screen with Signature config unset', () => {
  beforeEach(() => {
    // The jest Keyboard mock returns no subscription, which breaks
    // KeyboardAvoidingView's unmount.
    jest
      .spyOn(Keyboard, 'addListener')
      .mockReturnValue({remove: () => {}} as ReturnType<
        typeof Keyboard.addListener
      >)
  })

  it('renders the pre-merge tree on the Login form', () => {
    mockAccounts.length = 0
    const tree = render(<Login onPressBack={() => {}} />).toJSON()
    expect(tree).toMatchSnapshot()
  })

  it('renders the pre-merge tree on the ChooseAccount form', () => {
    mockAccounts.length = 0
    mockAccounts.push({
      did: 'did:example:alice',
      handle: 'alice.test',
      service: 'https://pds.example',
    })
    const tree = render(<Login onPressBack={() => {}} />).toJSON()
    expect(tree).toMatchSnapshot()
  })
})
