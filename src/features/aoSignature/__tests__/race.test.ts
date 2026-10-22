import {beforeEach, describe, expect, it, jest} from '@jest/globals'

// ARMED: late network answers must never touch a session that replaced the
// one the action started from.
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

import {DID, mintedSession, redeemBody} from '../__fixtures__/fixtures'
import {type AOClient} from '../client'
import {AOSignatureError} from '../errors'
import {
  adoptPrimary,
  adoptRedeem,
  recordFromRedeem,
  refreshAOSession,
  signOutAO,
  signOutEverywhereAO,
  syncAOSession,
  unlinkAO,
} from '../session'
import {
  _resetAOStoreForTests,
  type AORecord,
  getAOState,
  setAORecord,
} from '../store'
import {decodeRedeem} from '../wire'

const DID_B = 'did:plc:accountb'

function recordFor(did: string, sid: string): AORecord {
  return recordFromRedeem(
    decodeRedeem(redeemBody({did, aoSession: mintedSession(did, sid)})),
  )
}

/** A promise the test settles by hand, AFTER swapping the session. */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return {promise, resolve, reject}
}

function client(over: Partial<AOClient>): AOClient {
  const no = () => Promise.reject(new Error('unexpected'))
  return {
    redeem: no,
    linkCode: no,
    refresh: no,
    introspect: no,
    signout: () => Promise.resolve(),
    signoutEverywhere: () => Promise.resolve(),
    unlink: () => Promise.resolve(),
    listAgents: no,
    createAgent: no,
    choosePrimary: no,
    ...over,
  }
}

const A = () => recordFor(DID, 'sid-a')
const B = () => recordFor(DID_B, 'sid-b')

beforeEach(() => {
  _resetAOStoreForTests({loaded: true})
})

describe('late answers for a replaced session are dropped', () => {
  it("refresh 200 for A never gives B A's token", async () => {
    await setAORecord(A())
    const d = deferred<ReturnType<typeof mintedSession>>()
    const p = refreshAOSession(client({refresh: () => d.promise}))
    const b = B()
    await setAORecord(b) // account B signed in meanwhile
    d.resolve(mintedSession(DID, 'sid-a'))
    await expect(p).resolves.toBe('stale')
    expect(getAOState().record).toEqual(b)
  })

  it('refresh 401 for A never wipes B', async () => {
    await setAORecord(A())
    const d = deferred<never>()
    const p = refreshAOSession(client({refresh: () => d.promise}))
    const b = B()
    await setAORecord(b)
    d.reject(new AOSignatureError('refused', 401, 'unauthorized'))
    await expect(p).resolves.toBe('stale')
    expect(getAOState().record).toEqual(b)
    expect(getAOState().notice).toBeNull()
  })

  it('refresh janus-reverify for A never marks B', async () => {
    await setAORecord(A())
    const d = deferred<never>()
    const p = refreshAOSession(client({refresh: () => d.promise}))
    await setAORecord(B())
    d.reject(new AOSignatureError('refused', 401, 'janus-reverify'))
    await expect(p).resolves.toBe('stale')
    expect(getAOState().record?.reverify).toBe(false)
  })

  it('a slow sign-out of A leaves B signed in', async () => {
    await setAORecord(A())
    const d = deferred<void>()
    const p = signOutAO(client({signout: () => d.promise}))
    const b = B()
    await setAORecord(b)
    d.resolve()
    await p
    expect(getAOState().record).toEqual(b)
  })

  it('a refresh that rotates the token mid sign-out still signs out (sid revoked)', async () => {
    for (const run of [
      (d: Promise<void>) => signOutAO(client({signout: () => d})),
      (d: Promise<void>) =>
        signOutEverywhereAO(client({signoutEverywhere: () => d})),
      (d: Promise<void>) => unlinkAO(client({unlink: () => d})),
    ]) {
      const a = A()
      await setAORecord(a)
      const d = deferred<void>()
      const p = run(d.promise)
      // The refresh lands first: same sid, a GENUINELY new token (T2).
      const t2 = mintedSession(DID, 'sid-a', 3600 * 1000)
      expect(t2.token).not.toBe(a.token)
      await expect(
        refreshAOSession(client({refresh: () => Promise.resolve(t2)})),
      ).resolves.toBe('refreshed')
      expect(getAOState().record?.sid).toBe('sid-a')
      expect(getAOState().record?.token).toBe(t2.token)
      expect(getAOState().record?.token).not.toBe(a.token)
      d.resolve()
      await p
      expect(getAOState().record).toBeNull()
    }
  })

  it('sign out everywhere / unlink of A leave B alone', async () => {
    for (const run of [
      (d: Promise<void>) =>
        signOutEverywhereAO(client({signoutEverywhere: () => d})),
      (d: Promise<void>) => unlinkAO(client({unlink: () => d})),
    ]) {
      await setAORecord(A())
      const d = deferred<void>()
      const p = run(d.promise)
      const b = B()
      await setAORecord(b)
      d.resolve()
      await p
      expect(getAOState().record).toEqual(b)
    }
  })

  it('sync of A (200 or 401) never patches or wipes B', async () => {
    await setAORecord(A())
    const ok = deferred<{
      agents: []
      primary: string
      needsAgent: boolean
      did: string
    }>()
    const p1 = syncAOSession(client({introspect: () => ok.promise}))
    const b = B()
    await setAORecord(b)
    ok.resolve({
      agents: [],
      primary: 'evil.pds.test',
      needsAgent: false,
      did: DID,
    })
    await p1
    expect(getAOState().record).toEqual(b)

    await setAORecord(A())
    const no = deferred<never>()
    const p2 = syncAOSession(client({introspect: () => no.promise}))
    await setAORecord(b)
    no.reject(new AOSignatureError('refused', 401, 'unauthorized'))
    await p2
    expect(getAOState().record).toEqual(b)
  })

  it("the picker's primary lands only on the session it ran for", async () => {
    const b = {...B(), needsAgent: true, primary: null}
    await setAORecord(b)
    await adoptPrimary('sid-a', 'evil.pds.test')
    expect(getAOState().record).toEqual(b)
    await adoptPrimary('sid-b', 'steve.pds.test')
    expect(getAOState().record).toMatchObject({
      primary: 'steve.pds.test',
      needsAgent: false,
    })
  })
})

describe('a refresh never adopts a different sid', () => {
  it('a re-mint under another sid ends the session instead of adopting it', async () => {
    await setAORecord(A())
    const other = mintedSession(DID, 'sid-other', 1000)
    await expect(
      refreshAOSession(client({refresh: () => Promise.resolve(other)})),
    ).resolves.toBe('ended')
    expect(getAOState().record).toBeNull()
    expect(getAOState().notice).not.toBeNull()
  })

  it("the client's sid-mismatch refusal also ends it", async () => {
    await setAORecord(A())
    await expect(
      refreshAOSession(
        client({
          refresh: () =>
            Promise.reject(
              new AOSignatureError('refused', 502, 'sid-mismatch'),
            ),
        }),
      ),
    ).resolves.toBe('ended')
    expect(getAOState().record).toBeNull()
  })
})

describe('a new sign-in revokes the old sid first (best effort)', () => {
  it('revokes the previous session, then adopts the new one', async () => {
    const old = A()
    await setAORecord(old)
    const order: string[] = []
    const c = client({
      signout: (t: string) => {
        order.push(`signout:${t === old.token ? 'old' : 'other'}`)
        return Promise.resolve()
      },
    })
    const fresh = decodeRedeem(
      redeemBody({aoSession: mintedSession(DID, 'sid-new')}),
    )
    await adoptRedeem(c, fresh)
    order.push('adopted')
    expect(order).toEqual(['signout:old', 'adopted'])
    expect(getAOState().record?.sid).toBe('sid-new')
  })

  it('a failed revoke never blocks the new session; the same sid is not revoked', async () => {
    await setAORecord(A())
    const signout = jest.fn(() =>
      Promise.reject(new AOSignatureError('transport')),
    )
    await adoptRedeem(
      client({signout}),
      decodeRedeem(redeemBody({aoSession: mintedSession(DID, 'sid-new')})),
    )
    expect(getAOState().record?.sid).toBe('sid-new')
    signout.mockClear()
    await adoptRedeem(
      client({signout}),
      decodeRedeem(redeemBody({aoSession: mintedSession(DID, 'sid-new')})),
    )
    expect(signout).not.toHaveBeenCalled()
  })
})
