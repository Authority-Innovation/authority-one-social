/**
 * The session rules without a device: camera off by default and published
 * only after a camera token; blind sent only on the owner's own session, in
 * the ruling 2 shape; the start call carries `agentDid` only.
 */
import {beforeEach, describe, expect, it, jest} from '@jest/globals'

// The real api module pulls in the runtime auth helpers; the controller gets
// a fake api instead.
jest.mock('../api', () => ({
  startLiveSession: jest.fn(),
  requestLiveToken: jest.fn(),
  endLiveSession: jest.fn(),
}))

import {
  AGENT_DID,
  CAMERA_TOKEN_FIXTURE,
  SESSION_FIXTURE,
} from '../__fixtures__/piece1Live'
import {createFakeRoom} from '../__fixtures__/fakeRoom'
import {type LiveResult, type LiveSession, type LiveToken} from '../api'
import {
  createLiveSessionController,
  type LiveApi,
  type LiveSessionState,
} from '../session'

function setup({
  start = {ok: true, data: SESSION_FIXTURE} as LiveResult<LiveSession>,
  token = {ok: true, data: CAMERA_TOKEN_FIXTURE} as LiveResult<LiveToken>,
} = {}) {
  const log: string[] = []
  const fake = createFakeRoom(log)
  const api = {
    startLiveSession: jest.fn(async (args: {agentDid: string}) => {
      log.push(`api.start(${JSON.stringify(args)})`)
      return start
    }),
    requestLiveToken: jest.fn(async (args: {sid: string; camera?: boolean}) => {
      log.push(`api.token(${JSON.stringify(args)})`)
      return token
    }),
    endLiveSession: jest.fn(async (args: {sid: string}) => {
      log.push(`api.end(${args.sid})`)
      return {ok: true, data: null} as LiveResult<null>
    }),
  }
  const states: LiveSessionState[] = []
  const roomFactory = jest.fn(() => fake.room)
  const c = createLiveSessionController({
    agentDid: AGENT_DID,
    roomFactory,
    onChange: s => states.push(s),
    api: api as unknown as LiveApi,
  })
  const last = () => states[states.length - 1]
  return {c, api, fake, log, last, roomFactory}
}

describe('start', () => {
  it('asks with {agentDid} only, joins with the owner token, mic on, camera off', async () => {
    const {c, api, fake, last, roomFactory} = setup()
    await c.start()
    expect(api.startLiveSession).toHaveBeenCalledWith({agentDid: AGENT_DID})
    expect(roomFactory).toHaveBeenCalledWith({sid: SESSION_FIXTURE.sid})
    expect(fake.calls).toEqual([
      {
        op: 'connect',
        wsUrl: SESSION_FIXTURE.wsUrl,
        token: SESSION_FIXTURE.token,
      },
      {op: 'mic', on: true},
    ])
    expect(last()).toMatchObject({
      phase: 'connected',
      micOn: true,
      cameraOn: false,
    })
    expect(fake.cameraPublishes()).toBe(0)
  })

  it('a refused start joins nothing', async () => {
    const {c, fake, last} = setup({
      start: {ok: false, error: {kind: 'not_found'}},
    })
    await c.start()
    expect(fake.calls).toEqual([])
    expect(last()).toMatchObject({phase: 'failed', error: 'not_found'})
  })

  it('leaving before the runtime answers ends the session it made, and joins nothing', async () => {
    const {c, api, fake} = setup()
    const started = c.start()
    await c.end()
    await started
    expect(api.endLiveSession).toHaveBeenCalledWith({sid: SESSION_FIXTURE.sid})
    expect(fake.calls.filter(x => x.op === 'connect')).toEqual([])
  })

  it('the stage track shows when the agent publishes it', async () => {
    const {c, fake, last} = setup()
    await c.start()
    fake.showStage('stage-ref')
    expect(last().stage).toEqual({kind: 'stage', ref: 'stage-ref'})
  })
})

describe('camera: off by default, publishes only when on', () => {
  it('turning it on asks for a camera token, rejoins with it, then publishes', async () => {
    const {c, log, last} = setup()
    await c.start()
    log.length = 0
    await c.setCamera(true)
    expect(log).toEqual([
      `api.token(${JSON.stringify({sid: SESSION_FIXTURE.sid, camera: true})})`,
      'room.disconnect',
      'room.connect',
      'room.mic(true)',
      'room.camera(true)',
    ])
    expect(last()).toMatchObject({cameraOn: true, cameraPending: false})
  })

  it('rejoins with the camera token, not the first one', async () => {
    const {c, fake} = setup()
    await c.start()
    await c.setCamera(true)
    const connects = fake.calls.filter(x => x.op === 'connect')
    expect(connects.map(x => 'token' in x && x.token)).toEqual([
      SESSION_FIXTURE.token,
      CAMERA_TOKEN_FIXTURE.token,
    ])
  })

  it('a refused camera token publishes nothing', async () => {
    const {c, fake, last} = setup({
      token: {ok: false, error: {kind: 'not_found'}},
    })
    await c.start()
    await c.setCamera(true)
    expect(fake.cameraPublishes()).toBe(0)
    expect(last()).toMatchObject({cameraOn: false, cameraPending: false})
  })

  it('nothing is published before the session is connected', async () => {
    const {c, api, fake} = setup()
    await c.setCamera(true)
    expect(api.requestLiveToken).not.toHaveBeenCalled()
    expect(fake.cameraPublishes()).toBe(0)
  })

  it('turning it off unpublishes', async () => {
    const {c, fake, last} = setup()
    await c.start()
    await c.setCamera(true)
    await c.setCamera(false)
    expect(fake.calls[fake.calls.length - 1]).toEqual({op: 'camera', on: false})
    expect(last().cameraOn).toBe(false)
  })
})

describe('blind (ruling 2, owner-only)', () => {
  it('sends the exact wire format on stage.reply, reliably', async () => {
    const {c, fake, last} = setup()
    await c.start()
    expect(await c.setBlind(true)).toBe(true)
    expect(await c.setBlind(false, 'screen_share')).toBe(true)
    expect(fake.calls.filter(x => x.op === 'data')).toEqual([
      {
        op: 'data',
        text: '{"t":"blind","on":true,"src":"*"}',
        topic: 'stage.reply',
        reliable: true,
      },
      {
        op: 'data',
        text: '{"t":"blind","on":false,"src":"screen_share"}',
        topic: 'stage.reply',
        reliable: true,
      },
    ])
    // Only the all-sources switch drives the screen's blind state.
    expect(last().blindOn).toBe(true)
  })

  it('is sent only on a session this owner started and joined', async () => {
    const refused = setup({start: {ok: false, error: {kind: 'not_found'}}})
    await refused.c.start()
    expect(await refused.c.setBlind(true)).toBe(false)

    const notStarted = setup()
    expect(await notStarted.c.setBlind(true)).toBe(false)

    const ended = setup()
    await ended.c.start()
    await ended.c.end()
    expect(await ended.c.setBlind(true)).toBe(false)

    for (const s of [refused, notStarted, ended]) {
      expect(s.fake.calls.filter(x => x.op === 'data')).toEqual([])
    }
  })

  it('a bad source id sends nothing', async () => {
    const {c, fake} = setup()
    await c.start()
    expect(await c.setBlind(true, 'a b')).toBe(false)
    expect(fake.calls.filter(x => x.op === 'data')).toEqual([])
  })
})

describe('end', () => {
  it('leaves the room and ends the session', async () => {
    const {c, api, fake, last} = setup()
    await c.start()
    await c.end()
    expect(fake.calls[fake.calls.length - 1]).toEqual({op: 'disconnect'})
    expect(api.endLiveSession).toHaveBeenCalledWith({sid: SESSION_FIXTURE.sid})
    expect(last()).toMatchObject({phase: 'ended', micOn: false, stage: null})
  })
})
