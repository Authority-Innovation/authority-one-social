/**
 * The group AppView transport (W2-T10 fix M1). Group reads must go to the
 * group AppView named by EXPO_PUBLIC_AUTHORITYONE_GROUP_PROXY_DID, never to
 * the PDS's default proxy (bsky_appview), and must not be sent at all when no
 * group AppView is configured.
 */
import {type BskyAgent} from '@atproto/api'
import {afterEach, describe, expect, it, jest} from '@jest/globals'

import type * as GroupQueries from '#/state/queries/group'

jest.mock('#/state/session', () => ({
  useAgent: jest.fn(),
  useSession: jest.fn(),
}))
jest.mock('#/lib/api', () => ({uploadBlob: jest.fn()}))

// Placeholder DID only - not a real service.
const GROUP_DID = 'did:web:group-appview.example'

type GroupModule = typeof GroupQueries

function loadGroupWithEnv(env: Record<string, string | undefined>) {
  const saved: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  let mod: GroupModule | undefined
  try {
    jest.isolateModules(() => {
      mod = require('#/state/queries/group') as GroupModule
    })
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
  return mod!
}

function makeAgent() {
  const call = jest.fn((..._args: unknown[]) =>
    Promise.resolve({success: true, headers: {}, data: {feed: []}}),
  )
  return {agent: {call} as unknown as BskyAgent, call}
}

afterEach(() => {
  jest.clearAllMocks()
})

describe('resolveGroupAppViewProxy', () => {
  const {resolveGroupAppViewProxy} = loadGroupWithEnv({})

  it('is unavailable when the DID is unset', () => {
    expect(resolveGroupAppViewProxy({did: '', serviceId: 'svc'}).ok).toBe(false)
  })

  it('refuses bsky services as a target', () => {
    for (const did of [
      'did:web:api.bsky.app',
      'did:web:bsky.app',
      'did:web:api.bsky.chat',
    ]) {
      expect(resolveGroupAppViewProxy({did, serviceId: 'svc'}).ok).toBe(false)
    }
    expect(
      resolveGroupAppViewProxy({did: GROUP_DID, serviceId: 'bsky_appview'}).ok,
    ).toBe(false)
  })

  it('refuses malformed values', () => {
    expect(resolveGroupAppViewProxy({did: 'not-a-did'}).ok).toBe(false)
    expect(resolveGroupAppViewProxy({did: `${GROUP_DID}#x`}).ok).toBe(false)
  })

  it('builds <did>#<service id>', () => {
    expect(
      resolveGroupAppViewProxy({did: GROUP_DID, serviceId: 'ao_group'}),
    ).toEqual({ok: true, header: `${GROUP_DID}#ao_group`})
  })
})

describe('group reads with no group AppView configured', () => {
  const group = loadGroupWithEnv({
    EXPO_PUBLIC_AUTHORITYONE_GROUP_PROXY_DID: undefined,
    EXPO_PUBLIC_AUTHORITYONE_GROUP_SERVICE_ID: undefined,
  })

  it('getTimeline is refused and nothing is sent', async () => {
    const {agent, call} = makeAgent()
    const err = await group
      .fetchGroupTimeline(agent, {group: 'at://did:example:o/g/1'})
      .catch((e: unknown) => e)
    expect(group.isGroupAppViewUnavailableError(err)).toBe(true)
    expect(call).not.toHaveBeenCalled()
  })

  it('getMemberships is refused and nothing is sent', async () => {
    const {agent, call} = makeAgent()
    await expect(
      group.fetchGroupMemberships(agent, {actor: 'did:example:viewer'}),
    ).rejects.toBeInstanceOf(group.GroupAppViewUnavailableError)
    expect(call).not.toHaveBeenCalled()
  })
})

describe('group reads with a group AppView configured', () => {
  const group = loadGroupWithEnv({
    EXPO_PUBLIC_AUTHORITYONE_GROUP_PROXY_DID: GROUP_DID,
    EXPO_PUBLIC_AUTHORITYONE_GROUP_SERVICE_ID: 'ao_group',
  })

  it('getTimeline carries the group AppView proxy header', async () => {
    const {agent, call} = makeAgent()
    await group.fetchGroupTimeline(agent, {
      group: 'at://did:example:o/g/1',
      limit: 10,
    })
    expect(call).toHaveBeenCalledTimes(1)
    expect(call.mock.calls[0]).toEqual([
      'com.authorityone.group.getTimeline',
      {group: 'at://did:example:o/g/1', limit: 10, cursor: undefined},
      undefined,
      {headers: {'atproto-proxy': `${GROUP_DID}#ao_group`}},
    ])
  })

  it('getMemberships carries the group AppView proxy header', async () => {
    const {agent, call} = makeAgent()
    await group.fetchGroupMemberships(agent, {actor: 'did:example:viewer'})
    const opts = call.mock.calls[0][3] as {headers: Record<string, string>}
    expect(opts.headers['atproto-proxy']).toBe(`${GROUP_DID}#ao_group`)
  })
})
