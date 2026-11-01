import {beforeEach, describe, expect, it, jest} from '@jest/globals'

import {markHeldHere, wasHeldHere} from '../heldSessions'

const mockStore = new Map<string, string>()
const mockOpts: unknown[] = []
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afterFirstUnlockThisDeviceOnly',
  getItemAsync: (k: string, o: unknown) => {
    mockOpts.push(o)
    return Promise.resolve(mockStore.get(k) ?? null)
  },
  setItemAsync: (k: string, v: string, o: unknown) => {
    mockOpts.push(o)
    mockStore.set(k, v)
    return Promise.resolve()
  },
}))

const A = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'
const B = 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb'
const sid = (n: number) => `ls_${String(n).padStart(26, '0')}`

beforeEach(() => {
  mockStore.clear()
  mockOpts.length = 0
})

describe('heldSessions (review 563477989 R1)', () => {
  it('records a session per account, on this device only', async () => {
    expect(await wasHeldHere(A, sid(1))).toBe(false)
    await markHeldHere(A, sid(1))
    expect(await wasHeldHere(A, sid(1))).toBe(true)
    expect(await wasHeldHere(B, sid(1))).toBe(false)
    expect(mockOpts).toContainEqual({
      keychainAccessible: 'afterFirstUnlockThisDeviceOnly',
    })
  })

  it('keeps the last 20 only', async () => {
    for (let i = 0; i < 25; i++) await markHeldHere(A, sid(i))
    expect(await wasHeldHere(A, sid(4))).toBe(false)
    expect(await wasHeldHere(A, sid(5))).toBe(true)
    expect(await wasHeldHere(A, sid(24))).toBe(true)
  })

  it('ignores a malformed sid, and reads a broken store as not held', async () => {
    await markHeldHere(A, 'not-a-sid')
    expect(mockStore.size).toBe(0)
    mockStore.set('agent-live-held-v1.did_plc_aaaaaaaaaaaaaaaaaaaaaaaa', '{')
    expect(await wasHeldHere(A, sid(1))).toBe(false)
  })
})
