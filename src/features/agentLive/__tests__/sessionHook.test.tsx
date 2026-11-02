/**
 * Review 679a9d48 H2 item 4: signing out or switching account starts ending
 * every open live session FIRST, while that account's bearer is still
 * current (features/agentLive/registry.ts). Run through the real session
 * Provider (f2caccaa F11): the reducer is wrapped to record each action, so
 * the order below is the order the store actually changed in.
 */
import {useEffect} from 'react'
import {BskyAgent} from '@atproto/api'
import {beforeEach, describe, expect, it, jest} from '@jest/globals'
import {act, render} from '@testing-library/react-native'

import {type Action, type State} from '#/state/session/reducer'
import {type SessionAccount} from '#/state/session/types'

const order: string[] = []

jest.mock('jwt-decode', () => ({jwtDecode: () => ({})}))
jest.mock('#/state/session/reducer', () => {
  const actual = jest.requireActual<typeof import('#/state/session/reducer')>(
    '#/state/session/reducer',
  )
  return {
    ...actual,
    reducer: (state: State, action: Action) => {
      order.push(action.type)
      return actual.reducer(state, action)
    },
  }
})
jest.mock('#/features/agentLive/registry', () => ({
  endOpenLiveSessions: () => order.push('endOpenLiveSessions'),
}))
jest.mock('#/state/session/agent', () => {
  const actual = jest.requireActual<typeof import('#/state/session/agent')>(
    '#/state/session/agent',
  )
  return {
    ...actual,
    createAgentAndLogin: jest.fn(),
    createAgentAndResume: jest.fn(),
    createAgentAndCreateAccount: jest.fn(),
  }
})
jest.mock('#/state/session/util', () => ({
  ...jest.requireActual<typeof import('#/state/session/util')>(
    '#/state/session/util',
  ),
  createTemporaryAgentsAndResume: () => Promise.resolve([]),
}))
jest.mock('#/state/persisted', () => ({
  get: () => ({accounts: []}),
  write: () => Promise.resolve(),
  onUpdate: () => () => {},
}))
jest.mock('#/analytics', () => ({
  AnalyticsContext: ({children}: {children: React.ReactNode}) => children,
  useAnalyticsBase: () => ({metric: () => {}}),
  utils: {accountToSessionMetadata: () => undefined, useMeta: () => ({})},
}))
jest.mock('#/state/shell/onboarding', () => ({
  useOnboardingDispatch: () => () => {},
}))
jest.mock('#/state/util', () => ({useCloseAllActiveElements: () => () => {}}))
jest.mock('#/components/dialogs/Context', () => ({
  useGlobalDialogsControlContext: () => ({}),
}))
jest.mock('#/features/aoSignature/controller', () => ({
  aoSignatureOnPdsLogout: () => {},
}))
jest.mock('#/lib/persisted-query-storage', () => ({
  clearPersistedQueryStorage: () => Promise.resolve(),
}))
jest.mock('#/ageAssurance/data', () => ({
  clearAgeAssuranceServerDataForAll: () => {},
  clearAgeAssuranceServerDataForDid: () => {},
}))
jest.mock('#/state/birthdate')
jest.mock('#/ageAssurance/state', () => ({
  unsafeGetAndComputeAgeAssurance: () => ({state: {}}),
}))
jest.mock('#/lib/notifications/notifications', () => ({
  unregisterPushToken: () => Promise.resolve(),
}))

// After the mocks: the Provider must load them.
const {Provider, useSessionApi} =
  jest.requireActual<typeof import('#/state/session')>('#/state/session')
type Created = {agent: BskyAgent; account: SessionAccount}
const agentModule = jest.requireMock<{
  createAgentAndLogin: jest.Mock<() => Promise<Created>>
  createAgentAndResume: jest.Mock<() => Promise<Created>>
  createAgentAndCreateAccount: jest.Mock<() => Promise<Created>>
}>('#/state/session/agent')

function account(name: string): Created {
  // The app's agent (BskyAppAgent) is disposed when replaced.
  const agent = Object.assign(
    new BskyAgent({service: `https://${name}.test`}),
    {
      dispose: () => {},
    },
  )
  agent.sessionManager.session = {
    active: true,
    did: `did:plc:${name}`,
    handle: `${name}.test`,
    accessJwt: `${name}-access`,
    refreshJwt: `${name}-refresh`,
  }
  return {
    agent,
    account: {
      service: `https://${name}.test/`,
      did: `did:plc:${name}`,
      handle: `${name}.test`,
      accessJwt: `${name}-access`,
      refreshJwt: `${name}-refresh`,
      active: true,
    },
  }
}

function setup() {
  const ref: {api?: ReturnType<typeof useSessionApi>} = {}
  function Probe() {
    const api = useSessionApi()
    useEffect(() => {
      ref.api = api
    })
    return null
  }
  render(
    <Provider>
      <Probe />
    </Provider>,
  )
  return () => ref.api!
}

async function signedInAs(api: () => ReturnType<typeof useSessionApi>) {
  agentModule.createAgentAndLogin.mockResolvedValueOnce(account('alice'))
  await act(() =>
    api().login(
      {service: 'https://alice.test', identifier: 'alice', password: 'x'},
      'LoginForm',
    ),
  )
  order.length = 0
}

const METRICS = {signupDuration: 0, fieldErrorsTotal: 0, backgroundCount: 0}

beforeEach(() => {
  order.length = 0
  agentModule.createAgentAndLogin.mockReset()
  agentModule.createAgentAndResume.mockReset()
  agentModule.createAgentAndCreateAccount.mockReset()
})

describe('sign-out and account switch end open live sessions first', () => {
  it('login ends them after the new credentials worked, before the switch (f2caccaa F7)', async () => {
    const api = setup()
    await signedInAs(api)
    agentModule.createAgentAndLogin.mockImplementationOnce(() => {
      order.push('createAgentAndLogin')
      return Promise.resolve(account('bob'))
    })
    await act(() =>
      api().login(
        {service: 'https://bob.test', identifier: 'bob', password: 'x'},
        'LoginForm',
      ),
    )
    expect(order).toEqual([
      'createAgentAndLogin',
      'endOpenLiveSessions',
      'switched-to-account',
    ])
  })

  it('a failed login ends nothing', async () => {
    const api = setup()
    await signedInAs(api)
    agentModule.createAgentAndLogin.mockRejectedValueOnce(new Error('bad'))
    await act(async () => {
      await api()
        .login(
          {service: 'https://bob.test', identifier: 'bob', password: 'x'},
          'LoginForm',
        )
        .catch(() => {})
    })
    expect(order).toEqual([])
  })

  it('logoutCurrentAccount ends them before the account is logged out', async () => {
    const api = setup()
    await signedInAs(api)
    act(() => api().logoutCurrentAccount('Settings'))
    expect(order.slice(0, 2)).toEqual([
      'endOpenLiveSessions',
      'logged-out-current-account',
    ])
  })

  it('logoutEveryAccount ends them before every account is logged out', async () => {
    const api = setup()
    await signedInAs(api)
    act(() => api().logoutEveryAccount('Settings'))
    expect(order.slice(0, 2)).toEqual([
      'endOpenLiveSessions',
      'logged-out-every-account',
    ])
  })

  it('resumeSession ends them on an account switch, before resuming', async () => {
    const api = setup()
    await signedInAs(api)
    agentModule.createAgentAndResume.mockImplementationOnce(() => {
      order.push('createAgentAndResume')
      return Promise.resolve(account('bob'))
    })
    await act(() => api().resumeSession(account('bob').account, true))
    expect(order).toEqual([
      'endOpenLiveSessions',
      'createAgentAndResume',
      'switched-to-account',
    ])
  })

  it('a switch a notification tap started (keepLive) ends nothing (ruling on c23bdc031 F1)', async () => {
    const api = setup()
    await signedInAs(api)
    agentModule.createAgentAndResume.mockResolvedValueOnce(account('bob'))
    await act(() =>
      api().resumeSession(account('bob').account, true, {keepLive: true}),
    )
    expect(order).toEqual(['switched-to-account'])
  })

  it('createAccount is an account switch: ends them after the account exists, before the switch (27020b222 F11)', async () => {
    const api = setup()
    await signedInAs(api)
    agentModule.createAgentAndCreateAccount.mockImplementationOnce(() => {
      order.push('createAgentAndCreateAccount')
      return Promise.resolve(account('bob'))
    })
    await act(() =>
      api().createAccount(
        {
          service: 'https://bob.test',
          email: 'bob@bob.test',
          password: 'x',
          handle: 'bob.test',
          birthDate: new Date(2000, 0, 1),
        },
        METRICS,
      ),
    )
    expect(order).toEqual([
      'createAgentAndCreateAccount',
      'endOpenLiveSessions',
      'switched-to-account',
    ])
  })

  it('a failed createAccount ends nothing', async () => {
    const api = setup()
    await signedInAs(api)
    agentModule.createAgentAndCreateAccount.mockRejectedValueOnce(
      new Error('taken'),
    )
    await act(async () => {
      await api()
        .createAccount(
          {
            service: 'https://bob.test',
            email: 'bob@bob.test',
            password: 'x',
            handle: 'bob.test',
            birthDate: new Date(2000, 0, 1),
          },
          METRICS,
        )
        .catch(() => {})
    })
    expect(order).toEqual([])
  })

  it('resumeSession without a switch (app start) ends nothing', async () => {
    const api = setup()
    agentModule.createAgentAndResume.mockResolvedValueOnce(account('alice'))
    await act(() => api().resumeSession(account('alice').account))
    expect(order).toEqual(['switched-to-account'])
  })

  it('the registry pulls in nothing (no Live client in state/session)', () => {
    // eslint-disable-next-line import-x/no-nodejs-modules -- reads the source
    const fs = require('node:fs') as typeof import('node:fs')
    // eslint-disable-next-line import-x/no-nodejs-modules -- reads the source
    const path = require('node:path') as typeof import('node:path')
    const reg = fs.readFileSync(path.join(__dirname, '../registry.ts'), 'utf8')
    expect(reg).not.toMatch(/^import /m)
  })
})
