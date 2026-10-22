import {StrictMode} from 'react'
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
// Every render logs WHICH component instance rendered which sid. The instance
// id comes from a useState initializer, so it belongs to the instance: a
// remount (new key) gets new ids, a mere re-render keeps the old one.
const mockRenders: Array<{id: number; sid: string}> = []
let mockNextId = 0
jest.mock('../components/AgentPicker', () => {
  const {useState} = require('react') as {
    useState: <T>(init: () => T) => [T, unknown]
  }
  return {
    AOAgentPicker: ({sid}: {sid: string}) => {
      const [id] = useState(() => ++mockNextId)
      mockRenders.push({id, sid})
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
    render(
      <StrictMode>
        <AOSignatureShell gate="shell" />
      </StrictMode>,
    )
    await act(async () => {
      await setAORecord(needsAgent('sid-b'))
    })
    const idsFor = (sid: string) =>
      new Set(mockRenders.filter(r => r.sid === sid).map(r => r.id))
    const a = idsFor('sid-a')
    const b = idsFor('sid-b')
    expect(a.size).toBeGreaterThan(0)
    expect(b.size).toBeGreaterThan(0)
    // sid-b never renders in an instance that rendered sid-a.
    expect([...b].filter(id => a.has(id))).toEqual([])
  })
})
