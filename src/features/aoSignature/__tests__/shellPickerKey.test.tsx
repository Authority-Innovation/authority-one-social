import {StrictMode} from 'react'
import {describe, expect, it, jest} from '@jest/globals'
import {act, render, renderHook} from '@testing-library/react-native'

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
// Per-app enrollment (rollout P1): the terms screen renders before the picker.
const mockEnrollmentRenders: string[] = []
jest.mock('../components/Enrollment', () => ({
  AOEnrollment: ({sid}: {sid: string}) => {
    mockEnrollmentRenders.push(sid)
    return null
  },
}))
const mockConnectRenders: string[] = []
jest.mock('../components/ConnectCommunity', () => ({
  AOConnectCommunity: ({record}: {record: {sid: string}}) => {
    mockConnectRenders.push(record.sid)
    return null
  },
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
import {useAOSignatureGate} from '../hooks'
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
    enrolled: true,
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

  it("an unenrolled session shows Community's terms first, never the picker", async () => {
    mockRenders.length = 0
    mockEnrollmentRenders.length = 0
    await act(async () => {
      await setAORecord({...needsAgent('sid-c'), enrolled: false})
    })
    render(<AOSignatureShell gate="shell" />)
    expect(mockEnrollmentRenders).toContain('sid-c')
    expect(mockRenders.filter(r => r.sid === 'sid-c')).toEqual([])
  })

  it("review edcf058f8 Shell order: an unenrolled person WITH an agent sees Community's terms, never the self-mint screen", async () => {
    mockEnrollmentRenders.length = 0
    mockConnectRenders.length = 0
    await act(async () => {
      await setAORecord({
        ...needsAgent('sid-d'),
        needsAgent: false,
        primary: 'agent',
        enrolled: false,
      })
    })
    render(<AOSignatureShell gate="shell" />)
    expect(mockEnrollmentRenders).toContain('sid-d')
    expect(mockConnectRenders).toEqual([])
    // and once enrolled, the self-mint screen (not the terms) is what shows
    await act(async () => {
      await setAORecord({
        ...needsAgent('sid-d'),
        needsAgent: false,
        primary: 'agent',
        enrolled: true,
      })
    })
    expect(mockConnectRenders).toContain('sid-d')
  })
})

describe('gate (review edcf058f8 H2)', () => {
  const withAgent = (enrolled: boolean) => ({
    ...needsAgent('sid-g'),
    needsAgent: false,
    primary: 'agent',
    enrolled,
  })
  it("a PDS session for the SAME person, with an agent but NOT enrolled, is sent to the shell (Community's terms)", async () => {
    await act(async () => {
      await setAORecord(withAgent(false))
    })
    const {result} = renderHook(() => useAOSignatureGate(true, DID))
    expect(result.current).toBe('shell')
  })
  it('enrolled with an agent, the social app renders; another account is never gated by this session', async () => {
    await act(async () => {
      await setAORecord(withAgent(true))
    })
    expect(renderHook(() => useAOSignatureGate(true, DID)).result.current).toBe(
      null,
    )
    await act(async () => {
      await setAORecord(withAgent(false))
    })
    expect(
      renderHook(() => useAOSignatureGate(true, 'did:plc:someoneelse')).result
        .current,
    ).toBe(null)
  })
})
