import {beforeEach, describe, expect, it, jest} from '@jest/globals'

// ARMED for this file: the store/session logic only runs with the lane on.
jest.mock('../config', () => ({
  isAOSignatureArmed: () => true,
  AO_SIGNATURE_CONFIG: {platform: 'ios'},
}))
const mockStored: {value: string | null} = {value: null}
jest.mock('../storage', () => ({
  AO_STORAGE_PERSISTS: true,
  readStoredSession: jest.fn(() => Promise.resolve(mockStored.value)),
  writeStoredSession: jest.fn((v: string) => {
    mockStored.value = v
    return Promise.resolve()
  }),
  clearStoredSession: jest.fn(() => {
    mockStored.value = null
    return Promise.resolve()
  }),
}))

import {
  aosToken,
  DID,
  mintedSession,
  redeemBody,
} from '../__fixtures__/fixtures'
import {type AOClient} from '../client'
import {AOSignatureError} from '../errors'
import {
  LIVENESS_MS,
  noteAONotProvisioned,
  onPdsLogout,
  recordFromRedeem,
  REFRESH_EVERY_MS,
  refreshAOSession,
  refreshDecision,
  signOutAO,
  signOutEverywhereAO,
  syncAOSession,
  unlinkAO,
} from '../session'
import {
  _resetAOStoreForTests,
  type AORecord,
  aoRuntimeBearer,
  decodeRecord,
  getAOState,
  loadAOSession,
  setAORecord,
} from '../store'
import {decodeRedeem} from '../wire'

function record(over: Partial<AORecord> = {}): AORecord {
  return {...recordFromRedeem(decodeRedeem(redeemBody()), Date.now()), ...over}
}

function fakeClient(over: Partial<AOClient> = {}): AOClient {
  const no = () => Promise.reject(new Error('unexpected'))
  return {
    redeem: no,
    linkCode: no,
    refresh: no,
    introspect: no,
    signout: jest.fn(() => Promise.resolve()),
    signoutEverywhere: jest.fn(() => Promise.resolve()),
    unlink: jest.fn(() => Promise.resolve()),
    listAgents: no,
    createAgent: no,
    choosePrimary: no,
    ...over,
  }
}

beforeEach(() => {
  mockStored.value = null
  _resetAOStoreForTests({loaded: true})
})

describe('session store', () => {
  it('round-trips a record through the device store; drops expired / foreign / malformed ones', async () => {
    const r = record()
    await setAORecord(r)
    expect((JSON.parse(mockStored.value!) as AORecord).token).toBe(r.token)
    _resetAOStoreForTests({loaded: false})
    await loadAOSession()
    expect(getAOState().record?.token).toBe(r.token)

    expect(
      decodeRecord(
        JSON.stringify({...r, expiresAt: new Date(1).toISOString()}),
      ),
    ).toBeNull()
    expect(decodeRecord(JSON.stringify({...r, did: 'did:plc:else'}))).toBeNull()
    expect(decodeRecord(JSON.stringify({...r, token: 'eyJ.a.b'}))).toBeNull()
    expect(decodeRecord('{nope')).toBeNull()
    expect(decodeRecord(null)).toBeNull()
  })

  it('an unreadable stored record is cleared at boot (signed out, not stale)', async () => {
    mockStored.value = '{"v":1,"token":"x"}'
    _resetAOStoreForTests({loaded: false})
    await loadAOSession()
    expect(getAOState().record).toBeNull()
    expect(mockStored.value).toBeNull()
  })

  it('the runtime bearer is the AO token only for its own DID (or no PDS account)', async () => {
    const r = record()
    await setAORecord(r)
    expect(aoRuntimeBearer(undefined)).toBe(r.token)
    expect(aoRuntimeBearer(DID)).toBe(r.token)
    expect(aoRuntimeBearer('did:plc:another')).toBeNull()
    expect(aoRuntimeBearer(DID, Date.parse(r.expiresAt) + 1)).toBeNull()
  })
})

describe('renewal policy', () => {
  const now = Date.now()
  it('slides at most twice a day, inside the liveness window', () => {
    expect(refreshDecision(record({refreshedAt: now}), now)).toBe('none')
    expect(
      refreshDecision(record({refreshedAt: now - REFRESH_EVERY_MS}), now),
    ).toBe('refresh')
    expect(refreshDecision(record({refreshedAt: 0}), now, now + 1)).toBe('none') // backoff
    expect(refreshDecision(record({refreshedAt: 0, reverify: true}), now)).toBe(
      'none',
    )
    expect(refreshDecision(null, now)).toBe('none')
  })

  it('past the Janus liveness window it asks for a re-verify instead of spending a refresh', () => {
    const lv = Math.floor((now - LIVENESS_MS - 1000) / 1000)
    const token = aosToken({did: DID, sid: 'sid-1', lv})
    expect(refreshDecision(record({token, refreshedAt: 0}), now)).toBe(
      'reverify',
    )
  })
})

describe('refresh outcomes', () => {
  it('200 → the new token replaces the old', async () => {
    await setAORecord(record({refreshedAt: 0}))
    const m = mintedSession(DID, 'sid-1')
    const out = await refreshAOSession(
      fakeClient({refresh: () => Promise.resolve(m)}),
      5,
    )
    expect(out).toBe('refreshed')
    expect(getAOState().record).toMatchObject({
      token: m.token,
      refreshedAt: 5,
      reverify: false,
    })
  })

  it('401 janus-reverify → marked; the session is kept', async () => {
    await setAORecord(record())
    const out = await refreshAOSession(
      fakeClient({
        refresh: () =>
          Promise.reject(
            new AOSignatureError('refused', 401, 'janus-reverify'),
          ),
      }),
    )
    expect(out).toBe('reverify')
    expect(getAOState().record?.reverify).toBe(true)
  })

  it('any other 401 → the session is over: cleared, the person told', async () => {
    await setAORecord(record())
    const out = await refreshAOSession(
      fakeClient({
        refresh: () =>
          Promise.reject(new AOSignatureError('refused', 401, 'unauthorized')),
      }),
    )
    expect(out).toBe('ended')
    expect(getAOState().record).toBeNull()
    expect(getAOState().notice).not.toBeNull()
    expect(mockStored.value).toBeNull()
  })

  it('network / 5xx → backoff, session kept', async () => {
    const r = record()
    await setAORecord(r)
    for (const err of [
      new AOSignatureError('transport'),
      new AOSignatureError('refused', 503, 'unavailable'),
    ]) {
      const out = await refreshAOSession(
        fakeClient({refresh: () => Promise.reject(err)}),
      )
      expect(out).toBe('backoff')
      expect(getAOState().record?.token).toBe(r.token)
    }
  })

  it('sync: a 401 ends the session, a new primary is adopted, a network failure changes nothing', async () => {
    await setAORecord(record({primary: null, needsAgent: true}))
    await syncAOSession(
      fakeClient({
        introspect: () =>
          Promise.resolve({
            agents: [],
            primary: 'steve.pds.test',
            needsAgent: false,
            did: DID,
          }),
      }),
    )
    expect(getAOState().record).toMatchObject({
      primary: 'steve.pds.test',
      needsAgent: false,
    })
    await syncAOSession(
      fakeClient({
        introspect: () => Promise.reject(new AOSignatureError('transport')),
      }),
    )
    expect(getAOState().record).not.toBeNull()
    await syncAOSession(
      fakeClient({
        introspect: () =>
          Promise.reject(new AOSignatureError('refused', 401, 'unauthorized')),
      }),
    )
    expect(getAOState().record).toBeNull()
  })

  it('a 403 not-provisioned sends the person back to the picker', async () => {
    await setAORecord(record())
    noteAONotProvisioned()
    await Promise.resolve()
    expect(getAOState().record).toMatchObject({needsAgent: true, primary: null})
  })
})

describe('sign out / everywhere / unlink', () => {
  it('sign out revokes this sid, and the device forgets it even when the runtime is unreachable', async () => {
    const r = record()
    await setAORecord(r)
    const client = fakeClient({
      signout: jest.fn(() => Promise.reject(new AOSignatureError('transport'))),
    })
    await expect(signOutAO(client)).resolves.toEqual({serverConfirmed: false})
    expect(client.signout).toHaveBeenCalledWith(r.token)
    expect(getAOState().record).toBeNull()
  })

  it('sign out everywhere: the device signs out only after the runtime confirms', async () => {
    await setAORecord(record())
    const failing = fakeClient({
      signoutEverywhere: () =>
        Promise.reject(new AOSignatureError('refused', 503, 'unavailable')),
    })
    await expect(signOutEverywhereAO(failing)).rejects.toBeInstanceOf(
      AOSignatureError,
    )
    expect(getAOState().record).not.toBeNull()
    await signOutEverywhereAO(fakeClient())
    expect(getAOState().record).toBeNull()
  })

  it('unlink: after confirm only', async () => {
    await setAORecord(record())
    await expect(
      unlinkAO(
        fakeClient({
          unlink: () => Promise.reject(new AOSignatureError('transport')),
        }),
      ),
    ).rejects.toBeInstanceOf(AOSignatureError)
    expect(getAOState().record).not.toBeNull()
    await unlinkAO(fakeClient())
    expect(getAOState().record).toBeNull()
  })

  it('a PDS sign-out of the same account signs Signature out too; another account does not', async () => {
    await setAORecord(record())
    const c = fakeClient()
    await onPdsLogout(c, 'did:plc:someoneelse')
    expect(getAOState().record).not.toBeNull()
    await onPdsLogout(c, DID)
    expect(getAOState().record).toBeNull()
    expect(c.signout).toHaveBeenCalledTimes(1)
  })
})
