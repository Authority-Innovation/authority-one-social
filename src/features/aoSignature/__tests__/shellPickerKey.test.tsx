import {describe, expect, it, jest} from '@jest/globals'
import {act, render} from '@testing-library/react-native'

// The Shell remounts the picker per AO session (key={record.sid}).
jest.mock('../config', () => ({
  isAOSignatureArmed: () => true,
  AO_SIGNATURE_CONFIG: {platform: 'ios', runtimeUrl: 'https://runtime.test'},
}))
jest.mock('../storage', () => ({
  AO_STORAGE_PERSISTS: true,
  readStoredSession: () => Promise.resolve(null),
  writeStoredSession: () => Promise.resolve(),
  clearStoredSession: () => Promise.resolve(),
}))
jest.mock('#/alf', () => ({
  atoms: new Proxy({}, {get: () => ({})}),
  useTheme: () => ({atoms: new Proxy({}, {get: () => ({})})}),
}))
jest.mock('#/components/Button', () => ({
  Button: () => null,
  ButtonText: () => null,
}))
jest.mock('#/components/Loader', () => ({Loader: () => null}))
jest.mock('#/components/Typography', () => ({Text: () => null}))
jest.mock('@lingui/react', () => ({
  useLingui: () => ({_: (d: {message?: string}) => d.message ?? ''}),
}))
jest.mock('@lingui/react/macro', () => ({
  Trans: ({children}: {children: unknown}) => children,
}))
jest.mock('#/state/session', () => ({
  useAgent: () => ({}),
  useSession: () => ({}),
}))
jest.mock('#/view/com/auth/LoggedOut', () => ({LoggedOut: () => null}))
jest.mock('../components/AccountActions', () => ({
  AOAccountActions: () => null,
}))
const mockMounts: string[] = []
jest.mock('../components/AgentPicker', () => {
  const {useEffect} = require('react') as {
    useEffect: (f: () => () => void, d: unknown[]) => void
  }
  return {
    AOAgentPicker: ({sid}: {sid: string}) => {
      useEffect(() => {
        mockMounts.push(`mount:${sid}`)
        return () => {
          mockMounts.push(`unmount:${sid}`)
        }
      }, [sid])
      return null
    },
  }
})

import {DID, mintedSession, redeemBody} from '../__fixtures__/fixtures'
import {AOSignatureShell} from '../components/Shell'
import {recordFromRedeem} from '../session'
import {setAORecord} from '../store'
import {decodeRedeem} from '../wire'

function needsAgent(sid: string) {
  return {
    ...recordFromRedeem(
      decodeRedeem(redeemBody({aoSession: mintedSession(DID, sid)})),
    ),
    needsAgent: true,
    primary: null,
  }
}

describe('Shell picker per session', () => {
  it('a session swap remounts the picker (no state carries over)', async () => {
    await setAORecord(needsAgent('sid-a'))
    render(<AOSignatureShell gate="shell" />)
    await act(async () => {
      await setAORecord(needsAgent('sid-b'))
    })
    expect(mockMounts).toEqual(['mount:sid-a', 'unmount:sid-a', 'mount:sid-b'])
  })
})
