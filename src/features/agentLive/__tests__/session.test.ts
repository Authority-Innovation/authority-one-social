/**
 * The session rules without a device, over the REAL api module answering
 * with the runtime's recorded replies (__fixtures__/live.json):
 * - B2: nothing starts until the owner taps; no media before the consent
 *   sheet; the mic publishes only after Go live;
 * - H1: drops the media server reports end the session or rejoin with a
 *   fresh token; never a "connected" screen on a dead room;
 * - H2: /end goes out first, with the session account's bearer, and is
 *   retried;
 * - H3: any failure after the session exists leaves the room and ends it;
 * - M1/M3: tokens are proven with the device key; the camera rejoin is
 *   proven, and recovers without the camera if it fails;
 * - ruling 2: the blind message, owner-only.
 */
import {beforeEach, describe, expect, it, jest} from '@jest/globals'
import {ed25519} from '@noble/curves/ed25519'

const BEARER = 'opaque-owner-session-bearer'

jest.mock('#/lib/agent-runtime/authToken', () => ({
  getAgentRuntimeAccessToken: jest.fn(),
}))
jest.mock('#/lib/agent-runtime/config', () => ({
  AGENT_RUNTIME_BASE_URL: 'https://runtime.test',
}))
jest.mock('#/state/persisted', () => ({get: jest.fn()}))
jest.mock('#/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))
// The controller gets its device key and media access injected.
jest.mock('../deviceKey', () => ({getDeviceKey: jest.fn()}))
jest.mock('../permissions', () => ({
  requestMicAccess: jest.fn(),
  requestCameraAccess: jest.fn(),
}))

import {getAgentRuntimeAccessToken} from '#/lib/agent-runtime/authToken'
import * as persisted from '#/state/persisted'
import {createFakeRoom} from '../__fixtures__/fakeRoom'
import LEGACY from '../__fixtures__/legacy-ac11bd0.json'
import {createRuntimeFetch} from '../__fixtures__/runtimeFetch'
import {
  AGENT_DID,
  DEVICE_SEED,
  LIVE,
  OWNER_DID,
  reply,
  SID,
  tokenOf,
} from '../__fixtures__/runtimeLive'
import {
  b64urlDecode,
  deviceKeyFromSeed,
  joinClaimsOf,
  joinProofMessage,
} from '../pop'
import {
  endOpenLiveSessions,
  forgetLiveSessionsForTests,
  openLiveSessionCount,
} from '../registry'
import {
  createLiveSessionController,
  END_RETRY_DELAYS_MS,
  END_SLOW_MS,
  type LiveDeps,
  type LiveSessionState,
  REJOIN_BACKOFF_MS,
  STAGE_WAIT_MS,
} from '../session'

const EXP = reply('consentAdmitted').body.expiresAt as number
const mockPersisted = persisted.get as unknown as jest.Mock<
  (k: string) => unknown
>
const mockBearer = getAgentRuntimeAccessToken as jest.Mock<
  () => Promise<string | null>
>

function signedInAs(did: string | null, bearer: string | null) {
  mockPersisted.mockImplementation(() => ({
    currentAccount: did ? {did} : undefined,
  }))
  mockBearer.mockResolvedValue(bearer)
}

beforeEach(() => {
  mockBearer.mockReset()
  signedInAs(OWNER_DID, BEARER)
  forgetLiveSessionsForTests()
})

const E503 = {status: 503, body: {error: 'unavailable'}}

function setup({
  mic = 'granted',
  camera = 'granted',
  key = true,
  nowS = EXP - 30,
  roomFactory,
  held = false,
}: {
  mic?: 'granted' | 'denied'
  camera?: 'granted' | 'denied'
  key?: boolean
  /** This device held the reused session before (heldSessions). */
  held?: boolean
  nowS?: number
  roomFactory?: () => never
} = {}) {
  const log: string[] = []
  const rt = createRuntimeFetch()
  ;(globalThis as {fetch: unknown}).fetch = (
    url: string,
    init: RequestInit,
  ) => {
    log.push(`api ${new URL(url).pathname.replace(SID, ':sid')}`)
    return rt.fetch(url, init)
  }
  const fake = createFakeRoom(log)
  // A clock the test can move, and timers it can fire.
  const clock = {now: nowS}
  const timers: Array<{ms: number; cb: () => void; cancelled: boolean}> = []
  const deps: Partial<LiveDeps> = {
    getDeviceKey: jest.fn(() =>
      Promise.resolve(key ? deviceKeyFromSeed(DEVICE_SEED) : null),
    ),
    wasHeldHere: jest.fn(() => Promise.resolve(held)),
    markHeldHere: jest.fn(() => Promise.resolve()),
    requestMicAccess: jest.fn(() => Promise.resolve(mic)),
    requestCameraAccess: jest.fn(() => Promise.resolve(camera)),
    sleep: jest.fn(() => Promise.resolve()),
    nowS: () => clock.now,
    setTimer: (ms: number, cb: () => void) => {
      const t = {ms, cb, cancelled: false}
      timers.push(t)
      return () => {
        t.cancelled = true
      }
    },
    onEndGaveUp: jest.fn(),
  }
  const states: LiveSessionState[] = []
  const factory = jest.fn(roomFactory ?? (() => fake.room))
  const c = createLiveSessionController({
    agentDid: AGENT_DID,
    roomFactory: factory,
    onChange: s => states.push(s),
    deps,
  })
  const last = () => states[states.length - 1] ?? {phase: 'idle'}
  return {c, rt, fake, log, last, deps, factory, states, clock, timers}
}

type Env = ReturnType<typeof setup>

async function toConsent(env: Env, start = 'startAwaitingConsent') {
  env.rt.on('/live/sessions', start)
  await env.c.begin()
}

async function toLive(env: Env) {
  await toConsent(env)
  env.rt.on('/live/sessions/:sid/consent', 'consentAdmitted')
  env.rt.on('/live/join/prove', 'proveExchange')
  await env.c.submitConsent({ai_process: true, transcribe: true})
}

const flush = async (turns = 100) => {
  for (let i = 0; i < turns; i++) await Promise.resolve()
}

/** The proof a request carried verifies under the fixture device key. */
function proofVerifies(token: string, sig: string) {
  return ed25519.verify(
    b64urlDecode(sig),
    joinProofMessage(joinClaimsOf(token)!),
    b64urlDecode(LIVE.device.publicKey),
  )
}

describe('B2: nothing before the owner taps, no media before consent', () => {
  it('making the controller sends nothing and joins nothing', () => {
    const env = setup()
    expect(env.rt.sent).toEqual([])
    expect(env.factory).not.toHaveBeenCalled()
    expect(env.last().phase).toBe('idle')
  })

  it('begin: mic access, then the start call, then the sheet, with no media', async () => {
    const env = setup()
    await toConsent(env)
    expect(env.deps.requestMicAccess).toHaveBeenCalled()
    expect(env.rt.sent.map(s => s.path)).toEqual(['/live/sessions'])
    expect(env.rt.sent[0].body).toEqual({
      agentDid: AGENT_DID,
      devicePubKey: LIVE.device.publicKey,
    })
    expect(env.last()).toMatchObject({
      phase: 'consent',
      consentRequired: reply('startAwaitingConsent').body.consentRequired,
      recordPolicy: 'off',
      micOn: false,
    })
    expect(env.factory).not.toHaveBeenCalled()
    expect(env.fake.calls).toEqual([])
  })

  it('mic access refused: nothing is created on the runtime', async () => {
    const env = setup({mic: 'denied'})
    await env.c.begin()
    expect(env.last()).toMatchObject({phase: 'failed', error: 'mic_denied'})
    expect(env.rt.sent).toEqual([])
  })

  it('signed out: nothing is sent', async () => {
    signedInAs(null, null)
    const env = setup()
    await env.c.begin()
    expect(env.last()).toMatchObject({phase: 'failed', error: 'signed_out'})
    expect(env.rt.sent).toEqual([])
  })

  it('Go live: every kind decided, then the proof, then the join, then the mic', async () => {
    const env = setup()
    await toLive(env)
    expect(env.rt.to('/live/sessions/:sid/consent')[0].body).toEqual({
      decisions: {
        record_audio: 'refused',
        record_video: 'refused',
        transcribe: 'given',
        ai_process: 'given',
        remember: 'refused',
      },
      textVersion: 'one-app-v1',
      devicePubKey: LIVE.device.publicKey,
    })
    const token = tokenOf('consentAdmitted')
    const prove = env.rt.to('/live/join/prove')[0]
    expect(prove.body!.token).toBe(token)
    // R2 rev 4: the proof always trades (no exchange flag sent), and the
    // RETURNED token joins.
    expect(prove.body).toEqual({token, sig: prove.body!.sig})
    expect(proofVerifies(token, String(prove.body!.sig))).toBe(true)
    expect(env.log).toEqual([
      'api /live/sessions',
      'api /live/sessions/:sid/consent',
      'api /live/join/prove',
      'room.connect',
      'room.mic(true)',
    ])
    expect(env.fake.connects()[0]).toEqual({
      op: 'connect',
      wsUrl:
        reply('consentAdmitted').body.wsUrl ??
        reply('startAwaitingConsent').body.wsUrl,
      token: tokenOf('proveExchange'),
    })
    expect(tokenOf('proveExchange')).not.toBe(token)
    expect(env.last()).toMatchObject({
      phase: 'connected',
      micOn: true,
      cameraOn: false,
    })
  })

  it('without AI processing nothing is sent', async () => {
    const env = setup()
    await toConsent(env)
    await env.c.submitConsent({record_audio: true})
    expect(env.rt.to('/live/sessions/:sid/consent')).toEqual([])
    expect(env.last().phase).toBe('consent')
  })

  it('not admitted: failed, and the session is ended', async () => {
    const env = setup()
    await toConsent(env)
    env.rt.on('/live/sessions/:sid/consent', 'consentPartial')
    env.rt.on('/live/sessions/:sid/end', 'end')
    await env.c.submitConsent({ai_process: true})
    expect(env.last()).toMatchObject({
      phase: 'failed',
      error: 'consent_incomplete',
    })
    expect(env.rt.to('/live/sessions/:sid/end')).toHaveLength(1)
    expect(env.fake.calls.filter(x => x.op === 'mic')).toEqual([])
  })

  it('cancel on the sheet ends the session; nothing was published', async () => {
    const env = setup()
    await toConsent(env)
    env.rt.on('/live/sessions/:sid/end', 'end')
    await env.c.end()
    expect(env.rt.to('/live/sessions/:sid/end')).toHaveLength(1)
    expect(env.fake.calls).toEqual([])
  })

  it('leaving while the start call is out: the new session is ended, nothing joins', async () => {
    const env = setup()
    let release!: () => void
    const gate = new Promise<void>(r => (release = r))
    const realFetch = (
      globalThis as {fetch: (u: string, i: RequestInit) => Promise<Response>}
    ).fetch
    ;(globalThis as {fetch: unknown}).fetch = async (
      u: string,
      i: RequestInit,
    ) => {
      if (new URL(u).pathname === '/live/sessions') await gate
      return realFetch(u, i)
    }
    env.rt.on('/live/sessions', 'startAwaitingConsent')
    env.rt.on('/live/sessions/:sid/end', 'end')
    const begun = env.c.begin()
    await flush()
    await env.c.end()
    release()
    await begun
    expect(env.rt.to('/live/sessions/:sid/end')).toHaveLength(1)
    expect(env.factory).not.toHaveBeenCalled()
    expect(env.last().phase).toBe('ended')
  })
})

it('the stage track shows when the agent publishes it', async () => {
  const env = setup()
  await toLive(env)
  env.fake.showStage('agent-stage')
  expect(env.last().stage).toEqual({kind: 'stage', ref: 'agent-stage'})
})

describe('M2: a session already open (reused)', () => {
  it('asks first; continuing goes to the sheet', async () => {
    const env = setup()
    await toConsent(env, 'startReused')
    expect(env.last().phase).toBe('reuse')
    await env.c.continueHere()
    expect(env.last().phase).toBe('consent')
  })

  it('“not now” leaves the open session alone (no /end)', async () => {
    const env = setup()
    await toConsent(env, 'startReused')
    await env.c.end()
    expect(env.rt.to('/live/sessions/:sid/end')).toEqual([])
    expect(env.last()).toMatchObject({phase: 'ended', endReason: 'local'})
  })

  it('opened on another device while live: ended here, the session left running', async () => {
    const env = setup()
    await toLive(env)
    env.fake.drop('duplicate_identity')
    await flush()
    expect(env.last()).toMatchObject({
      phase: 'ended',
      endReason: 'other_device',
      micOn: false,
    })
    expect(env.rt.to('/live/sessions/:sid/end')).toEqual([])
  })
})

describe('H1: the media connection', () => {
  it.each<['removed' | 'room_deleted', string]>([
    ['removed', 'removed'],
    ['room_deleted', 'ended_elsewhere'],
  ])(
    'a drop for %s ends the session (%s), mic off, room left',
    async (reason, endReason) => {
      const env = setup()
      await toLive(env)
      env.fake.drop(reason)
      await flush()
      expect(env.last()).toMatchObject({
        phase: 'ended',
        endReason,
        micOn: false,
        stage: null,
      })
      expect(env.fake.calls[env.fake.calls.length - 1].op).toBe('disconnect')
      // The runtime ended or removed us: it owns the session now.
      expect(env.rt.to('/live/sessions/:sid/end')).toEqual([])
      expect(env.fake.listening()).toBe(0)
    },
  )

  it('a CLIENT_INITIATED drop we didn’t ask for is FINAL: ended, runtime session ended, no rejoin', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/end', 'end')
    env.fake.drop('client')
    await flush()
    expect(env.last()).toMatchObject({
      phase: 'ended',
      endReason: 'local',
      micOn: false,
    })
    expect(env.rt.to('/live/sessions/:sid/token')).toEqual([])
    expect(env.rt.to('/live/sessions/:sid/end')).toHaveLength(1)
  })

  it('USER_REJECTED is FINAL: ended, no rejoin', async () => {
    const env = setup()
    await toLive(env)
    env.fake.drop('rejected')
    await flush()
    expect(env.last()).toMatchObject({phase: 'ended', endReason: 'removed'})
    expect(env.rt.to('/live/sessions/:sid/token')).toEqual([])
  })

  it('one rejoin at a time: a second drop during a rejoin starts nothing more', async () => {
    const env = setup()
    await toLive(env)
    let release!: () => void
    ;(env.deps.sleep as jest.Mock).mockImplementationOnce(
      () => new Promise<void>(r => (release = r)),
    )
    env.rt.on('/live/sessions/:sid/token', 'tokenForJoin')
    env.rt.on('/live/join/prove', 'proveExchange')
    env.fake.drop('network')
    await flush()
    env.fake.drop('network')
    await flush()
    release()
    await flush(200)
    expect(env.rt.to('/live/sessions/:sid/token')).toHaveLength(1)
    expect(env.last().phase).toBe('connected')
  })

  it('the SDK’s own resume: reconnecting, then connected', async () => {
    const env = setup()
    await toLive(env)
    env.fake.emit({type: 'reconnecting'})
    expect(env.last().phase).toBe('reconnecting')
    env.fake.emit({type: 'reconnected'})
    expect(env.last().phase).toBe('connected')
  })

  it('a network drop rejoins with a fresh, proven token and restores the mic', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/token', 'tokenForJoin')
    env.rt.on('/live/join/prove', 'proveExchange')
    env.fake.drop('network')
    await flush()
    const t = env.rt.to('/live/sessions/:sid/token')
    expect(t[0].body).toEqual({
      camera: false,
      devicePubKey: LIVE.device.publicKey,
    })
    // Each join is on the token the exchange returned (R2 v2).
    expect(env.fake.connects().map(c => c.token)).toEqual([
      tokenOf('proveExchange'),
      tokenOf('proveExchange'),
    ])
    const sig = String(env.rt.to('/live/join/prove')[1].body!.sig)
    expect(sig).toBe(LIVE.proofs.tokenForJoin)
    expect(env.last()).toMatchObject({phase: 'connected', micOn: true})
  })

  it.each([
    ['tokenAfterEnd', {phase: 'ended', endReason: 'ended_elsewhere'}],
    ['tokenBeforeConsent', {phase: 'ended', endReason: 'consent_withdrawn'}],
  ])('a drop, then the token reply %s → %j', async (name, expected) => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/token', name)
    env.fake.drop('network')
    await flush()
    expect(env.last()).toMatchObject({...expected, micOn: false})
  })

  it('a drop it can’t recover from: backoff 1, 2, 4, 8, 16 s, then a visible “reconnect failed”, room left, session ended', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/token', E503, E503, E503, E503, E503)
    env.rt.on('/live/sessions/:sid/end', 'end')
    env.fake.drop('network')
    await flush(400)
    expect((env.deps.sleep as jest.Mock).mock.calls.map(c => c[0])).toEqual(
      REJOIN_BACKOFF_MS,
    )
    expect(REJOIN_BACKOFF_MS).toEqual([1000, 2000, 4000, 8000, 16000])
    expect(env.rt.to('/live/sessions/:sid/token')).toHaveLength(5)
    expect(env.last()).toMatchObject({
      phase: 'failed',
      error: 'reconnect_failed',
      micOn: false,
    })
    expect(env.rt.to('/live/sessions/:sid/end')).toHaveLength(1)
  })

  it('a server without the join exchange fails visibly as server_outdated, and never joins', async () => {
    const env = setup()
    await toConsent(env)
    env.rt.on('/live/sessions/:sid/consent', 'consentAdmitted')
    env.rt.on('/live/join/prove', LEGACY.proveOk)
    env.rt.on('/live/sessions/:sid/end', 'end')
    await env.c.submitConsent({ai_process: true, transcribe: true})
    await flush()
    expect(env.fake.connects()).toEqual([])
    expect(env.last()).toMatchObject({
      phase: 'failed',
      error: 'server_outdated',
    })
  })

  it('a rejoin onto a server without the exchange stops at once as server_outdated', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/token', 'tokenForJoin', 'tokenCamera')
    env.rt.on('/live/join/prove', LEGACY.proveOk)
    env.rt.on('/live/sessions/:sid/end', 'end')
    env.fake.drop('network')
    await flush(400)
    // No retry burns the backoff: an old server won't get better.
    expect(env.rt.to('/live/sessions/:sid/token')).toHaveLength(1)
    expect(env.fake.connects()).toHaveLength(1)
    expect(env.last()).toMatchObject({
      phase: 'failed',
      error: 'server_outdated',
    })
  })

  it('R2: every rejoin attempt is a fresh token from /token, proven, then a new join (never a resume)', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/token', 'tokenForJoin', 'tokenCamera')
    env.rt.on('/live/join/prove', 'proveExchange', 'proveExchange')
    // The first rejoin's join fails (e.g. the edge refused it); the second goes through.
    env.fake.fail('connect')
    env.fake.drop('network')
    await flush(400)
    const tokens = env.rt.to('/live/sessions/:sid/token')
    expect(tokens).toHaveLength(2)
    expect(
      tokens.every(t => t.body!.devicePubKey === LIVE.device.publicKey),
    ).toBe(true)
    // Each fresh token was proven before its join.
    const proved = env.rt
      .to('/live/join/prove')
      .slice(1)
      .map(p => p.body!.token)
    expect(proved).toEqual([tokenOf('tokenForJoin'), tokenOf('tokenCamera')])
    // The joins used the fresh tokens, never the first (single-use) one again.
    // Every join is on an exchanged token; no token sent to /prove ever joins.
    const sentToProve = new Set(
      env.rt.to('/live/join/prove').map(p => p.body!.token),
    )
    expect(env.fake.connects()).toHaveLength(3)
    for (const c of env.fake.connects()) {
      expect(c.token).toBe(tokenOf('proveExchange'))
      expect(sentToProve.has(c.token)).toBe(false)
    }
    expect((env.deps.sleep as jest.Mock).mock.calls.map(c => c[0])).toEqual([
      1000, 2000,
    ])
    expect(env.last()).toMatchObject({phase: 'connected', micOn: true})
  })

  it('R2: “Reconnecting” throughout the rejoin, and never “connected” on a dead room', async () => {
    const env = setup()
    await toLive(env)
    let release!: () => void
    ;(env.deps.sleep as jest.Mock).mockImplementationOnce(
      () => new Promise<void>(r => (release = r)),
    )
    env.rt.on('/live/sessions/:sid/token', 'tokenForJoin')
    env.rt.on('/live/join/prove', 'proveExchange')
    env.fake.drop('network')
    await flush()
    expect(env.last().phase).toBe('reconnecting')
    // Controls are off while reconnecting.
    await env.c.setMic(false)
    expect(env.fake.calls.filter(c => c.op === 'mic' && !c.on)).toEqual([])
    release()
    await flush()
    expect(env.last().phase).toBe('connected')
  })

  it('a failing control is a notice, never an unhandled rejection', async () => {
    const env = setup()
    await toLive(env)
    env.fake.fail('mic')
    await expect(env.c.setMic(false)).resolves.toBeUndefined()
    expect(env.last()).toMatchObject({micOn: true, notice: 'action_failed'})
    env.fake.fail('data')
    await expect(env.c.setBlind(true)).resolves.toBe(false)
    expect(env.last().blindOn).toBe(false)
  })
})

describe('review f2caccaa', () => {
  const unboundLive = async (env: Env, start = 'startAwaitingConsent') => {
    await toConsent(env, start)
    if (start === 'startReused') await env.c.continueHere()
    env.rt.on('/live/sessions/:sid/consent', {
      status: 200,
      body: {...reply('consentAdmitted').body, popRequired: false},
    })
    await env.c.submitConsent({ai_process: true})
  }
  const unboundToken = {
    status: 200,
    body: {...reply('tokenUnbound').body, popRequired: false},
  }

  it.each<[string, string, Record<string, unknown>]>([
    // Ruling (review 7919b5692 item 8): no guessing "still open" from
    // removals; a continued session runs out like a new one.
    // A continued session (the server said `reused`) whose joins are refused
    // is held elsewhere: said, and left running (review 563477989 R1).
    [
      'startReused',
      'a continued session',
      {phase: 'ended', endReason: 'still_open_elsewhere'},
    ],
    [
      'startAwaitingConsent',
      'a new session',
      {phase: 'failed', error: 'reconnect_failed'},
    ],
  ])(
    'F2: an unbound session never admitted (%s: %s) runs out of budget and says so',
    async (start, _name, expected) => {
      const env = setup({key: false})
      await unboundLive(env, start)
      for (let i = 0; i < 12; i++)
        env.rt.on('/live/sessions/:sid/token', unboundToken)
      // Every join is removed right after it connects (the other holder stays).
      const connect = env.fake.room.connect
      env.fake.room.connect = async args => {
        await connect(args)
        queueMicrotask(() => env.fake.drop('removed'))
      }
      env.fake.drop('removed')
      for (
        let i = 0;
        i < 60 && !['ended', 'failed'].includes(env.last().phase);
        i++
      ) {
        await flush(40)
      }
      expect(env.last()).toMatchObject({...expected, micOn: false})
      expect(env.rt.to('/live/sessions/:sid/token').length).toBeLessThanOrEqual(
        5,
      )
    },
  )

  it('F2: a removal long after the last rejoin starts a fresh budget', async () => {
    const env = setup({key: false})
    await unboundLive(env)
    env.rt.on('/live/sessions/:sid/token', unboundToken, unboundToken)
    env.fake.drop('removed')
    await flush(200)
    expect(env.last().phase).toBe('connected')
    env.clock.now += 60
    env.fake.drop('removed')
    await flush(200)
    expect(env.last().phase).toBe('connected')
    expect((env.deps.sleep as jest.Mock).mock.calls.map(c => c[0])).toEqual([
      1000, 1000,
    ])
  })

  it('F3: a drop during the first join’s mic call never shows “connected” before the rejoin decides', async () => {
    const env = setup()
    await toConsent(env)
    env.rt.on('/live/sessions/:sid/consent', 'consentAdmitted')
    env.rt.on('/live/join/prove', 'proveExchange', 'proveExchange')
    env.rt.on('/live/sessions/:sid/token', 'tokenForJoin')
    let releaseMic!: () => void
    const mic = env.fake.room.setMicrophoneEnabled
    let first = true
    env.fake.room.setMicrophoneEnabled = on => {
      if (!first) return mic(on)
      first = false
      return new Promise<void>(r => (releaseMic = () => void mic(on).then(r)))
    }
    let releaseSleep!: () => void
    ;(env.deps.sleep as jest.Mock).mockImplementationOnce(
      () => new Promise<void>(r => (releaseSleep = r)),
    )
    const submitted = env.c.submitConsent({ai_process: true})
    await flush()
    env.fake.drop('network')
    await flush()
    releaseMic()
    await submitted
    await flush()
    // The rejoin is still in its backoff: never connected meanwhile.
    expect(env.states.map(st => st.phase)).not.toContain('connected')
    expect(env.last().phase).toBe('reconnecting')
    releaseSleep()
    await flush(200)
    expect(env.last()).toMatchObject({phase: 'connected', micOn: true})
  })

  it('F4: a drop while the camera token is minted aborts the camera; the rejoin owns the room', async () => {
    const env = setup()
    await toLive(env)
    let releaseMint!: () => void
    const gate = new Promise<void>(r => (releaseMint = r))
    const real = (
      globalThis as {fetch: (u: string, i: RequestInit) => Promise<Response>}
    ).fetch
    let held = false
    ;(globalThis as {fetch: unknown}).fetch = async (
      u: string,
      i: RequestInit,
    ) => {
      if (!held && new URL(u).pathname.endsWith('/token')) {
        held = true
        await gate
      }
      return real(u, i)
    }
    // The rejoin's mint goes first (the camera's is held), then the camera's.
    env.rt.on('/live/sessions/:sid/token', 'tokenForJoin', 'tokenCamera')
    env.rt.on('/live/join/prove', 'proveExchange')
    const cam = env.c.setCamera(true)
    await flush()
    env.fake.drop('network')
    await flush()
    releaseMint()
    await cam
    await flush(300)
    expect(env.last()).toMatchObject({
      phase: 'connected',
      cameraOn: false,
      cameraPending: false,
      notice: 'camera_failed',
    })
    expect(env.fake.cameraPublishes()).toBe(0)
    // One rejoin connect after the first join; no camera swap on top.
    expect(env.fake.connects()).toHaveLength(2)
  })

  it('F5: a /end that gave up stays registered, and sign-out re-sends it', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/end', E503, E503, E503, E503)
    await env.c.end()
    expect(env.last()).toMatchObject({endFailed: true})
    expect(openLiveSessionCount()).toBe(1)
    env.rt.on('/live/sessions/:sid/end', 'end')
    endOpenLiveSessions()
    await flush()
    expect(env.rt.to('/live/sessions/:sid/end')).toHaveLength(5)
    expect(env.last()).toMatchObject({endFailed: false})
    expect(openLiveSessionCount()).toBe(0)
  })

  it('F5: leaving a reused session while it starts leaves the registry clean', async () => {
    const env = setup()
    let release!: () => void
    const gate = new Promise<void>(r => (release = r))
    const real = (
      globalThis as {fetch: (u: string, i: RequestInit) => Promise<Response>}
    ).fetch
    ;(globalThis as {fetch: unknown}).fetch = async (
      u: string,
      i: RequestInit,
    ) => {
      if (new URL(u).pathname === '/live/sessions') await gate
      return real(u, i)
    }
    env.rt.on('/live/sessions', 'startReused')
    const begun = env.c.begin()
    await flush()
    await env.c.end()
    release()
    await begun
    expect(openLiveSessionCount()).toBe(0)
    expect(env.rt.to('/live/sessions/:sid/end')).toEqual([])
  })

  it('d8f8f16e H2: a /end out for END_SLOW_MS is endSlow until it answers', async () => {
    const env = setup()
    await toLive(env)
    let release!: () => void
    const gate = new Promise<void>(r => (release = r))
    const fetch = env.rt.fetch
    ;(globalThis as {fetch: unknown}).fetch = async (
      u: string,
      i: RequestInit,
    ) => {
      if (new URL(u).pathname.endsWith('/end')) await gate
      return fetch(u, i)
    }
    env.rt.on('/live/sessions/:sid/end', 'end')
    const ended = env.c.end()
    await flush()
    expect(env.last()).toMatchObject({ending: true, endSlow: false})
    env.timers.find(t => t.ms === END_SLOW_MS)!.cb()
    expect(env.last()).toMatchObject({ending: true, endSlow: true})
    release()
    await ended
    expect(env.last()).toMatchObject({ending: false, endSlow: false})
    expect(env.timers.find(t => t.ms === END_SLOW_MS)!.cancelled).toBe(true)
  })

  it('d8f8f16e H1: a give-up while off screen is reported at once, and not again on detach', async () => {
    const env = setup()
    await toLive(env)
    env.c.setOnScreen(false)
    env.rt.on('/live/sessions/:sid/end', E503, E503, E503, E503)
    await env.c.end()
    expect(env.deps.onEndGaveUp).toHaveBeenCalledTimes(1)
    env.c.detach()
    expect(env.deps.onEndGaveUp).toHaveBeenCalledTimes(1)
  })

  it('F1: after the screen has gone, a /end that gives up is reported (onEndGaveUp)', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/end', E503, E503, E503, E503)
    env.c.detach()
    await env.c.end()
    expect(env.deps.onEndGaveUp).toHaveBeenCalledTimes(1)
  })

  it('F1: a give-up the owner already saw on screen is not reported again', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/end', E503, E503, E503, E503)
    await env.c.end()
    env.c.detach({failureSeen: true})
    expect(env.deps.onEndGaveUp).not.toHaveBeenCalled()
    env.c.detach()
    expect(env.deps.onEndGaveUp).toHaveBeenCalledTimes(1)
  })

  it('F6: a removal of a continued session long after it joined is a plain removal', async () => {
    const env = setup()
    await toConsent(env, 'startReused')
    await env.c.continueHere()
    env.rt.on('/live/sessions/:sid/consent', 'consentAdmitted')
    env.rt.on('/live/join/prove', 'proveExchange')
    await env.c.submitConsent({ai_process: true})
    env.clock.now += 120
    env.fake.drop('removed')
    await flush()
    expect(env.last()).toMatchObject({phase: 'ended', endReason: 'removed'})
  })

  it('a removal during the first join of a continued session is a refused rejoin: the ladder, not “removed” (ruling 7919b5692)', async () => {
    const env = setup()
    await toConsent(env, 'startReused')
    await env.c.continueHere()
    env.rt.on('/live/sessions/:sid/consent', 'consentAdmitted')
    env.rt.on('/live/join/prove', 'proveExchange', 'proveExchange')
    env.rt.on('/live/sessions/:sid/token', 'tokenForJoin')
    // The runtime refuses before connect() resolves (the other device holds it).
    const connect = env.fake.room.connect
    let refuse = true
    env.fake.room.connect = async args => {
      if (refuse) {
        refuse = false
        env.fake.drop('removed')
      }
      await connect(args)
    }
    await env.c.submitConsent({ai_process: true})
    await flush(400)
    expect(env.rt.to('/live/sessions/:sid/token')).toHaveLength(1)
    expect((env.deps.sleep as jest.Mock).mock.calls.map(c => c[0])).toEqual([
      1000,
    ])
    expect(env.last()).toMatchObject({phase: 'connected', micOn: true})
  })

  it('G4: a drop during the first connect still ends live with the mic on, and the stage wait armed', async () => {
    const env = setup()
    await toConsent(env)
    env.rt.on('/live/sessions/:sid/consent', 'consentAdmitted')
    env.rt.on('/live/join/prove', 'proveExchange', 'proveExchange')
    env.rt.on('/live/sessions/:sid/token', 'tokenForJoin')
    const connect = env.fake.room.connect
    let drop = true
    env.fake.room.connect = async args => {
      await connect(args)
      if (drop) {
        drop = false
        env.fake.drop('network')
      }
    }
    await env.c.submitConsent({ai_process: true})
    await flush(400)
    expect(env.last()).toMatchObject({phase: 'connected', micOn: true})
    expect(env.fake.calls.filter(c => c.op === 'mic').at(-1)).toMatchObject({
      on: true,
    })
    expect(env.timers.filter(t => t.ms === STAGE_WAIT_MS)).toHaveLength(1)
  })

  it('G3: an unbound continued session in a plain outage fails as a reconnect, with /end', async () => {
    const env = setup({key: false})
    await toConsent(env, 'startReused')
    await env.c.continueHere()
    env.rt.on('/live/sessions/:sid/consent', {
      status: 200,
      body: {...reply('consentAdmitted').body, popRequired: false},
    })
    await env.c.submitConsent({ai_process: true})
    env.rt.on('/live/sessions/:sid/token', E503, E503, E503, E503, E503)
    env.rt.on('/live/sessions/:sid/end', 'end')
    env.fake.drop('network')
    for (let i = 0; i < 60 && env.last().phase !== 'failed'; i++) {
      await flush(40)
    }
    await flush()
    expect(env.last()).toMatchObject({
      phase: 'failed',
      error: 'reconnect_failed',
    })
    expect(env.rt.to('/live/sessions/:sid/end')).toHaveLength(1)
  })

  it('F8: no stage 45 s after connecting shows “agent waiting”; the stage clears it', async () => {
    const env = setup()
    await toLive(env)
    const wait = env.timers.find(t => t.ms === STAGE_WAIT_MS)!
    expect(wait).toBeTruthy()
    wait.cb()
    expect(env.last().notice).toBe('agent_waiting')
    env.fake.showStage('agent-stage')
    expect(env.last()).toMatchObject({notice: null})
  })

  it('F8: the stage wait is cancelled when the session ends', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/end', 'end')
    await env.c.end()
    expect(env.timers.find(t => t.ms === STAGE_WAIT_MS)!.cancelled).toBe(true)
  })

  it('F9: after a rejoin, blind goes out before the mic is published', async () => {
    const env = setup()
    await toLive(env)
    await env.c.setBlind(true)
    env.rt.on('/live/sessions/:sid/token', 'tokenForJoin')
    env.rt.on('/live/join/prove', 'proveExchange')
    env.log.length = 0
    env.fake.drop('network')
    await flush(400)
    const ops = env.log.filter(l => l.startsWith('room.'))
    expect(ops.indexOf('room.data')).toBeGreaterThan(
      ops.indexOf('room.connect'),
    )
    expect(ops.indexOf('room.data')).toBeLessThan(ops.indexOf('room.mic(true)'))
  })
})

describe('R2 rev 4: the proof exchange and the unbound wait (9fc23bd)', () => {
  it('the runtime refuses the traded token and admits the exchanged one (live.json media)', () => {
    expect(LIVE.media.joinTradedToken).toMatchObject({ok: false})
    expect(LIVE.media.joinExchangedToken).toMatchObject({ok: true})
    expect(tokenOf('proveExchange')).not.toBe(tokenOf('tokenForExchange'))
  })

  it('unbound: the fresh join is removed while the dead one is held, so it keeps “Reconnecting” and tries again', async () => {
    const env = setup({key: false})
    await toConsent(env)
    env.rt.on('/live/sessions/:sid/consent', {
      status: 200,
      body: {...reply('consentAdmitted').body, popRequired: false},
    })
    await env.c.submitConsent({ai_process: true})
    const unbound = {...reply('tokenUnbound').body, popRequired: false}
    env.rt.on(
      '/live/sessions/:sid/token',
      {status: 200, body: unbound},
      {status: 200, body: unbound},
      {status: 200, body: unbound},
    )
    // The runtime removes the first two rejoins (participant still held).
    const connect = env.fake.room.connect
    let n = 0
    env.fake.room.connect = async args => {
      await connect(args)
      if (n++ < 2) env.fake.drop('removed')
    }
    const seen: string[] = []
    env.fake.drop('network')
    for (let i = 0; i < 40; i++) {
      await flush(20)
      seen.push(env.last().phase)
    }
    expect(env.rt.to('/live/sessions/:sid/token')).toHaveLength(3)
    expect(env.rt.to('/live/join/prove')).toEqual([])
    expect(seen).not.toContain('ended')
    expect(env.last()).toMatchObject({phase: 'connected', micOn: true})
  })

  it('unbound: removed while connected rejoins, and the mint says if it is over (404 → ended)', async () => {
    const env = setup({key: false})
    await toConsent(env)
    env.rt.on('/live/sessions/:sid/consent', {
      status: 200,
      body: {...reply('consentAdmitted').body, popRequired: false},
    })
    await env.c.submitConsent({ai_process: true})
    env.rt.on('/live/sessions/:sid/token', 'tokenAfterEnd')
    env.fake.drop('removed')
    await flush(200)
    expect(env.rt.to('/live/sessions/:sid/token')).toHaveLength(1)
    expect(env.last()).toMatchObject({
      phase: 'ended',
      endReason: 'ended_elsewhere',
    })
  })

  it('bound: a removal while the rejoin’s connect() resolves is a refused rejoin: the next rung, not lost (rev 4)', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/token', 'tokenForJoin', 'tokenCamera')
    env.rt.on('/live/join/prove', 'proveExchange', 'proveExchange')
    const connect = env.fake.room.connect
    let refuse = true
    env.fake.room.connect = async args => {
      await connect(args)
      if (refuse) {
        refuse = false
        env.fake.drop('removed')
      }
    }
    env.fake.drop('network')
    await flush(400)
    expect(env.rt.to('/live/sessions/:sid/token')).toHaveLength(2)
    expect((env.deps.sleep as jest.Mock).mock.calls.map(c => c[0])).toEqual([
      1000, 2000,
    ])
    expect(env.last()).toMatchObject({phase: 'connected', micOn: true})
  })

  it('bound: a rejoin refused every time climbs 1/2/4/8/16 s, then “reconnect failed” with /end (rev 4)', async () => {
    const env = setup()
    await toLive(env)
    for (let i = 0; i < 6; i++) {
      env.rt.on('/live/sessions/:sid/token', 'tokenForJoin')
      env.rt.on('/live/join/prove', 'proveExchange')
    }
    env.rt.on('/live/sessions/:sid/end', 'end')
    // Every rejoin's join is removed as it connects (the old one stays held).
    const connect = env.fake.room.connect
    env.fake.room.connect = async args => {
      await connect(args)
      env.fake.drop('removed')
    }
    env.fake.drop('network')
    for (let i = 0; i < 60 && env.last().phase !== 'failed'; i++) {
      await flush(40)
    }
    expect((env.deps.sleep as jest.Mock).mock.calls.map(c => c[0])).toEqual([
      1000, 2000, 4000, 8000, 16000,
    ])
    expect(env.rt.to('/live/sessions/:sid/token')).toHaveLength(5)
    expect(env.last()).toMatchObject({
      phase: 'failed',
      error: 'reconnect_failed',
      micOn: false,
    })
    expect(env.rt.to('/live/sessions/:sid/end')).toHaveLength(1)
  })

  it('bound: removed within 10 s of a rejoin’s connect is refused (next rung, no reset); after 10 s it is FINAL (rev 4)', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/token', 'tokenForJoin', 'tokenCamera')
    env.rt.on('/live/join/prove', 'proveExchange', 'proveExchange')
    env.fake.drop('network')
    await flush(400)
    expect(env.last().phase).toBe('connected')
    // 9 s after the rejoin connected: refused, so the ladder carries on.
    env.clock.now += 9
    env.fake.drop('removed')
    await flush(400)
    expect((env.deps.sleep as jest.Mock).mock.calls.map(c => c[0])).toEqual([
      1000, 2000,
    ])
    expect(env.last().phase).toBe('connected')
    // 11 s after that rejoin: a real removal, FINAL.
    env.clock.now += 11
    env.fake.drop('removed')
    await flush()
    expect(env.rt.to('/live/sessions/:sid/token')).toHaveLength(2)
    expect(env.last()).toMatchObject({phase: 'ended', endReason: 'removed'})
  })

  it.each([400, 403, 409])(
    'a refused mint (%i) during a rejoin is FINAL: “session ended”, no retry (rev 4)',
    async status => {
      const env = setup()
      await toLive(env)
      env.rt.on('/live/sessions/:sid/token', {
        status,
        body: {error: 'refused'},
      })
      env.rt.on('/live/sessions/:sid/end', 'end')
      env.fake.drop('network')
      await flush(400)
      expect(env.rt.to('/live/sessions/:sid/token')).toHaveLength(1)
      expect(env.last()).toMatchObject({
        phase: 'ended',
        endReason: 'ended_elsewhere',
      })
      // J1: /end too, so the agent doesn't stay up.
      await flush()
      expect(env.rt.to('/live/sessions/:sid/end')).toHaveLength(1)
    },
  )

  it.each([408, 429])(
    'J2: a %i mint during a rejoin is an outage: retried, then connected',
    async status => {
      const env = setup()
      await toLive(env)
      env.rt.on(
        '/live/sessions/:sid/token',
        {status, body: {error: 'slow down'}},
        'tokenForJoin',
      )
      env.rt.on('/live/join/prove', 'proveExchange')
      env.fake.drop('network')
      for (let i = 0; i < 20 && env.last().phase !== 'connected'; i++) {
        await flush(40)
      }
      expect(env.rt.to('/live/sessions/:sid/token')).toHaveLength(2)
      expect(env.last().phase).toBe('connected')
    },
  )

  it('an outage mint (503, network) during a rejoin is retried on the ladder', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on(
      '/live/sessions/:sid/token',
      E503,
      new Error('offline'),
      'tokenForJoin',
    )
    env.rt.on('/live/join/prove', 'proveExchange')
    env.fake.drop('network')
    for (let i = 0; i < 20 && env.last().phase !== 'connected'; i++) {
      await flush(40)
    }
    expect(env.rt.to('/live/sessions/:sid/token')).toHaveLength(3)
    expect(env.last().phase).toBe('connected')
  })

  it('bound: removed stays FINAL (no rejoin, no mint)', async () => {
    const env = setup()
    await toLive(env)
    env.fake.drop('removed')
    await flush()
    expect(env.rt.to('/live/sessions/:sid/token')).toEqual([])
    expect(env.last()).toMatchObject({phase: 'ended', endReason: 'removed'})
  })
})

describe('review 679a9d48', () => {
  it('H2: /end that gives up is visible (endFailed), and retryEnd sends it again', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/end', E503, E503, E503, E503)
    await env.c.end()
    expect(env.last()).toMatchObject({
      phase: 'ended',
      ending: false,
      endFailed: true,
    })
    env.rt.on('/live/sessions/:sid/end', 'end')
    await env.c.retryEnd()
    expect(env.rt.to('/live/sessions/:sid/end')).toHaveLength(5)
    expect(env.last()).toMatchObject({ending: false, endFailed: false})
  })

  it('H2: a 401 on /end is a visible failure, not a silent one', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/end', {
      status: 401,
      body: {error: 'unauthorized'},
    })
    await env.c.end()
    expect(env.rt.to('/live/sessions/:sid/end')).toHaveLength(1)
    expect(env.last()).toMatchObject({endFailed: true})
  })

  it('H2: not_found on /end means already ended (no failure shown)', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/end', 'endOtherOwner')
    await env.c.end()
    expect(env.last()).toMatchObject({endFailed: false})
  })

  it('H2: sign-out / account switch ends the open session with its own bearer (registry hook)', async () => {
    const env = setup()
    await toLive(env)
    expect(openLiveSessionCount()).toBe(1)
    env.rt.on('/live/sessions/:sid/end', 'end')
    // What state/session calls first on logout or a switch, before tokens go.
    endOpenLiveSessions()
    signedInAs(null, null)
    await flush()
    const end = env.rt.to('/live/sessions/:sid/end')
    expect(end).toHaveLength(1)
    expect(end[0].headers.Authorization).toBe(`Bearer ${BEARER}`)
    expect(env.last()).toMatchObject({phase: 'ended', micOn: false})
    expect(openLiveSessionCount()).toBe(0)
  })

  it('H2: a session that ended elsewhere leaves the registry too', async () => {
    const env = setup()
    await toLive(env)
    env.fake.drop('room_deleted')
    await flush()
    expect(openLiveSessionCount()).toBe(0)
  })

  it.each<['room_deleted', string]>([['room_deleted', 'ended_elsewhere']])(
    'N1: a FINAL drop (%s) while the rejoin turns the mic on is not swallowed',
    async (reason, endReason) => {
      const env = setup()
      await toLive(env)
      env.rt.on('/live/sessions/:sid/token', 'tokenForJoin')
      env.rt.on('/live/join/prove', 'proveExchange')
      const mic = env.fake.room.setMicrophoneEnabled
      let first = true
      env.fake.room.setMicrophoneEnabled = on => {
        if (first) {
          first = false
          // The runtime's backstop removes the fresh join at participant_joined.
          env.fake.drop(reason)
        }
        return mic(on)
      }
      env.fake.drop('network')
      await flush(400)
      expect(env.last()).toMatchObject({
        phase: 'ended',
        endReason,
        micOn: false,
      })
    },
  )

  it('N1: a removal while the rejoin turns the mic on is a refused rejoin, not swallowed (rev 4)', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/token', 'tokenForJoin', 'tokenCamera')
    env.rt.on('/live/join/prove', 'proveExchange', 'proveExchange')
    const mic = env.fake.room.setMicrophoneEnabled
    let first = true
    env.fake.room.setMicrophoneEnabled = on => {
      if (first) {
        first = false
        // The runtime's backstop removes the fresh join at participant_joined.
        env.fake.drop('removed')
      }
      return mic(on)
    }
    env.fake.drop('network')
    await flush(400)
    // The removal was acted on: another rung, a fresh mint, a new join.
    expect(env.rt.to('/live/sessions/:sid/token')).toHaveLength(2)
    expect(env.last()).toMatchObject({phase: 'connected', micOn: true})
  })

  it('N1: a muted owner too (mic off resolves at once)', async () => {
    const env = setup()
    await toLive(env)
    await env.c.setMic(false)
    env.rt.on('/live/sessions/:sid/token', 'tokenForJoin', 'tokenCamera')
    env.rt.on('/live/join/prove', 'proveExchange', 'proveExchange')
    const mic = env.fake.room.setMicrophoneEnabled
    let first = true
    env.fake.room.setMicrophoneEnabled = on => {
      if (first) {
        first = false
        env.fake.drop('removed')
      }
      return mic(on)
    }
    env.fake.drop('network')
    await flush(400)
    expect(env.rt.to('/live/sessions/:sid/token')).toHaveLength(2)
    expect(env.last()).toMatchObject({phase: 'connected', micOn: false})
  })

  it('N1: a network drop of the new connection while finishing rejoins again', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/token', 'tokenForJoin', 'tokenCamera')
    env.rt.on('/live/join/prove', 'proveExchange', 'proveExchange')
    const mic = env.fake.room.setMicrophoneEnabled
    let first = true
    env.fake.room.setMicrophoneEnabled = on => {
      if (first) {
        first = false
        env.fake.drop('network')
      }
      return mic(on)
    }
    env.fake.drop('network')
    await flush(800)
    expect(env.rt.to('/live/sessions/:sid/token')).toHaveLength(2)
    expect(env.last()).toMatchObject({phase: 'connected', micOn: true})
  })

  it('N1: the camera rejoin keeps a FINAL drop too, and clears cameraPending', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/token', 'tokenCamera')
    env.rt.on('/live/join/prove', 'proveExchange')
    const mic = env.fake.room.setMicrophoneEnabled
    let first = true
    env.fake.room.setMicrophoneEnabled = on => {
      if (first) {
        first = false
        env.fake.drop('removed')
      }
      return mic(on)
    }
    await env.c.setCamera(true)
    await flush(200)
    expect(env.last()).toMatchObject({
      phase: 'ended',
      endReason: 'removed',
      cameraOn: false,
      cameraPending: false,
    })
    expect(env.fake.cameraPublishes()).toBe(0)
  })

  it('N2: the agent’s job did not start: no join, “agent unavailable”, session ended', async () => {
    const env = setup()
    await toConsent(env)
    env.rt.on('/live/sessions/:sid/consent', 'consentAgentUnavailable')
    env.rt.on('/live/sessions/:sid/end', 'end')
    await env.c.submitConsent({ai_process: true})
    expect(reply('consentAgentUnavailable').body.agent).toBe('unavailable')
    expect(env.last()).toMatchObject({
      phase: 'failed',
      error: 'agent_unavailable',
    })
    expect(env.fake.connects()).toEqual([])
    expect(env.fake.calls.filter(c => c.op === 'mic')).toEqual([])
    expect(env.rt.to('/live/sessions/:sid/end')).toHaveLength(1)
  })

  it('R1 (563477989): a takeover the holder refuses climbs the ladder, then says it is still open and does NOT /end it', async () => {
    const env = setup({held: true})
    await toConsent(env, 'startReused')
    await env.c.continueHere()
    env.rt.on('/live/sessions/:sid/consent', 'consentAdmitted')
    env.rt.on('/live/join/prove', 'proveExchange')
    await env.c.submitConsent({ai_process: true})
    for (let i = 0; i < 5; i++) {
      env.rt.on('/live/sessions/:sid/token', 'tokenForJoin')
      env.rt.on('/live/join/prove', 'proveExchange')
    }
    // The other device holds it: every join is removed as it connects.
    const connect = env.fake.room.connect
    env.fake.room.connect = async args => {
      await connect(args)
      env.fake.drop('removed')
    }
    env.fake.drop('removed')
    for (let i = 0; i < 60 && env.last().phase !== 'ended'; i++) {
      await flush(40)
    }
    await flush()
    expect((env.deps.sleep as jest.Mock).mock.calls.map(c => c[0])).toEqual([
      1000, 2000, 4000, 8000, 16000,
    ])
    expect(env.last()).toMatchObject({
      phase: 'ended',
      endReason: 'still_open_elsewhere',
      micOn: false,
    })
    expect(env.rt.to('/live/sessions/:sid/end')).toEqual([])
  })

  it('a continued session that took over and then lost the network fails as a reconnect, with /end', async () => {
    const env = setup({held: true})
    await toConsent(env, 'startReused')
    await env.c.continueHere()
    env.rt.on('/live/sessions/:sid/consent', 'consentAdmitted')
    env.rt.on('/live/join/prove', 'proveExchange')
    await env.c.submitConsent({ai_process: true})
    env.rt.on('/live/sessions/:sid/token', E503, E503, E503, E503, E503)
    env.rt.on('/live/sessions/:sid/end', 'end')
    env.fake.drop('network')
    for (let i = 0; i < 60 && env.last().phase !== 'failed'; i++) {
      await flush(40)
    }
    await flush()
    expect(env.last()).toMatchObject({
      phase: 'failed',
      error: 'reconnect_failed',
    })
    expect(env.rt.to('/live/sessions/:sid/end')).toHaveLength(1)
  })

  it('a bound join that connects records the session as held here; an unbound one does not', async () => {
    const bound = setup()
    await toLive(bound)
    expect(bound.deps.markHeldHere).toHaveBeenCalledWith(OWNER_DID, SID)
    const unbound = setup({key: false})
    await toConsent(unbound)
    unbound.rt.on('/live/sessions/:sid/consent', {
      status: 200,
      body: {...reply('consentAdmitted').body, popRequired: false},
    })
    await unbound.c.submitConsent({ai_process: true})
    expect(unbound.deps.markHeldHere).not.toHaveBeenCalled()
  })

  it('R3f: endOpen ends a reused session for every device (/end), even with no key', async () => {
    const env = setup({key: false})
    await toConsent(env, 'startReused')
    env.rt.on('/live/sessions/:sid/end', 'end')
    await env.c.endOpen()
    expect(env.rt.to('/live/sessions/:sid/end')).toHaveLength(1)
    expect(env.last()).toMatchObject({phase: 'ended', endReason: 'local'})
    expect(env.fake.connects()).toEqual([])
  })

  it('reuse: Take over only where R3 allows it - a key, and this device held the session (563477989 R1)', async () => {
    const held = setup({held: true})
    await toConsent(held, 'startReused')
    expect(held.last()).toMatchObject({
      phase: 'reuse',
      canTakeOver: true,
      reuseBound: true,
    })
    expect(held.deps.wasHeldHere).toHaveBeenCalledWith(OWNER_DID, SID)
    const otherDevice = setup({held: false})
    await toConsent(otherDevice, 'startReused')
    expect(otherDevice.last()).toMatchObject({
      phase: 'reuse',
      canTakeOver: false,
      reuseBound: true,
    })
    const unbound = setup({key: false, held: true})
    await toConsent(unbound, 'startReused')
    expect(unbound.last()).toMatchObject({
      phase: 'reuse',
      canTakeOver: false,
      reuseBound: false,
    })
    // Nothing on the reuse panel sends /end on its own.
    for (const e of [held, otherDevice, unbound]) {
      expect(e.rt.to('/live/sessions/:sid/end')).toEqual([])
    }
  })

  it('LOW: blind is sent again on the new connection after a rejoin', async () => {
    const env = setup()
    await toLive(env)
    await env.c.setBlind(true)
    env.rt.on('/live/sessions/:sid/token', 'tokenForJoin')
    env.rt.on('/live/join/prove', 'proveExchange')
    env.fake.drop('network')
    await flush(400)
    const data = env.fake.calls.filter(c => c.op === 'data')
    expect(data).toHaveLength(2)
    expect(data[1]).toMatchObject({
      text: '{"t":"blind","on":true,"src":"*"}',
      topic: 'stage.reply',
    })
    expect(env.last()).toMatchObject({phase: 'connected', blindOn: true})
  })

  it('LOW: camera access granted after the session ended mints no token', async () => {
    const env = setup()
    await toLive(env)
    let grant!: () => void
    ;(env.deps.requestCameraAccess as jest.Mock).mockImplementationOnce(
      () => new Promise(r => (grant = () => r('granted'))),
    )
    const cam = env.c.setCamera(true)
    await flush()
    env.rt.on('/live/sessions/:sid/end', 'end')
    await env.c.end()
    grant()
    await cam
    expect(env.rt.to('/live/sessions/:sid/token')).toEqual([])
  })
})

describe('H2: end', () => {
  it('ends the session and leaves the room', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/end', 'end')
    await env.c.end()
    expect(env.rt.to('/live/sessions/:sid/end')).toHaveLength(1)
    expect(env.fake.calls[env.fake.calls.length - 1].op).toBe('disconnect')
    expect(env.last()).toMatchObject({
      phase: 'ended',
      endReason: 'local',
      micOn: false,
      ending: false,
    })
  })

  it('the bearer is fixed when End is pressed, before the app moves on', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/end', 'end')
    // The account changes in the same tick as the unmount's end() (the tree
    // remounts on an account switch).
    const ended = env.c.end()
    signedInAs('did:plc:someotheraccount00000001', 'other-account-bearer')
    await ended
    expect(env.rt.to('/live/sessions/:sid/end')[0].headers.Authorization).toBe(
      `Bearer ${BEARER}`,
    )
  })

  it('after an account switch it still carries the session account’s bearer', async () => {
    const env = setup()
    await toLive(env)
    signedInAs('did:plc:someotheraccount00000001', 'other-account-bearer')
    env.rt.on('/live/sessions/:sid/end', 'end')
    await env.c.end()
    expect(env.rt.to('/live/sessions/:sid/end')[0].headers.Authorization).toBe(
      `Bearer ${BEARER}`,
    )
  })

  it('after sign-out too', async () => {
    const env = setup()
    await toLive(env)
    signedInAs(null, null)
    env.rt.on('/live/sessions/:sid/end', 'end')
    await env.c.end()
    expect(env.rt.to('/live/sessions/:sid/end')[0].headers.Authorization).toBe(
      `Bearer ${BEARER}`,
    )
  })

  it('is retried while the runtime is unavailable', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/end', E503, E503, 'end')
    await env.c.end()
    expect(env.rt.to('/live/sessions/:sid/end')).toHaveLength(3)
    expect((env.deps.sleep as jest.Mock).mock.calls.map(c => c[0])).toEqual(
      END_RETRY_DELAYS_MS.slice(0, 2),
    )
  })

  it('gives up after the last retry; not_found is not retried', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/end', E503, E503, E503, E503, E503)
    await env.c.end()
    expect(env.rt.to('/live/sessions/:sid/end')).toHaveLength(
      END_RETRY_DELAYS_MS.length + 1,
    )

    const gone = setup()
    await toLive(gone)
    gone.rt.on('/live/sessions/:sid/end', 'endOtherOwner')
    await gone.c.end()
    expect(gone.rt.to('/live/sessions/:sid/end')).toHaveLength(1)
  })

  it('a second end waits for the first, and sends nothing more', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/end', 'end')
    await Promise.all([env.c.end(), env.c.end()])
    expect(env.rt.to('/live/sessions/:sid/end')).toHaveLength(1)
  })
})

describe('H3: a failed start leaves nothing behind', () => {
  it.each(['connect', 'mic'] as const)(
    '%s fails: failed, room left, session ended',
    async op => {
      const env = setup()
      await toConsent(env)
      env.rt.on('/live/sessions/:sid/consent', 'consentAdmitted')
      env.rt.on('/live/join/prove', 'proveExchange')
      env.rt.on('/live/sessions/:sid/end', 'end')
      env.fake.fail(op)
      await env.c.submitConsent({ai_process: true})
      expect(env.last()).toMatchObject({
        phase: 'failed',
        error: 'connect',
        micOn: false,
      })
      expect(env.fake.calls[env.fake.calls.length - 1].op).toBe('disconnect')
      expect(env.rt.to('/live/sessions/:sid/end')).toHaveLength(1)
    },
  )

  it('the room factory throws: failed, session ended', async () => {
    const env = setup({
      roomFactory: () => {
        throw new Error('no WebRTC')
      },
    })
    await toConsent(env)
    env.rt.on('/live/sessions/:sid/consent', 'consentAdmitted')
    env.rt.on('/live/sessions/:sid/end', 'end')
    await env.c.submitConsent({ai_process: true})
    expect(env.last()).toMatchObject({phase: 'failed', error: 'connect'})
    expect(env.rt.to('/live/sessions/:sid/end')).toHaveLength(1)
  })

  it('a refused proof: no join, session ended', async () => {
    const env = setup()
    await toConsent(env)
    env.rt.on('/live/sessions/:sid/consent', 'consentAdmitted')
    env.rt.on('/live/join/prove', 'proveBadSignature')
    env.rt.on('/live/sessions/:sid/end', 'end')
    await env.c.submitConsent({ai_process: true})
    expect(env.last()).toMatchObject({phase: 'failed', error: 'bad_proof'})
    expect(env.fake.connects()).toEqual([])
    expect(env.rt.to('/live/sessions/:sid/end')).toHaveLength(1)
  })

  it('no device key: an unbound session, no proof', async () => {
    const env = setup({key: false})
    await toConsent(env)
    expect(env.rt.sent[0].body).toEqual({agentDid: AGENT_DID})
    env.rt.on('/live/sessions/:sid/consent', {
      status: 200,
      body: {...reply('consentAdmitted').body, popRequired: false},
    })
    await env.c.submitConsent({ai_process: true})
    expect(env.rt.to('/live/join/prove')).toEqual([])
    expect(env.last().phase).toBe('connected')
  })

  it('a token past its expiry is replaced before joining', async () => {
    const env = setup({nowS: EXP + 1})
    await toConsent(env)
    env.rt.on('/live/sessions/:sid/consent', 'consentAdmitted')
    env.rt.on('/live/sessions/:sid/token', 'tokenForJoin')
    env.rt.on('/live/join/prove', 'proveExchange')
    await env.c.submitConsent({ai_process: true})
    // The fresh token is the one proven; the exchange's token joins.
    expect(env.rt.to('/live/join/prove')[0].body!.token).toBe(
      tokenOf('tokenForJoin'),
    )
    expect(env.fake.connects().map(c => c.token)).toEqual([
      tokenOf('proveExchange'),
    ])
  })
})

describe('camera: off by default, published only once on (M1)', () => {
  it('on: camera access, a proven camera token, a rejoin keeping audio, then publish', async () => {
    const env = setup()
    await toLive(env)
    env.log.length = 0
    env.rt.on('/live/sessions/:sid/token', 'tokenCamera')
    env.rt.on('/live/join/prove', 'proveExchange')
    await env.c.setCamera(true)
    expect(env.deps.requestCameraAccess).toHaveBeenCalled()
    expect(env.rt.to('/live/sessions/:sid/token')[0].body).toEqual({
      camera: true,
      devicePubKey: LIVE.device.publicKey,
    })
    expect(String(env.rt.to('/live/join/prove')[1].body!.sig)).toBe(
      LIVE.proofs.tokenCamera,
    )
    expect(env.log).toEqual([
      'api /live/sessions/:sid/token',
      'api /live/join/prove',
      'room.disconnect',
      'room.connect',
      'room.mic(true)',
      'room.camera(true)',
    ])
    expect(env.fake.calls.find(x => x.op === 'disconnect')).toEqual({
      op: 'disconnect',
      keepAudio: true,
    })
    // The camera token is proven; the exchanged token joins.
    expect(env.fake.connects()[1].token).toBe(tokenOf('proveExchange'))
    expect(env.last()).toMatchObject({
      cameraOn: true,
      cameraPending: false,
      phase: 'connected',
    })
  })

  it('nothing is published before the session is connected', async () => {
    const env = setup()
    await toConsent(env)
    await env.c.setCamera(true)
    expect(env.fake.cameraPublishes()).toBe(0)
    expect(env.rt.to('/live/sessions/:sid/token')).toEqual([])
  })

  it('camera access refused: a notice, no token, nothing published', async () => {
    const env = setup({camera: 'denied'})
    await toLive(env)
    await env.c.setCamera(true)
    expect(env.last()).toMatchObject({notice: 'camera_denied', cameraOn: false})
    expect(env.rt.to('/live/sessions/:sid/token')).toEqual([])
    expect(env.fake.cameraPublishes()).toBe(0)
  })

  it('a refused camera token publishes nothing; the session goes on', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/token', E503)
    await env.c.setCamera(true)
    expect(env.last()).toMatchObject({
      phase: 'connected',
      notice: 'camera_failed',
      cameraOn: false,
    })
    expect(env.fake.cameraPublishes()).toBe(0)
  })

  it('consent withdrawn when asking for the camera: ended', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/token', 'tokenBeforeConsent')
    await env.c.setCamera(true)
    expect(env.last()).toMatchObject({
      phase: 'ended',
      endReason: 'consent_withdrawn',
    })
  })

  it('the camera rejoin fails: back without the camera, still live', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/token', 'tokenCamera', 'tokenForJoin')
    env.rt.on('/live/join/prove', 'proveExchange', 'proveExchange')
    env.fake.fail('connect')
    await env.c.setCamera(true)
    await flush()
    expect(
      env.rt.to('/live/sessions/:sid/token').map(t => t.body!.camera),
    ).toEqual([true, false])
    expect(env.last()).toMatchObject({
      phase: 'connected',
      cameraOn: false,
      cameraPending: false,
      notice: 'camera_failed',
    })
    expect(env.fake.cameraPublishes()).toBe(0)
  })

  it('off unpublishes', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/token', 'tokenCamera')
    env.rt.on('/live/join/prove', 'proveExchange')
    await env.c.setCamera(true)
    await env.c.setCamera(false)
    expect(env.fake.calls[env.fake.calls.length - 1]).toEqual({
      op: 'camera',
      on: false,
    })
    expect(env.last().cameraOn).toBe(false)
  })
})

describe('blind (ruling 2, owner-only)', () => {
  it('sends the exact wire format on stage.reply, reliably', async () => {
    const env = setup()
    await toLive(env)
    expect(await env.c.setBlind(true)).toBe(true)
    expect(await env.c.setBlind(false, 'screen_share')).toBe(true)
    expect(env.fake.calls.filter(x => x.op === 'data')).toEqual([
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
    expect(env.last().blindOn).toBe(true)
  })

  it('is sent only on a session this owner started and joined', async () => {
    const notStarted = setup()
    expect(await notStarted.c.setBlind(true)).toBe(false)

    const atConsent = setup()
    await toConsent(atConsent)
    expect(await atConsent.c.setBlind(true)).toBe(false)

    const ended = setup()
    await toLive(ended)
    ended.rt.on('/live/sessions/:sid/end', 'end')
    await ended.c.end()
    expect(await ended.c.setBlind(true)).toBe(false)

    for (const s of [notStarted, atConsent, ended]) {
      expect(s.fake.calls.filter(x => x.op === 'data')).toEqual([])
    }
  })

  it('a bad source id sends nothing', async () => {
    const env = setup()
    await toLive(env)
    expect(await env.c.setBlind(true, 'a b')).toBe(false)
    expect(env.fake.calls.filter(x => x.op === 'data')).toEqual([])
  })
})

it('the fixture session is the one the runtime made', () => {
  expect(SID).toMatch(/^ls_[0-9A-Z]{26}$/)
})
