import {beforeEach, describe, expect, it, jest} from '@jest/globals'

// ARMED, runtime pinned at https://runtime.test: which hosts get the AO bearer.
jest.mock('#/features/aoSignature/config', () => ({
  isAOSignatureArmed: () => true,
  AO_SIGNATURE_CONFIG: {platform: 'ios', runtimeUrl: 'https://runtime.test'},
}))
jest.mock('#/features/aoSignature/storage', () => ({
  AO_STORAGE_PERSISTS: true,
  readStoredSession: () => Promise.resolve(null),
  writeStoredSession: () => Promise.resolve(),
  clearStoredSession: () => Promise.resolve(),
}))
jest.mock('#/state/persisted', () => ({
  get: jest.fn(() => ({
    currentAccount: {did: 'did:plc:owner1234', accessJwt: 'PDS_JWT'},
  })),
}))
jest.mock('#/logger', () => ({logger: {error: jest.fn(), warn: jest.fn()}}))
jest.mock('../../../screens/GameRoom/liveGameClient', () => ({
  GAME_SERVER_BASE_URL: 'https://games.elsewhere.test',
}))

import {getAgentRuntimeAccessToken} from '#/lib/agent-runtime/authToken'
import {createLiveMatch} from '../../../screens/GameRoom/createMatch'
import {redeemBody} from '../__fixtures__/fixtures'
import {recordFromRedeem} from '../session'
import {_resetAOStoreForTests, setAORecord} from '../store'
import {decodeRedeem} from '../wire'

const mockFetch = jest.fn(
  (_url: string, _init: {headers: Record<string, string>}) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({matchID: 'm1'}),
    }),
)
// @ts-expect-error test shim
global.fetch = mockFetch

let aoToken = ''
beforeEach(async () => {
  _resetAOStoreForTests({loaded: true})
  const r = recordFromRedeem(decodeRedeem(redeemBody()))
  aoToken = r.token
  await setAORecord(r)
  mockFetch.mockClear()
})

describe('the AO bearer goes ONLY to the pinned runtime origin', () => {
  it.each([
    [undefined, 'AO'],
    ['https://runtime.test/app/chat', 'AO'],
    ['https://runtime.test:443/app/games', 'AO'],
    ['https://games.elsewhere.test/app/games', 'PDS'],
    ['https://runtime.test.evil.test/app/chat', 'PDS'],
    ['http://runtime.test/app/chat', 'PDS'],
    ['not a url', 'PDS'],
  ])('%s → %s', async (target, who) => {
    const t = await getAgentRuntimeAccessToken(target)
    expect(t).toBe(who === 'AO' ? aoToken : 'PDS_JWT')
  })

  it('createLiveMatch to a game server on another origin sends the PDS token', async () => {
    await createLiveMatch('chess')
    const init = mockFetch.mock.calls[0][1]
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://games.elsewhere.test/app/games',
    )
    expect(init.headers.authorization).toBe('Bearer PDS_JWT')
  })

  it('createLiveMatch to the runtime itself sends the AO session', async () => {
    await createLiveMatch('chess', 'https://runtime.test')
    expect(mockFetch.mock.calls[0][1].headers.authorization).toBe(
      `Bearer ${aoToken}`,
    )
  })
})
