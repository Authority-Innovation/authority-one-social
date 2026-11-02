/**
 * One owner live session. Plain TypeScript (no React, no SDK) so the rules
 * below are tested without a device.
 *
 * FLOW (design r2 §6). Nothing happens until the owner taps:
 *   idle → begin() (a tap) → mic access → POST /live/sessions (a session, no
 *   media) → [reuse: the open-session panel] → consent sheet → POST .../consent →
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
import {markHeldHere, wasHeldHere} from './heldSessions'
import {
  type MediaAccess,
  requestCameraAccess,
  requestMicAccess,
} from './permissions'
import {type DeviceKey, joinProof} from './pop'
import {registerLiveSession} from './registry'
import {REJOIN_BACKOFF_MS, REJOIN_REFUSED_GRACE_S} from './rejoin'
import {
  type LiveConnectionEvent,
  type LiveConnectStep,
  type LiveRoom,
  type LiveRoomFactory,
  type StageRef,
} from './room'
// Directly, not via ./room (whose loader screen tests mock).
import {LiveStepError} from './room/types'

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
  /** Consent was admitted but the runtime sent no join token. */
  | 'no_join'

/** Why a session ended (the screen words it). */
export type LiveEndReason =
  | 'local'
  | 'ended_elsewhere'
  | 'removed'
  | 'other_device'
  | 'consent_withdrawn'
  | 'still_open_elsewhere'
  /** The owner left a reused session they had not taken over; it runs on. */
  | 'left_open'
  /** The runtime refused it; stopped here with no /end (it runs on). */
  | 'refused'
  /** Rejoins refused until the ladder ran out; no /end (it runs on). */
  | 'refused_reconnect'
  /**
   * Cancel while starting, and this device created no session to end (the
   * start found one already open, or failed): nothing to say (3b593301c F18).
   */
  | 'cancelled'

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
  /**
   * On `reuse` (the server says the session is open, maybe on another
   * device): this device can take it over (it holds the key R3 needs: it
   * held this session itself).
   */
  canTakeOver: boolean
  /**
   * On `reuse`: this device has a key (a bound session). Unbound, it can't
   * continue the session at all: "Couldn't reconnect" (Dispatch ruling).
   */
  reuseBound: boolean
  /**
   * Stopped here without /end (not the owner's action, not an outage): the
   * runtime session may run on to its time limit. The screen says so.
   */
  leftRunning: boolean
  /**
   * Cancel came while the start call was out (review 784dbc925 F18): the
   * session it makes is ended when the runtime answers. Until then nothing
   * has ended, and the screen says it is stopping.
   */
  stopping: boolean
  /**
   * The first join's step that failed (`failed` only): the screen shows it
   * as a short code so a screenshot names it.
   */
  failStep: LiveConnectStep | null
  /** The error's name at that step (e.g. TypeError), shown with it. */
  failError: string | null
  /** The runtime's /end is still being sent (retried). */
  ending: boolean
  /**
   * /end has been out for END_SLOW_MS without an answer (review d8f8f16e
   * H2): the screen offers "Leave anyway"; the end carries on, and a
   * give-up after leaving is reported (toast).
   */
  endSlow: boolean
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
  leftRunning: false,
  stopping: false,
  failStep: null,
  failError: null,
  canTakeOver: false,
  reuseBound: false,
  ending: false,
  endSlow: false,
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
  /** This device held that session itself (heldSessions.ts). */
  wasHeldHere: (ownerDid: string, sid: string) => Promise<boolean>
  markHeldHere: (ownerDid: string, sid: string) => Promise<void>
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
  wasHeldHere,
  markHeldHere,
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
/** Waits between /end attempts (the route is idempotent). */
export const END_RETRY_DELAYS_MS = [1000, 3000, 7000]
/** /end out this long with no answer: offer "Leave anyway" (d8f8f16e H2). */
export const END_SLOW_MS = 8_000
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
  /**
   * The screen went away without the owner ending (an OS unmount; Dispatch
   * ruling on 0dcc84ad3 P3): leave the room, so the mic isn't live with no
   * screen, but don't end the session. It stays registered, so sign-out
   * still ends it; reopening Live finds it (`reused`).
   */
  leave(): Promise<void>
  /** On `reuse`: end the open session (on every device), stopping the agent. */
  endOpen(): Promise<void>
  /** Send the runtime's /end again after it gave up (`endFailed`). */
  retryEnd(): Promise<void>
  /**
   * The screen has gone: from now on a /end that gives up is reported
   * through `onEndGaveUp` (there is no screen to show it). `failureSeen`: the
   * screen already showed a give-up the owner chose to leave anyway.
   */
  detach(opts?: {failureSeen?: boolean}): void
  /**
   * The screen is (or is no longer) the one in front. A /end that gives up
   * while it is not (pushed over, review d8f8f16e H1) is reported through
   * `onEndGaveUp`: the failed-end panel would be behind another screen.
   */
  setOnScreen(on: boolean): void
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
  /**
   * A reused session this device has really taken over: a join stayed up
   * past the refused window (REJOIN_REFUSED_GRACE_S). Until then it is the
   * other device's, and nothing here ends it on its own (Dispatch ruling on
   * review 7f87024af N1).
   */
  tookOver?: boolean
  /**
   * The runtime refused something for this session (a proof, a mint, a join:
   * R3's removal or a refused rejoin). Dispatch ruling on review 7f87024af:
   * after any refusal the client never sends /end on its own; only the
   * owner's explicit End does. Kept per ladder (PC ruling, round 347): a
   * fresh ladder after an unrefused drop starts clean, so the 16 s give-up
   * is an outage (with /end) only if no rung of THAT ladder was refused.
   */
  refused?: boolean
}

/**
 * A log-safe error message: no tokens (JWTs, access_token / token query
 * values), at most 200 characters.
 */
export function scrub(message: string): string {
  return message
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, '<jwt>')
    .replace(/((?:access_)?token=)[^&\s"']+/gi, '$1<redacted>')
    .slice(0, 200)
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
  // The screen went away without the owner ending (leave()).
  let screenLeft = false
  // Cancel while starting: begin ended the session this device created.
  let endedCreated = false
  let onScreen = true
  // This give-up was already reported off-screen (toast): not again on detach.
  let giveUpReported = false
  // The rejoin ladder's next rung. A refused rejoin (R2 rev 4) carries on
  // from here rather than resetting, so a session that is never admitted
  // runs out and says so (review f2caccaa F2).
  let budgetIndex = 0
  let connectedAt = 0
  // The current connection was made by a rejoin (connectedAt is its time).
  let connFromRejoin = false
  // The mic as the owner last set it: what a rejoin publishes (G4).
  let wantMic = true
  let cancelStageWait: (() => void) | null = null
  let cancelTakeover: (() => void) | null = null
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
    set({ending: true, endSlow: false, endFailed: false})
    giveUpReported = false
    const cancelSlow = deps.setTimer(END_SLOW_MS, () => {
      if (state.ending) set({endSlow: true})
    })
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
    cancelSlow()
    endPending = ok ? null : s
    set({ending: false, endSlow: false, endFailed: !ok})
    if (ok) unregister?.()
    else if (detached || !onScreen) {
      giveUpReported = true
      deps.onEndGaveUp()
    }
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
   *
   * One rule for every path (review 7f87024af N1-N4): a reused session this
   * device has not taken over is the other device's, so only the owner's
   * explicit "End the live session" (`owner`) ends it. Any other stop leaves
   * it running and says so.
   */
  function finish(
    patch: Partial<LiveSessionState>,
    {
      endRuntime,
      owner = false,
      everywhere = false,
      keepRegistered = false,
    }: {
      endRuntime: boolean
      /**
       * The owner's explicit action (Dispatch ruling on 0dcc84ad3 P3): End,
       * a deliberate back, Cancel, sign-out or an account switch. Being
       * covered, backgrounded or unmounted is not (it never calls end()).
       */
      owner?: boolean
      /** The open-session panel's "End the live session" (every device). */
      everywhere?: boolean
      /** Stay registered for sign-out (leave()). */
      keepRegistered?: boolean
    },
  ): Promise<void> {
    if (ending) return ending
    cancelStageWait?.()
    cancelStageWait = null
    cancelTakeover?.()
    cancelTakeover = null
    const s = session
    session = null
    // When /end goes out (Dispatch rulings on 7f87024af and 0dcc84ad3):
    // 1. a reused session not taken over: only the panel's End for every
    //    device;
    // 2. the owner's own action (End, a deliberate back, Cancel, sign-out);
    // 3. otherwise never after a refusal;
    // 4. otherwise only after an outage on this device's own session;
    // 5. anything else stops here and says the session wasn't ended.
    // A session of ours stopped here without /end stays owed to sign-out,
    // which is the owner's action (review c23bdc031 F10).
    let owed = false
    if (endRuntime && s && !everywhere) {
      if (s.reused && !s.tookOver) {
        endRuntime = false
        patch = leftOpen(patch)
      } else if (!owner && s.refused) {
        endRuntime = false
        owed = true
        patch = refusedLeftOpen(patch)
      } else if (!owner && !isOutage(patch)) {
        endRuntime = false
        owed = true
        patch = {...patch, leftRunning: true}
      }
    }
    if (owed && s) {
      keepRegistered = true
      endPending = s
    }
    set({
      micOn: false,
      cameraOn: false,
      cameraPending: false,
      stage: null,
      ...patch,
    })
    if ((!endRuntime || !s) && !keepRegistered) unregister?.()
    // /end first: its bearer is read now, before any await.
    const runtime = endRuntime && s ? endOnRuntime(s) : Promise.resolve()
    ending = Promise.all([runtime, leaveRoom()]).then(() => {})
    return ending
  }

  const fail = (
    error: LiveFailure,
    failStep: LiveConnectStep | null = null,
    failError: string | null = null,
  ) => finish({phase: 'failed', error, failStep, failError}, {endRuntime: true})

  /**
   * One line per failed join step: the step, the error's name and message.
   * Returns the name (shown on screen with the step).
   */
  function logStepFailure(step: LiveConnectStep, e: unknown): string {
    const name =
      e instanceof JoinError
        ? `JoinError:${e.kind}`
        : e instanceof Error
          ? e.name
          : typeof e === 'string'
            ? e
            : typeof e
    const message = scrub(e instanceof Error ? e.message : String(e))
    logger.warn('agentLive: join step failed', {step, name, message})
    return name
  }

  /**
   * A failure that is an outage of this device's own session (the network,
   * the runtime's 5xx, a garbled reply, a reconnect ladder that ran out with
   * no refused rung): /end is allowed. Refusals are caught before this.
   */
  const OUTAGES: ReadonlySet<LiveFailure> = new Set([
    'network',
    'unavailable',
    'http',
    'bad_response',
    'reconnect_failed',
  ])
  const isOutage = (patch: Partial<LiveSessionState>) =>
    patch.phase === 'failed' && !!patch.error && OUTAGES.has(patch.error)

  /** Errors that say what to do, kept as they are; anything else says "left open". */
  const KEEP_ON_LEFT_OPEN: ReadonlySet<LiveFailure> = new Set([
    'mic_denied',
    'signed_out',
    'server_outdated',
  ])
  /** A held session stopped after a refusal, with no /end: say so. */
  function refusedLeftOpen(patch: Partial<LiveSessionState>) {
    if (patch.phase === 'failed' && KEEP_ON_LEFT_OPEN.has(patch.error!)) {
      return patch
    }
    // The ladder ran out on refusals: rev 4's "Couldn't reconnect", but
    // honest that nothing was ended.
    const endReason =
      patch.phase === 'failed' && patch.error === 'reconnect_failed'
        ? ('refused_reconnect' as const)
        : ('refused' as const)
    return {phase: 'ended' as const, endReason, error: null}
  }

  /**
   * A runtime answer that refuses (as opposed to an outage, which is
   * retried): 401, 403, 404, any other 4xx but 408 and 429, a bad proof.
   */
  function isRefusal(e: LiveError): boolean {
    switch (e.kind) {
      case 'bad_proof':
      case 'not_found':
      case 'consent_required':
      case 'signed_out':
      case 'invalid_argument':
        return true
      case 'http':
        return (
          e.status >= 400 &&
          e.status < 500 &&
          e.status !== 408 &&
          e.status !== 429
        )
      default:
        return false
    }
  }
  function noteRefusal(s: Session, e: LiveError) {
    if (isRefusal(e)) s.refused = true
  }

  function leftOpen(patch: Partial<LiveSessionState>) {
    if (patch.phase === 'failed' && KEEP_ON_LEFT_OPEN.has(patch.error!)) {
      return patch
    }
    // The owner chose to stop: "left open"; a failure: "couldn't take over".
    return patch.phase === 'ended' && patch.endReason === 'local'
      ? {phase: 'ended' as const, endReason: 'left_open' as const, error: null}
      : {
          phase: 'ended' as const,
          endReason: 'still_open_elsewhere' as const,
          error: null,
        }
  }

  /**
   * A reused session's join that stays up past the refused window is a real
   * takeover: from then on the session is this device's.
   */
  function armTakeover(s: Session) {
    if (!s.reused || s.tookOver) return
    cancelTakeover?.()
    const at = connectedAt
    cancelTakeover = deps.setTimer(REJOIN_REFUSED_GRACE_S * 1000, () => {
      cancelTakeover = null
      if (session === s && phase() === 'connected' && connectedAt === at) {
        s.tookOver = true
      }
    })
  }

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
   * The token to join with. A bound token is proven, which always trades it
   * (R2 rev 4), and the RETURNED token is the one that joins: the proven one
   * never does. An unbound token joins as minted. Throws on failure.
   */
  async function prove(s: Session, j: LiveJoin): Promise<string> {
    if (!j.popRequired) return j.token
    const sig = s.key ? joinProof(s.key, j.token) : null
    if (!sig) throw new JoinError('bad_proof')
    const proved = await api.proveLiveJoin({token: j.token, sig})
    if (!proved.ok) {
      noteRefusal(s, proved.error)
      throw new JoinError(proved.error.kind)
    }
    return proved.data.token
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
      // treat CLIENT_INITIATED. Not the owner's action, so no /end (review
      // 0dcc84ad3 P4): the screen says it wasn't ended.
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
    // A refused rejoin (R2 rev 4): the next rung, no ladder reset. The first
    // join of a continued session is a rejoin of the held one: its removal,
    // even before connect() resolves, is refused the same way (the other
    // device may still hold it; ruling, review 7919b5692 item 8).
    if (
      e.reason === 'removed' &&
      ((connFromRejoin && deps.nowS() - connectedAt < REJOIN_REFUSED_GRACE_S) ||
        (session?.reused && phase() === 'connecting'))
    ) {
      await rejoin(true, true)
      return
    }
    if (e.reason === 'removed' && session && !session.key) {
      // An unbound token (no device key) can't replace the held participant;
      // the runtime removes it until the dead one leaves (R2 v2, up to ~30 s).
      // Keep trying: the next mint says if the session is really over.
      await rejoin(false, true)
      return
    }
    if (e.reason === 'removed') {
      // The runtime removed us (withdrawn consent, a revoked or refused token):
      // it owns the session's state now.
      await finish({phase: 'ended', endReason: 'removed'}, {endRuntime: false})
      return
    }
    await rejoin()
  }

  /**
   * The rejoin's new connection removed while the rejoin is still finishing:
   * a refused rejoin (R2 rev 4; bound or unbound, the old participant is
   * still held), not final, just this attempt failing. True when that was
   * the drop (it is consumed).
   */
  function refusedRemoval(): boolean {
    const d = rejoinDrop
    if (!d || d.type !== 'disconnected' || d.reason !== 'removed') {
      return false
    }
    if (session) session.refused = true
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
   * and a new join, with backoff; then give up (with /end only after an
   * outage, never a refusal). Never a resume. `carry`: the same ladder goes
   * on (a refused rung); otherwise a new ladder, whose refusal record starts
   * as `refusal` (the drop that started it was a refusal, or not: P2).
   */
  async function rejoin(carry = false, refusal = false) {
    const s = session
    if (!s || !room) return
    if (!carry) s.refused = false
    if (refusal) s.refused = true
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
          noteRefusal(s, t.error)
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
          // A refused mint is final (R2 rev 4): any other 4xx answer. Only an
          // outage (network, 5xx, 408, 429, a garbled reply) is retried.
          if (
            k === 'invalid_argument' ||
            (k === 'http' &&
              t.error.status >= 400 &&
              t.error.status < 500 &&
              t.error.status !== 408 &&
              t.error.status !== 429)
          ) {
            // No /end (Dispatch ruling on 7f87024af, which replaces J1): the
            // client never ends a session on a refusal; finish()'s rule turns
            // this into "refused" (or "still open" on a reused session).
            await finish(
              {phase: 'ended', endReason: 'refused'},
              {endRuntime: true},
            )
            return
          }
          continue
        }
        // A fresh token, never the one in hand: a join token is single use.
        try {
          await swap(s, t.data)
          rejoinLive = true
          // Each step: a removal is a refused rejoin, this attempt failing
          // (next rung, R2 rev 4); any other drop is acted on.
          if (over()) return
          if (refusedRemoval()) continue
          if (await takeRejoinDrop()) return
          // Blind first: a new connection carries no state, and the agent
          // must not see anything before it is blinded again (F9).
          await resendBlind()
          if (over()) return
          if (refusedRemoval()) continue
          if (await takeRejoinDrop()) return
          // The owner's intent, also when the drop came before the first
          // join turned the mic on (review 30f293f4 G4).
          await room.setMicrophoneEnabled(wantMic)
          if (over()) return
          set({micOn: wantMic})
          if (refusedRemoval()) continue
          if (await takeRejoinDrop()) return
          if (wantCamera) await room.setCameraEnabled(true)
          if (over()) return
          if (refusedRemoval()) continue
          if (await takeRejoinDrop()) return
          rejoinLive = false
          connectedAt = deps.nowS()
          connFromRejoin = true
          // This ladder recovered: its refusals don't carry into a later one
          // (review 27020b222 F17; the record is per ladder).
          s.refused = false
          set({phase: 'connected'})
          if (s.key) void deps.markHeldHere(s.auth.ownerDid, s.sid)
          armTakeover(s)
          // A first join that dropped before it connected never armed it (G4).
          if (!cancelStageWait && !state.stage) armStageWait()
          return
        } catch (e) {
          leaving = false
          if (over()) return
          // A server without the new join flow won't get better with a retry.
          if (e instanceof JoinError && e.kind === 'server_outdated') {
            await fail('server_outdated')
            return
          }
          if (refusedRemoval()) continue
          if (await takeRejoinDrop()) return
          rejoinLive = false
        }
      }
      // Out of budget: "Couldn't reconnect", with /end after an outage (R2
      // rev 4). finish() reads this ladder's refusal record: after a refused
      // rung, no /end and "refused_reconnect"; on a reused session not taken
      // over, no /end and "still open" (563477989 R1, 7f87024af N1/N3).
      await fail('reconnect_failed')
    } finally {
      rejoining = false
      rejoinLive = false
      rejoinDrop = null
    }
  }

  /** The owner's token is in hand: join and turn the mic on. */
  async function connect(s: Session) {
    set({phase: 'connecting'})
    // The step under way, for the log and the screen's code (build 43: the
    // first join failed on the phone with nothing to say where).
    let step: LiveConnectStep = 'room-setup'
    try {
      const r = roomFactory({sid: s.sid})
      room = r
      watchRoom(r)
      step = 'token'
      const t = await freshJoin(s, false)
      if (over()) return
      if (!t.ok) {
        noteRefusal(s, t.error)
        const name = logStepFailure(step, t.error.kind)
        await fail(
          t.error.kind === 'consent_required'
            ? 'consent_incomplete'
            : t.error.kind,
          step,
          name,
        )
        return
      }
      // The owner's intent is mic on, also for a rejoin that starts while
      // this call is out (it restores wantMic, review 30f293f4 G4).
      wantMic = true
      step = 'proof'
      const token = await prove(s, t.data)
      if (over()) throw new JoinError('connect')
      step = 'room-connect'
      await r.connect({wsUrl: s.wsUrl, token})
      if (over() || rejoining) return
      step = 'mic'
      set({micOn: true})
      await r.setMicrophoneEnabled(true)
    } catch (e) {
      const where = e instanceof LiveStepError ? e.step : step
      const cause = e instanceof LiveStepError ? e.cause : e
      const name = logStepFailure(where, cause)
      if (!over() && !rejoining) {
        await fail(e instanceof JoinError ? e.kind : 'connect', where, name)
      }
      return
    }
    // A drop during the first join started a rejoin: it decides (F3).
    if (over() || rejoining) return
    budgetIndex = 0
    connectedAt = deps.nowS()
    // A continued session's first join stands in for a rejoin of the held one.
    connFromRejoin = s.reused
    set({phase: 'connected'})
    if (s.key) void deps.markHeldHere(s.auth.ownerDid, s.sid)
    armTakeover(s)
    armStageWait()
  }

  function armStageWait() {
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
    // A refused camera proof started this ladder: it is recorded as refused
    // (review c23bdc031 F3), as a refused removal is.
    await rejoin(false, !!session?.refused)
  }

  async function beginSession() {
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
    // Sign-out / switch: end it, or send the /end that is still owed (a
    // /end that gave up, F5, or a session the screen left running).
    unregister = registerLiveSession(() =>
      endPending ? controller.retryEnd() : controller.end(),
    )
    // Left before the runtime answered: end the session it just made (not a
    // reused one, which may be live on another device).
    if (phase() !== 'starting') {
      const s = session
      session = null
      if (reused) unregister?.()
      // The screen went away (not Cancel): keep it owed to sign-out, P3.
      else if (screenLeft) endPending = s
      else {
        endedCreated = true
        await endOnRuntime(s)
      }
      return
    }
    set({consentRequired, recordPolicy})
    if (reused) {
      // R3 replaces a held participant only with the SAME key, proven, and
      // keys never leave a device: offer "Take over here" only when this
      // device held this session itself (review 563477989 R1).
      const canTakeOver = !!key && (await deps.wasHeldHere(auth.ownerDid, sid))
      if (phase() !== 'starting') return
      set({phase: 'reuse', canTakeOver, reuseBound: !!key})
      return
    }
    await afterStart()
  }

  const controller: LiveSessionController = {
    async begin() {
      endedCreated = false
      try {
        await beginSession()
      } finally {
        // However the start ended, a pending Cancel is now settled (F18). If
        // this device made a session, it was ended ("Live session ended.");
        // if not, there is nothing to say (review 3b593301c F18).
        if (state.stopping) {
          set({
            stopping: false,
            ...(endedCreated ? {} : {endReason: 'cancelled' as const}),
          })
        }
      }
    },

    async continueHere() {
      // Only a takeover R3 can admit (review 7f87024af N5).
      if (phase() !== 'reuse' || !state.canTakeOver) return
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
        noteRefusal(s, res.error)
        await fail(res.error.kind)
        return
      }
      if (!res.data.admitted) {
        // A consent refusal too (review 0dcc84ad3 P1): no /end.
        s.refused = true
        await fail('consent_incomplete')
        return
      }
      if (!res.data.join) {
        await fail('no_join')
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
        wantMic = on
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
        await r.setMicrophoneEnabled(wantMic)
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
      // Leaving the open-session panel leaves the session alone: it may be
      // live on the owner's other device (and says so, P6).
      const onPanel = phase() === 'reuse'
      // Cancel while the start call is out: begin ends what it makes when
      // the runtime answers; until then the screen says "stopping" (F18).
      const stopping = phase() === 'starting'
      await finish(
        {
          phase: 'ended',
          endReason: onPanel ? 'left_open' : 'local',
          ...(stopping ? {stopping: true} : {}),
        },
        {endRuntime: !onPanel, owner: true},
      )
    },

    async endOpen() {
      // On `reuse`: end the open session for every device (review 563477989
      // R3f: the only way to end it from here, also with no key).
      if (phase() !== 'reuse') return
      await finish(
        {phase: 'ended', endReason: 'local'},
        {endRuntime: true, everywhere: true},
      )
    },

    async leave() {
      if (phase() === 'ended' || phase() === 'failed' || phase() === 'idle') {
        return
      }
      screenLeft = true
      const s = session
      // A reused session not taken over is the other device's: not ours to
      // end at sign-out either.
      const ours = !!s && !(s.reused && !s.tookOver)
      // Owed before the await: a sign-out while the room disconnects still
      // finds it (review c23bdc031 F6).
      if (s && ours) endPending = s
      await finish(
        {phase: 'ended', endReason: 'left_open'},
        {endRuntime: false, keepRegistered: ours},
      )
    },

    async retryEnd() {
      const s = endPending
      if (!s || state.ending) return
      await endOnRuntime(s)
    },

    detach({failureSeen = false} = {}) {
      detached = true
      if (state.endFailed && !failureSeen && !giveUpReported) {
        giveUpReported = true
        deps.onEndGaveUp()
      }
    },

    setOnScreen(on) {
      onScreen = on
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
