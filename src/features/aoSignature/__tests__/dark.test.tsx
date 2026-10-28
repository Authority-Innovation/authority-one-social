import {beforeEach, describe, expect, it, jest} from '@jest/globals'
import {render, renderHook} from '@testing-library/react-native'

// With EXPO_PUBLIC_AO_SIGNATURE_* unset (this test env), the lane is DARK:
// nothing renders, nothing calls the runtime, the native modules are never
// even required, and the runtime bearer stays the PDS token.
const mockRequired: string[] = []
jest.mock('expo-secure-store', () => {
  mockRequired.push('expo-secure-store')
  return {}
})
jest.mock('expo-crypto', () => {
  mockRequired.push('expo-crypto')
  return {}
})
jest.mock('#/state/persisted', () => ({
  ...jest.requireActual<object>('#/state/persisted'),
  get: jest.fn(() => ({
    currentAccount: {did: 'did:plc:pds', accessJwt: 'PDS_JWT'},
  })),
}))
// UI modules the (unrendered) armed components import: stubbed, because the
// real #/alf barrel drags in native modules jest cannot load. While dark the
// components return null before touching any of them.
jest.mock('#/alf', () => ({atoms: {}, useTheme: () => ({atoms: {}})}))
jest.mock('#/components/Button', () => ({}))
jest.mock('#/components/forms/FormError', () => ({}))
jest.mock('#/components/forms/TextField', () => ({}))
jest.mock('#/components/Loader', () => ({}))
jest.mock('#/components/Typography', () => ({}))
jest.mock('#/components/Prompt', () => ({}))
jest.mock('#/view/com/auth/LoggedOut', () => ({}))
jest.mock('#/state/session', () => ({
  useAgent: () => {
    throw new Error('must not be reached while dark')
  },
  useSession: () => {
    throw new Error('must not be reached while dark')
  },
}))

import {getAgentRuntimeAccessToken} from '#/lib/agent-runtime/authToken'
import {AO_SIGNATURE_CONFIG} from '../config'
import {
  aoClient,
  aoSignatureOnPdsLogout,
  captureAOSignatureWebCallback,
} from '../controller'
import {useAOSignatureGate, useAOSignatureState} from '../hooks'
import {
  AOSignatureAccountSection,
  AOSignatureLifecycle,
  AOSignatureSignInButton,
} from '../index'
import {aoRuntimeBearer, getAOState, loadAOSession, setAORecord} from '../store'

const mockFetch = jest.fn()
// @ts-expect-error test shim
global.fetch = mockFetch

describe('Signature lane with config UNSET', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('has no config and no client', () => {
    expect(AO_SIGNATURE_CONFIG).toBeNull()
    expect(aoClient()).toBeNull()
  })

  it('renders nothing: no button, no account section, no lifecycle', () => {
    expect(render(<AOSignatureSignInButton />).toJSON()).toBeNull()
    expect(render(<AOSignatureAccountSection />).toJSON()).toBeNull()
    expect(render(<AOSignatureLifecycle />).toJSON()).toBeNull()
  })

  it('the navigator gate is always null (signed in or not)', () => {
    for (const [has, did] of [
      [false, undefined],
      [true, 'did:plc:pds'],
    ] as const) {
      const {result} = renderHook(() => useAOSignatureGate(has, did))
      expect(result.current).toBeNull()
    }
    const {result} = renderHook(() => useAOSignatureState())
    expect(result.current).toEqual({loaded: true, record: null, notice: null})
  })

  it('the runtime bearer is the PDS token, byte for byte', async () => {
    await expect(getAgentRuntimeAccessToken()).resolves.toBe('PDS_JWT')
    expect(aoRuntimeBearer('did:plc:pds')).toBeNull()
    expect(aoRuntimeBearer(undefined)).toBeNull()
  })

  it('store writes and loads are inert; nothing is persisted or fetched', async () => {
    await loadAOSession()
    await setAORecord({
      v: 1,
      token: 'aos1.a.b',
      sid: 's',
      did: 'did:plc:pds',
      handle: null,
      expiresAt: new Date(Date.now() + 1e9).toISOString(),
      primary: null,
      needsAgent: true,
      refreshedAt: 0,
      reverify: false,
    })
    expect(getAOState().record).toBeNull()
    captureAOSignatureWebCallback()
    aoSignatureOnPdsLogout('did:plc:pds')
    aoSignatureOnPdsLogout(null)
    await Promise.resolve()
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockRequired).toEqual([])
  })
})
