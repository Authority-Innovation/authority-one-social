/**
 * One owner live session. Plain TypeScript (no React, no SDK) so the rules
 * below are tested without a device.
 *
 * FLOW (design r2 §6). Nothing happens until the owner taps:
 *   idle → begin() (a tap) → mic access → POST /live/sessions (a session, no
 *   media) → [reuse: "continue here?"] → consent sheet → POST .../consent →
 *   proof of possession → join → mic on → connected.
 * The mic publishes only after the owner has decided every consent kind and
 * tapped Go live. A deep link to the screen starts nothing.
 *
 * - Identity: the start call sends `agentDid` only (see ./api.ts). The owner
 *   is whoever the bearer says; the session is pinned to that account
 *   (`LiveAuth`) for every later call, including the end call on sign-out or
 *   account switch.
 * - Camera: off by default. Turning it on asks for camera access, then a token
 *   with the CAMERA source (POST /live/sessions/:sid/token {camera: true}),
 *   proves it and rejoins with it, and only then publishes. If any step fails
 *   nothing is published, and the session rejoins without the camera.
 * - Connection: the SDK never resumes; a drop either ends the session (a
 *   FINAL reason, ./rejoin.ts) or is a full rejoin with fresh tokens on the
 *   1-16 s backoff, then a visible "Couldn't reconnect". The screen never
 *   shows "Mic on" on a dead room.
 * - End: the runtime's /end goes out first (before the room is left, so the
 *   bearer is read while the account is still this one), and is retried. It
 *   stops the agent's job and deletes the room; it is the app's stop path.
 * - The join token lives in this closure only: never logged or persisted.
 */
import {logger} from '#/logger'
import {
  captureLiveAuth,
  endLiveSession,
  type LiveAuth,
  type LiveError,
  type LiveJoin,
  type LiveResult,
  proveLiveJoin,
  requestLiveToken,
  startLiveSession,
  submitLiveConsent,
} from './api'
import {
  ALL_SOURCES,
  BLIND_TOPIC,
  blindMessage,
  encodeBlindMessage,
} from './blind'
import {
  canGoLive,
  CONSENT_TEXT_VERSION,
  type ConsentChoices,
  decisionsFor,
} from './consent'
import {getDeviceKey} from './deviceKey'
import {
  type MediaAccess,
  requestCameraAccess,
  requestMicAccess,
} from './permissions'
import {type DeviceKey, joinProof} from './pop'
import {registerLiveSession} from './registry'
import {LIVEKIT_DEPARTURE_TIMEOUT_S, REJOIN_BACKOFF_MS} from './rejoin'
import {
  type LiveConnectionEvent,
  type LiveRoom,
  type LiveRoomFactory,
  type StageRef,
} from './room'

export type LivePhase =
  | 'idle'
  | 'starting'
  | 'reuse'
  | 'consent'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'ended'
  | 'failed'

export type LiveFailure =
  | LiveError['kind']
  | 'mic_denied'
  | 'consent_incomplete'
  | 'connect'
  | 'reconnect_failed'
  | 'agent_unavailable'

/** Why a session ended (the screen words it). */
export type LiveEndReason =
  | 'local'
  | 'ended_elsewhere'
  | 'removed'
  | 'other_device'
  | 'consent_withdrawn'
  | 'still_open_elsewhere'

/** Something that went wrong without ending the session. */
export type LiveNotice =
  | 'camera_denied'
  | 'camera_failed'
  | 'action_failed'
  /** Connected, but no stage from the agent yet (review f2caccaa F8). */
  | 'agent_waiting'

export type LiveSessionState = {
  phase: LivePhase
  /** Why the session failed, in `failed`. */
  error: LiveFailure | null
  endReason: LiveEndReason | null
  notice: LiveNotice | null
  /** The kinds the owner decides on the sheet (the runtime's list). */
  consentRequired: string[]
  /** The session's recording policy; anything but 'off' shows the indicator. */
  recordPolicy: string
  micOn: boolean
  cameraOn: boolean
  /** A camera request is in flight. */
  cameraPending: boolean
  /** Blind on for all sources. */
  blindOn: boolean
  stage: StageRef | null
  /** The runtime's /end is still being sent (retried). */
  ending: boolean
  /**
   * The runtime's /end gave up (review 679a9d48 H2): the agent may still be in
   * the room. The screen says so and offers `retryEnd`.
   */
  endFailed: boolean
}

export const initialLiveSessionState: LiveSessionState = {
  phase: 'idle',
  error: null,
  endReason: null,
  notice: null,
  consentRequired: [],
  recordPolicy: 'off',
  micOn: false,
  cameraOn: false,
  cameraPending: false,
  blindOn: false,
  stage: null,
  ending: false,
  endFailed: false,
}

export type LiveApi = {
  captureLiveAuth: typeof captureLiveAuth
  startLiveSession: typeof startLiveSession
  submitLiveConsent: typeof submitLiveConsent
  requestLiveToken: typeof requestLiveToken
  proveLiveJoin: typeof proveLiveJoin
  endLiveSession: typeof endLiveSession
}

export type LiveDeps = {
  api: LiveApi
  getDeviceKey: (ownerDid: string) => Promise<DeviceKey | null>
  requestMicAccess: () => Promise<MediaAccess>
  requestCameraAccess: () => Promise<MediaAccess>
  sleep: (ms: number) => Promise<void>
  /** Seconds, to compare with a token's `expiresAt`. */
  nowS: () => number
  /** A one-shot timer; returns its cancel. */
  setTimer: (ms: number, cb: () => void) => () => void
  /**
   * The runtime's /end gave up after the screen had gone (review f2caccaa
   * F1): say so somewhere the owner sees it (the screen passes a toast).
   */
  onEndGaveUp: () => void
}

const defaultDeps: LiveDeps = {
  api: {
    captureLiveAuth,
    startLiveSession,
    submitLiveConsent,
    requestLiveToken,
    proveLiveJoin,
    endLiveSession,
  },
  getDeviceKey,
  requestMicAccess,
  requestCameraAccess,
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  nowS: () => Math.floor(Date.now() / 1000),
  setTimer: (ms, cb) => {
    const id = setTimeout(cb, ms)
    return () => clearTimeout(id)
  },
  onEndGaveUp: () => logger.warn('agentLive: /end gave up with no screen'),
}

/** No stage this long after connecting: tell the owner (review f2caccaa F8). */
export const STAGE_WAIT_MS = 45_000
/**
 * A removal this soon after a continued (reused) session joined is read as
 * the other device still holding it (M2); later, as a plain removal (F6).
 */
export const STILL_OPEN_WINDOW_S = 15

/** Waits between /end attempts (the route is idempotent). */
export const END_RETRY_DELAYS_MS = [1000, 3000, 7000]
/**
 * The full rejoin after a drop (join gate R2, runtime design
 * AGENT-LIVE-JOIN-GATE-REVISED @ adeeadb): the edge refuses LiveKit resumes,
 * and the SDK's own retries are off (room/livekit.tsx), so continuity is a
 * fresh token, its proof, and a new join. The backoff and the final reasons
 * are ./rejoin.ts, the runtime workers' rule (live-agent/src/rejoin.js).
 */
export {REJOIN_BACKOFF_MS}
/** A token this close to `expiresAt` is replaced before joining. */
const TOKEN_MARGIN_S = 5

export type LiveSessionController = {
  /** The owner tapped to start. Asks for the mic, then creates the session. */
  begin(): Promise<void>
  /** On `reuse`: the owner chose to continue the open session here. */
  continueHere(): Promise<void>
  /** The owner's consent sheet, then the join. */
  submitConsent(choices: ConsentChoices): Promise<void>
  setMic(on: boolean): Promise<void>
  /** Returns false when nothing was sent (no session, or a bad source id). */
  setBlind(on: boolean, src?: string): Promise<boolean>
  setCamera(on: boolean): Promise<void>
  end(): Promise<void>
  /** Send the runtime's /end again after it gave up (`endFailed`). */
  retryEnd(): Promise<void>
  /**
   * The screen has gone: from now on a /end that gives up is reported
   * through `onEndGaveUp` (there is no screen to show it). `failureSeen`: the
   * screen already showed a give-up the owner chose to leave anyway.
   */
  detach(opts?: {failureSeen?: boolean}): void
  /** The room, once joining (the screen renders its StageVideo). */
  room(): LiveRoom | null
}

type Session = {
  sid: string
  wsUrl: string
  auth: LiveAuth
  key: DeviceKey | null
  join: LiveJoin | null
  /** The owner had it open already (maybe on another device). */
  reused: boolean
  /** When the first join of this session went through (seconds). */
  firstConnectedAt?: number
}

export function createLiveSessionController({
  agentDid,
  roomFactory,
  onChange,
  deps: depsIn,
}: {
  agentDid: string
  roomFactory: LiveRoomFactory
  onChange: (state: LiveSessionState) => void
  deps?: Partial<LiveDeps>
}): LiveSessionController {
  const deps: LiveDeps = {...defaultDeps, ...depsIn}
  const {api} = deps
  let state = initialLiveSessionState
  let session: Session | null = null
  let room: LiveRoom | null = null
  let unsubscribe: Array<() => void> = []
  let ending: Promise<void> | null = null
  // A disconnect we asked for (end, the camera rejoin): not a drop.
  let leaving = false
  let rejoining = false
  // A drop of the NEW connection while a rejoin is still finishing (mic,
  // camera): kept, then acted on (review 679a9d48 N1), never swallowed.
  let rejoinLive = false
  let rejoinDrop: LiveConnectionEvent | null = null
  // The session whose /end gave up, for retryEnd.
  let endPending: Session | null = null
  // The session ended or left: unregister from the sign-out hook.
  let unregister: (() => void) | null = null
  // The screen has gone (detach): a /end give-up is reported, not shown.
  let detached = false
  // The unbound rejoin budget (review f2caccaa F2): an unbound removal soon
  // after a rejoin connected carries on from where that rejoin was in the
  // backoff, so a session that is never admitted runs out and says so.
  let budgetIndex = 0
  let connectedAt = 0
  let cancelStageWait: (() => void) | null = null
  // Bumped by every rejoin: a camera request that saw a rejoin start while
  // its token was minted is dropped (review f2caccaa F4).
  let rejoinGen = 0

  const set = (patch: Partial<LiveSessionState>) => {
    state = {...state, ...patch}
    onChange(state)
  }
  // Read through a function: the phase changes across awaits.
  const phase = (): LivePhase => state.phase
  const over = () => phase() === 'ended' || phase() === 'failed'
  const live = () =>
    phase() === 'connected' && !!session && !!room && !rejoining

  /** The runtime's /end, retried; the session is the account's that started it. */
  async function endOnRuntime(s: Session) {
    set({ending: true, endFailed: false})
    let ok = false
    for (let attempt = 0; ; attempt++) {
      const res = await api.endLiveSession({sid: s.sid, auth: s.auth})
      // not_found: already gone (or never ours), so it is ended. Anything
      // else that won't improve with a retry is a failure the owner sees.
      if (res.ok || res.error.kind === 'not_found') {
        ok = true
        break
      }
      if (['signed_out', 'invalid_argument'].includes(res.error.kind)) break
      const wait = END_RETRY_DELAYS_MS[attempt]
      if (wait === undefined) break
      await deps.sleep(wait)
    }
    endPending = ok ? null : s
    set({ending: false, endFailed: !ok})
    if (ok) unregister?.()
    else if (detached) deps.onEndGaveUp()
  }

  /** Leave the room (if any) and stop listening to it. */
  async function leaveRoom() {
    const r = room
    unsubscribe.forEach(off => off())
    unsubscribe = []
    if (!r) return
    leaving = true
    await r.disconnect().catch(() => {})
  }

  /**
   * Stop here. `endRuntime`: also end the runtime's session (not when the
   * session ended elsewhere or moved to another device).
   */
  function finish(
    patch: Partial<LiveSessionState>,
    {endRuntime}: {endRuntime: boolean},
  ): Promise<void> {
    if (ending) return ending
    cancelStageWait?.()
    cancelStageWait = null
    const s = session
    session = null
    set({
      micOn: false,
      cameraOn: false,
      cameraPending: false,
      stage: null,
      ...patch,
    })
    if (!endRuntime || !s) unregister?.()
    // /end first: its bearer is read now, before any await.
    const runtime = endRuntime && s ? endOnRuntime(s) : Promise.resolve()
    ending = Promise.all([runtime, leaveRoom()]).then(() => {})
    return ending
  }

  const fail = (error: LiveFailure) =>
    finish({phase: 'failed', error}, {endRuntime: true})

  /** A usable token: the one in hand while fresh, else a new one. */
  async function freshJoin(
    s: Session,
    camera: boolean,
  ): Promise<LiveResult<LiveJoin>> {
    const j = s.join
    if (!camera && j && j.expiresAt - TOKEN_MARGIN_S > deps.nowS()) {
      s.join = null // single use
      return {ok: true, data: j}
    }
    return mintJoin(s, camera)
  }

  /** Always a new token from the owner's session (POST .../token). */
  function mintJoin(
    s: Session,
    camera: boolean,
  ): Promise<LiveResult<LiveJoin>> {
    s.join = null
    return api.requestLiveToken({
      sid: s.sid,
      auth: s.auth,
      camera,
      devicePubKey: s.key?.publicKey ?? null,
    })
  }

  /**
   * The token to join with. A bound token is proven with the exchange and
   * the RETURNED token is the one that joins (R2 v2): the proven one never
   * does. An unbound token joins as minted. Throws on failure.
   */
  async function prove(s: Session, j: LiveJoin): Promise<string> {
    if (!j.popRequired) return j.token
    const sig = s.key ? joinProof(s.key, j.token) : null
    if (!sig) throw new JoinError('bad_proof')
    const proved = await api.proveLiveJoin({token: j.token, sig})
    if (!proved.ok) throw new JoinError(proved.error.kind)
    return proved.data.token
  }

  /** The proof, then the join. Throws on failure. */
  async function join(s: Session, j: LiveJoin) {
    const token = await prove(s, j)
    if (over()) throw new JoinError('connect')
    await room!.connect({wsUrl: s.wsUrl, token})
  }

  /**
   * Swap the connection for one on `j`: proven first, so a refused proof
   * never drops the live connection; audio kept across the gap.
   */
  async function swap(s: Session, j: LiveJoin) {
    const token = await prove(s, j)
    if (over()) throw new JoinError('connect')
    leaving = true
    await room!.disconnect({keepAudio: true}).catch(() => {})
    leaving = false
    if (over()) throw new JoinError('connect')
    // From here a drop belongs to the NEW connection (the runtime can refuse
    // it before connect() even resolves): keep it, never ignore it.
    rejoinLive = true
    await room!.connect({wsUrl: s.wsUrl, token})
  }

  function watchRoom(r: LiveRoom) {
    unsubscribe.push(
      r.onStageChange(stage =>
        set(
          stage && state.notice === 'agent_waiting'
            ? {stage, notice: null}
            : {stage},
        ),
      ),
      r.onConnectionChange(e => void onConnection(e)),
    )
  }

  async function onConnection(e: LiveConnectionEvent) {
    if (over()) return
    if (rejoining) {
      // Only the rejoin's own new connection counts; the old one's events
      // (and our own leave in the swap) are expected.
      if (rejoinLive && e.type === 'disconnected') rejoinDrop = e
      return
    }
    if (e.type === 'reconnecting') {
      if (phase() === 'connected') set({phase: 'reconnecting'})
      return
    }
    if (e.type === 'reconnected') {
      if (phase() === 'reconnecting') set({phase: 'connected'})
      return
    }
    // FINAL reasons (./rejoin.ts) end the session; anything else rejoins.
    if (e.reason === 'client') {
      if (leaving) return
      // A leave we didn't ask for: out of the room for good, as the workers
      // treat CLIENT_INITIATED. End the runtime session too (nothing to leave
      // the agent in).
      await finish({phase: 'ended', endReason: 'local'}, {endRuntime: true})
      return
    }
    if (e.reason === 'rejected') {
      await finish({phase: 'ended', endReason: 'removed'}, {endRuntime: false})
      return
    }
    if (e.reason === 'duplicate_identity') {
      await finish(
        {phase: 'ended', endReason: 'other_device'},
        {endRuntime: false},
      )
      return
    }
    if (e.reason === 'room_deleted') {
      await finish(
        {phase: 'ended', endReason: 'ended_elsewhere'},
        {endRuntime: false},
      )
      return
    }
    if (e.reason === 'removed' && session && !session.key) {
      // An unbound token (no device key) can't replace the held participant;
      // the runtime removes it until the dead one leaves (R2 v2, up to ~30 s).
      // Keep trying: the next mint says if the session is really over. A
      // removal soon after the last rejoin connected is that rejoin failing
      // after all, so it carries on in the same backoff (F2).
      const carry = deps.nowS() - connectedAt < LIVEKIT_DEPARTURE_TIMEOUT_S
      await rejoin(carry)
      return
    }
    if (e.reason === 'removed') {
      // The runtime removed us (withdrawn consent, a revoked or refused token):
      // it owns the session's state now. On a session continued from another
      // device, the usual cause is that device still holding it (review
      // 679a9d48 M2: a different device key can't replace it).
      await finish(
        {
          phase: 'ended',
          endReason:
            session?.reused &&
            deps.nowS() - (session.firstConnectedAt ?? 0) < STILL_OPEN_WINDOW_S
              ? 'still_open_elsewhere'
              : 'removed',
        },
        {endRuntime: false},
      )
      return
    }
    await rejoin()
  }

  /**
   * An unbound session's fresh join removed while the dead participant is
   * still held (R2 v2): not final, just this attempt failing. True when that
   * was the drop (it is consumed).
   */
  function unboundRemoval(s: Session): boolean {
    const d = rejoinDrop
    if (!d || s.key || d.type !== 'disconnected' || d.reason !== 'removed') {
      return false
    }
    rejoinDrop = null
    rejoinLive = false
    return true
  }

  /**
   * The new connection dropped while the rejoin was finishing: act on that
   * drop now (end, or rejoin again). True when there was one.
   */
  async function takeRejoinDrop(): Promise<boolean> {
    const d = rejoinDrop
    if (!d) return false
    rejoinDrop = null
    rejoinLive = false
    rejoining = false
    if (state.cameraPending) set({cameraPending: false})
    await onConnection(d)
    return true
  }

  /**
   * After a drop: a fresh token from the owner's session, proven if bound,
   * and a new join, with backoff; then give up and end. Never a resume.
   */
  async function rejoin(carry = false) {
    const s = session
    if (!s || !room) return
    rejoining = true
    rejoinGen++
    set({phase: 'reconnecting'})
    const wantCamera = state.cameraOn
    try {
      for (let i = carry ? budgetIndex : 0; i < REJOIN_BACKOFF_MS.length; i++) {
        budgetIndex = i + 1
        await deps.sleep(REJOIN_BACKOFF_MS[i])
        if (over()) return
        const t = await mintJoin(s, wantCamera)
        if (over()) return
        if (!t.ok) {
          const k = t.error.kind
          if (k === 'not_found') {
            await finish(
              {phase: 'ended', endReason: 'ended_elsewhere'},
              {endRuntime: false},
            )
            return
          }
          if (k === 'consent_required') {
            await finish(
              {phase: 'ended', endReason: 'consent_withdrawn'},
              {endRuntime: false},
            )
            return
          }
          if (k === 'signed_out') {
            await fail('signed_out')
            return
          }
          continue
        }
        // A fresh token, never the one in hand: a join token is single use.
        try {
          await swap(s, t.data)
          rejoinLive = true
          // Each step: an unbound removal is this attempt failing (next
          // backoff); any other drop is acted on.
          if (over()) return
          if (unboundRemoval(s)) continue
          if (await takeRejoinDrop()) return
          // Blind first: a new connection carries no state, and the agent
          // must not see anything before it is blinded again (F9).
          await resendBlind()
          if (over()) return
          if (unboundRemoval(s)) continue
          if (await takeRejoinDrop()) return
          await room.setMicrophoneEnabled(state.micOn)
          if (over()) return
          if (unboundRemoval(s)) continue
          if (await takeRejoinDrop()) return
          if (wantCamera) await room.setCameraEnabled(true)
          if (over()) return
          if (unboundRemoval(s)) continue
          if (await takeRejoinDrop()) return
          rejoinLive = false
          connectedAt = deps.nowS()
          set({phase: 'connected'})
          return
        } catch (e) {
          leaving = false
          if (over()) return
          // A server without the new join flow won't get better with a retry.
          if (e instanceof JoinError && e.kind === 'server_outdated') {
            await fail('server_outdated')
            return
          }
          if (unboundRemoval(s)) continue
          if (await takeRejoinDrop()) return
          rejoinLive = false
        }
      }
      // Out of budget. An unbound continued session that is never admitted is
      // most likely still held by the other device (F2).
      if (!s.key && s.reused) {
        await finish(
          {phase: 'ended', endReason: 'still_open_elsewhere'},
          {endRuntime: false},
        )
      } else {
        await fail('reconnect_failed')
      }
    } finally {
      rejoining = false
      rejoinLive = false
      rejoinDrop = null
    }
  }

  /** The owner's token is in hand: join and turn the mic on. */
  async function connect(s: Session) {
    set({phase: 'connecting'})
    try {
      const r = roomFactory({sid: s.sid})
      room = r
      watchRoom(r)
      const t = await freshJoin(s, false)
      if (over()) return
      if (!t.ok) {
        await fail(
          t.error.kind === 'consent_required'
            ? 'consent_incomplete'
            : t.error.kind,
        )
        return
      }
      await join(s, t.data)
      s.firstConnectedAt = deps.nowS()
      if (over() || rejoining) return
      // The owner's intent is mic on, also for a rejoin that starts while
      // this call is out (it restores state.micOn).
      set({micOn: true})
      await r.setMicrophoneEnabled(true)
    } catch (e) {
      if (!over() && !rejoining) {
        await fail(e instanceof JoinError ? e.kind : 'connect')
      }
      return
    }
    // A drop during the first join started a rejoin: it decides (F3).
    if (over() || rejoining) return
    budgetIndex = 0
    connectedAt = deps.nowS()
    set({phase: 'connected'})
    cancelStageWait = deps.setTimer(STAGE_WAIT_MS, () => {
      if (state.phase === 'connected' && !state.stage) {
        set({notice: 'agent_waiting'})
      }
    })
  }

  /** A new connection carries no state: blind again if the owner had it on. */
  async function resendBlind() {
    if (!state.blindOn || !room) return
    const msg = blindMessage(true, ALL_SOURCES)
    if (!msg) return
    await room
      .publishData(encodeBlindMessage(msg), {
        topic: BLIND_TOPIC,
        reliable: true,
      })
      .catch(() => set({notice: 'action_failed'}))
  }

  async function afterStart() {
    const s = session
    if (!s) return
    // Already decided in this session (a reused one): straight to the join.
    if (s.join) {
      await connect(s)
      return
    }
    set({phase: 'consent'})
  }

  async function rejoinWithoutCamera() {
    set({cameraOn: false})
    await rejoin()
  }

  const controller: LiveSessionController = {
    async begin() {
      if (phase() !== 'idle') return
      set({phase: 'starting', error: null})
      // Asked before anything exists on the runtime: no session for a person
      // who said no.
      if ((await deps.requestMicAccess()) !== 'granted') {
        if (phase() === 'starting') set({phase: 'failed', error: 'mic_denied'})
        return
      }
      const auth = await api.captureLiveAuth()
      if (!auth) {
        if (phase() === 'starting') set({phase: 'failed', error: 'signed_out'})
        return
      }
      const key = await deps.getDeviceKey(auth.ownerDid)
      if (phase() !== 'starting') return
      const res = await api.startLiveSession({
        agentDid,
        auth,
        devicePubKey: key?.publicKey ?? null,
      })
      if (!res.ok) {
        if (phase() === 'starting') {
          set({phase: 'failed', error: res.error.kind})
        }
        return
      }
      const {
        sid,
        wsUrl,
        join: j,
        consentRequired,
        recordPolicy,
        reused,
      } = res.data
      session = {sid, wsUrl, auth, key, join: j, reused}
      // Sign-out / switch: end it, or re-send a /end that gave up (F5).
      unregister = registerLiveSession(() =>
        state.endFailed ? controller.retryEnd() : controller.end(),
      )
      // Left before the runtime answered: end the session it just made (not a
      // reused one, which may be live on another device).
      if (phase() !== 'starting') {
        const s = session
        session = null
        if (reused) unregister?.()
        else await endOnRuntime(s)
        return
      }
      set({consentRequired, recordPolicy})
      if (reused) {
        set({phase: 'reuse'})
        return
      }
      await afterStart()
    },

    async continueHere() {
      if (phase() !== 'reuse') return
      await afterStart()
    },

    async submitConsent(choices) {
      const s = session
      if (phase() !== 'consent' || !s) return
      if (!canGoLive(state.consentRequired, choices)) return
      set({phase: 'connecting'})
      const res = await api.submitLiveConsent({
        sid: s.sid,
        auth: s.auth,
        decisions: decisionsFor(state.consentRequired, choices),
        textVersion: CONSENT_TEXT_VERSION,
        devicePubKey: s.key?.publicKey ?? null,
      })
      if (over()) return
      if (!res.ok) {
        await fail(res.error.kind)
        return
      }
      if (!res.data.admitted) {
        await fail('consent_incomplete')
        return
      }
      if (!res.data.join) {
        await fail('unavailable')
        return
      }
      // The agent's job didn't start (review 679a9d48 N2): don't join an
      // agentless room and wait for a stage that never comes.
      if (res.data.agent !== 'started' && res.data.agent !== 'running') {
        await fail('agent_unavailable')
        return
      }
      s.join = res.data.join
      await connect(s)
    },

    async setMic(on) {
      if (!live()) return
      try {
        await room!.setMicrophoneEnabled(on)
        set({micOn: on, notice: null})
      } catch {
        set({notice: 'action_failed'})
      }
    },

    async setBlind(on, src = ALL_SOURCES) {
      if (!live()) return false
      const msg = blindMessage(on, src)
      if (!msg) return false
      try {
        await room!.publishData(encodeBlindMessage(msg), {
          topic: BLIND_TOPIC,
          reliable: true,
        })
      } catch {
        set({notice: 'action_failed'})
        return false
      }
      if (src === ALL_SOURCES) set({blindOn: on, notice: null})
      return true
    },

    async setCamera(on) {
      if (!live() || state.cameraPending || on === state.cameraOn) return
      const s = session!
      const r = room!
      if (!on) {
        try {
          await r.setCameraEnabled(false)
          set({cameraOn: false, notice: null})
        } catch {
          set({notice: 'action_failed'})
        }
        return
      }
      set({cameraPending: true, notice: null})
      if ((await deps.requestCameraAccess()) !== 'granted') {
        if (!over()) set({cameraPending: false, notice: 'camera_denied'})
        return
      }
      if (!live()) {
        if (!over()) set({cameraPending: false})
        return
      }
      const gen = rejoinGen
      const res = await freshJoin(s, true)
      if (over()) return
      // A drop while the camera token was minted started a rejoin (running
      // or done): don't swap alongside it or onto its connection (F4).
      if (!live() || gen !== rejoinGen) {
        set({cameraPending: false, notice: 'camera_failed'})
        return
      }
      if (!res.ok) {
        if (res.error.kind === 'consent_required') {
          await finish(
            {phase: 'ended', endReason: 'consent_withdrawn'},
            {endRuntime: false},
          )
          return
        }
        set({cameraPending: false, notice: 'camera_failed'})
        return
      }
      // The new grant takes effect on join, so rejoin with the camera token
      // before publishing anything from the camera. The token is proven by
      // this device's key, so the runtime lets it replace the connected owner.
      rejoining = true
      try {
        await swap(s, res.data)
        rejoinLive = true
        if (over() || (await takeRejoinDrop())) return
        await resendBlind()
        if (over() || (await takeRejoinDrop())) return
        await r.setMicrophoneEnabled(state.micOn)
        if (over() || (await takeRejoinDrop())) return
        await r.setCameraEnabled(true)
        if (over() || (await takeRejoinDrop())) return
        rejoinLive = false
      } catch {
        leaving = false
        if (over() || (await takeRejoinDrop())) return
        rejoinLive = false
        rejoining = false
        set({cameraPending: false, notice: 'camera_failed'})
        // Back without the camera; this ends the session if it can't.
        await rejoinWithoutCamera()
        return
      }
      rejoining = false
      if (over()) return
      set({cameraPending: false, cameraOn: true})
    },

    async end() {
      if (phase() === 'ended' || phase() === 'failed') {
        if (ending) await ending
        return
      }
      // A session not created yet: `begin` ends it when the runtime answers.
      // Declining "continue here?" leaves the open session alone: it may be
      // live on the owner's other device.
      await finish(
        {phase: 'ended', endReason: 'local'},
        {endRuntime: phase() !== 'reuse'},
      )
    },

    async retryEnd() {
      const s = endPending
      if (!s || state.ending) return
      await endOnRuntime(s)
    },

    detach({failureSeen = false} = {}) {
      detached = true
      if (state.endFailed && !failureSeen) deps.onEndGaveUp()
    },

    room: () => room,
  }
  return controller
}

class JoinError extends Error {
  constructor(readonly kind: LiveFailure) {
    super(kind)
  }
}
