/**
 * The group AppView transport (W2-T10 fix M1). Group reads must go to the
 * group AppView named by EXPO_PUBLIC_AUTHORITYONE_GROUP_PROXY_DID, never to
 * the PDS's default proxy (bsky_appview), and must not be sent at all when no
 * group AppView is configured.
 */
import {type BskyAgent, XRPCError} from '@atproto/api'
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

describe('getTimeline (W2-T10 public feed transport)', () => {
  const GROUP = 'at://did:example:o/com.authorityone.group.profile/1'
  const configured = loadGroupWithEnv({
    EXPO_PUBLIC_AUTHORITYONE_GROUP_PROXY_DID: GROUP_DID,
    EXPO_PUBLIC_AUTHORITYONE_GROUP_SERVICE_ID: 'ao_group',
  })
  const unconfigured = loadGroupWithEnv({
    EXPO_PUBLIC_AUTHORITYONE_GROUP_PROXY_DID: undefined,
  })

  function feedItem(n: number) {
    return {
      post: {
        uri: `at://did:example:a/app.bsky.feed.post/${n}`,
        cid: `cid${n}`,
        author: {did: 'did:example:a', handle: 'a.test'},
        record: {},
        indexedAt: '2026-10-29T00:00:00.000Z',
      },
    }
  }

  function agentReturning(data: unknown) {
    const call = jest.fn((..._args: unknown[]) =>
      Promise.resolve({success: true, headers: {}, data}),
    )
    return {agent: {call} as unknown as BskyAgent, call}
  }

  it('DID unset: throws GroupAppViewUnavailableError with today’s reason', async () => {
    const {agent, call} = makeAgent()
    const err = await unconfigured
      .fetchGroupTimeline(agent, {group: GROUP})
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(unconfigured.GroupAppViewUnavailableError)
    expect((err as Error).message).toBe(
      'group AppView not available: EXPO_PUBLIC_AUTHORITYONE_GROUP_PROXY_DID unset',
    )
    expect(call).not.toHaveBeenCalled()
  })

  it('DID set: calls getTimeline with the lexicon params and default limit', async () => {
    const {agent, call} = agentReturning({feed: []})
    await configured.fetchGroupTimeline(agent, {group: GROUP, cursor: 'c1'})
    expect(call.mock.calls[0]).toEqual([
      'com.authorityone.group.getTimeline',
      {group: GROUP, limit: 50, cursor: 'c1'},
      undefined,
      {headers: {'atproto-proxy': `${GROUP_DID}#ao_group`}},
    ])
  })

  it('clamps limit to the lexicon range 1..100', async () => {
    const {agent, call} = agentReturning({feed: []})
    await configured.fetchGroupTimeline(agent, {group: GROUP, limit: 500})
    await configured.fetchGroupTimeline(agent, {group: GROUP, limit: 0})
    expect((call.mock.calls[0][1] as {limit: number}).limit).toBe(100)
    expect((call.mock.calls[1][1] as {limit: number}).limit).toBe(1)
  })

  it('never fetches a members-only community id', async () => {
    const {agent, call} = agentReturning({feed: []})
    for (const id of ['members-community-1', 'did:example:c', '']) {
      await expect(
        configured.fetchGroupTimeline(agent, {group: id}),
      ).rejects.toBeInstanceOf(configured.GroupAppViewUnavailableError)
    }
    expect(call).not.toHaveBeenCalled()
  })

  it('maps the response: keeps post views and cursor, drops malformed items', async () => {
    const {agent} = agentReturning({
      cursor: 'next',
      feed: [feedItem(1), null, {post: {uri: 'x', cid: 'y'}}, {}, feedItem(2)],
    })
    const res = await configured.fetchGroupTimeline(agent, {group: GROUP})
    expect(res.cursor).toBe('next')
    expect(res.feed.map(i => i.post.uri)).toEqual([
      'at://did:example:a/app.bsky.feed.post/1',
      'at://did:example:a/app.bsky.feed.post/2',
    ])
  })

  it('omits an empty or non-string cursor', async () => {
    const {agent} = agentReturning({cursor: '', feed: [feedItem(1)]})
    const res = await configured.fetchGroupTimeline(agent, {group: GROUP})
    expect('cursor' in res).toBe(false)
  })

  it('a body without a feed array is a GroupTimelineResponseError', async () => {
    for (const body of [undefined, 'x', {cursor: 'c'}, {feed: {}}]) {
      const {agent} = agentReturning(body)
      await expect(
        configured.fetchGroupTimeline(agent, {group: GROUP}),
      ).rejects.toBeInstanceOf(configured.GroupTimelineResponseError)
    }
  })

  it('XRPC errors (GroupNotFound, NotAuthorized) surface unchanged', async () => {
    for (const name of ['GroupNotFound', 'NotAuthorized']) {
      const xrpcErr = new XRPCError(400, name, 'nope')
      const call = jest.fn(() => Promise.reject(xrpcErr))
      const agent = {call} as unknown as BskyAgent
      const err = await configured
        .fetchGroupTimeline(agent, {group: GROUP})
        .catch((e: unknown) => e)
      expect(err).toBe(xrpcErr)
      expect(configured.isGroupAppViewUnavailableError(err)).toBe(false)
    }
  })
})
