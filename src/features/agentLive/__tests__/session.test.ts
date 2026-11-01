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
  createLiveSessionController,
  END_RETRY_DELAYS_MS,
  type LiveDeps,
  type LiveSessionState,
  REJOIN_BACKOFF_MS,
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
})

const E503 = {status: 503, body: {error: 'unavailable'}}

function setup({
  mic = 'granted',
  camera = 'granted',
  key = true,
  nowS = EXP - 30,
  roomFactory,
}: {
  mic?: 'granted' | 'denied'
  camera?: 'granted' | 'denied'
  key?: boolean
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
  const deps: Partial<LiveDeps> = {
    getDeviceKey: jest.fn(() =>
      Promise.resolve(key ? deviceKeyFromSeed(DEVICE_SEED) : null),
    ),
    requestMicAccess: jest.fn(() => Promise.resolve(mic)),
    requestCameraAccess: jest.fn(() => Promise.resolve(camera)),
    sleep: jest.fn(() => Promise.resolve()),
    nowS: () => nowS,
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
  return {c, rt, fake, log, last, deps, factory, states}
}

type Env = ReturnType<typeof setup>

async function toConsent(env: Env, start = 'startAwaitingConsent') {
  env.rt.on('/live/sessions', start)
  await env.c.begin()
}

async function toLive(env: Env) {
  await toConsent(env)
  env.rt.on('/live/sessions/:sid/consent', 'consentAdmitted')
  env.rt.on('/live/join/prove', 'proveOk')
  await env.c.submitConsent({ai_process: true, transcribe: true})
}

const flush = async (turns = 20) => {
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
      token,
    })
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
    env.rt.on('/live/join/prove', 'proveOk')
    env.fake.drop('network')
    await flush()
    const t = env.rt.to('/live/sessions/:sid/token')
    expect(t[0].body).toEqual({
      camera: false,
      devicePubKey: LIVE.device.publicKey,
    })
    expect(env.fake.connects().map(c => c.token)).toEqual([
      tokenOf('consentAdmitted'),
      tokenOf('tokenForJoin'),
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

  it('a drop it can’t recover from: backoff 1, 2, 4, 8 s, then “reconnect failed”, room left, session ended', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/token', E503, E503, E503, E503)
    env.rt.on('/live/sessions/:sid/end', 'end')
    env.fake.drop('network')
    await flush(400)
    expect((env.deps.sleep as jest.Mock).mock.calls.map(c => c[0])).toEqual(
      REJOIN_BACKOFF_MS,
    )
    expect(REJOIN_BACKOFF_MS).toEqual([1000, 2000, 4000, 8000])
    expect(env.rt.to('/live/sessions/:sid/token')).toHaveLength(4)
    expect(env.last()).toMatchObject({
      phase: 'failed',
      error: 'reconnect_failed',
      micOn: false,
    })
    expect(env.rt.to('/live/sessions/:sid/end')).toHaveLength(1)
  })

  it('R2: every rejoin attempt is a fresh token from /token, proven, then a new join (never a resume)', async () => {
    const env = setup()
    await toLive(env)
    env.rt.on('/live/sessions/:sid/token', 'tokenForJoin', 'tokenCamera')
    env.rt.on('/live/join/prove', 'proveOk', 'proveOk')
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
    expect(env.fake.connects().map(c => c.token)).toEqual([
      tokenOf('consentAdmitted'),
      tokenOf('tokenForJoin'),
      tokenOf('tokenCamera'),
    ])
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
    env.rt.on('/live/join/prove', 'proveOk')
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
      env.rt.on('/live/join/prove', 'proveOk')
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
    env.rt.on('/live/join/prove', 'proveOk')
    await env.c.submitConsent({ai_process: true})
    expect(env.fake.connects().map(c => c.token)).toEqual([
      tokenOf('tokenForJoin'),
    ])
  })
})

describe('camera: off by default, published only once on (M1)', () => {
  it('on: camera access, a proven camera token, a rejoin keeping audio, then publish', async () => {
    const env = setup()
    await toLive(env)
    env.log.length = 0
    env.rt.on('/live/sessions/:sid/token', 'tokenCamera')
    env.rt.on('/live/join/prove', 'proveCamera')
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
    expect(env.fake.connects()[1].token).toBe(tokenOf('tokenCamera'))
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
    env.rt.on('/live/join/prove', 'proveCamera', 'proveOk')
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
    env.rt.on('/live/join/prove', 'proveCamera')
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
