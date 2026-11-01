import {beforeEach, describe, expect, it, jest} from '@jest/globals'
import {act, renderHook} from '@testing-library/react-native'

import {useAccountSwitcher} from '../useAccountSwitcher'

const mockResume = jest.fn<(...a: unknown[]) => Promise<void>>()
jest.mock('#/state/session', () => ({
  useSessionApi: () => ({resumeSession: mockResume}),
}))
jest.mock('#/state/shell/logged-out', () => ({
  useLoggedOutViewControls: () => ({requestSwitchToAccount: () => {}}),
}))
jest.mock('#/components/Toast', () => ({show: () => {}}))
jest.mock('#/analytics', () => ({useAnalytics: () => ({metric: () => {}})}))
jest.mock('#/logger', () => ({logger: {error: () => {}}}))
jest.mock('#/env', () => ({IS_WEB: false}))
jest.mock('@lingui/react', () => ({useLingui: () => ({_: (m: unknown) => m})}))
jest.mock('@lingui/core/macro', () => ({msg: (s: TemplateStringsArray) => s}))

const ACCOUNT = {
  did: 'did:plc:bob',
  handle: 'bob.test',
  service: 'https://bob.test',
  accessJwt: 'jwt',
} as never

beforeEach(() => {
  mockResume.mockReset().mockResolvedValue(undefined)
})

describe('account switch and Agent Live (ruling on review c23bdc031 F1)', () => {
  it('a switch a notification tap started keeps Live (keepLive)', async () => {
    const {result} = renderHook(() => useAccountSwitcher())
    await act(() =>
      result.current.onPressSwitchAccount(ACCOUNT, 'Notification'),
    )
    expect(mockResume).toHaveBeenCalledWith(ACCOUNT, true, {keepLive: true})
  })

  it('a switch from the switcher ends it, as sign-out does', async () => {
    const {result} = renderHook(() => useAccountSwitcher())
    await act(() =>
      result.current.onPressSwitchAccount(ACCOUNT, 'SwitchAccount'),
    )
    expect(mockResume).toHaveBeenCalledWith(ACCOUNT, true, {keepLive: false})
  })
})
