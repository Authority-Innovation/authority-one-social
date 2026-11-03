/**
 * One owner live session: start, mic, blind, camera, end. Plain TypeScript (no
 * React, no SDK) so the rules below are tested without a device.
 *
 * - Identity: the start call sends `agentDid` only (see ./api.ts). The owner
 *   is whoever the bearer says.
 * - Camera: off by default. Turning it on asks the runtime for a token with the
 *   CAMERA source first (POST /live/sessions/:sid/token {camera: true}),
 *   rejoins with that token, and only then publishes. If the token call
 *   fails, nothing is published. Turning it off unpublishes.
 * - Blind: owner-only (./blind.ts). Sent only on a session this owner started.
 * - The join token lives in this closure only: never logged or persisted.
 */
import {
  endLiveSession,
  type LiveError,
  requestLiveToken,
  startLiveSession,
} from './api'
import {
  ALL_SOURCES,
  BLIND_TOPIC,
  blindMessage,
  encodeBlindMessage,
} from './blind'
import {type LiveRoom, type LiveRoomFactory, type StageRef} from './room'

export type LivePhase = 'idle' | 'starting' | 'connected' | 'ended' | 'failed'

export type LiveSessionState = {
  phase: LivePhase
  /** Why the last step failed, if it did. */
  error: LiveError['kind'] | 'connect' | null
  micOn: boolean
  cameraOn: boolean
  /** A camera request is in flight. */
  cameraPending: boolean
  /** Blind on for all sources. */
  blindOn: boolean
  stage: StageRef | null
}

export const initialLiveSessionState: LiveSessionState = {
  phase: 'idle',
  error: null,
  micOn: false,
  cameraOn: false,
  cameraPending: false,
  blindOn: false,
  stage: null,
}

export type LiveApi = {
  startLiveSession: typeof startLiveSession
  requestLiveToken: typeof requestLiveToken
  endLiveSession: typeof endLiveSession
}

const defaultApi: LiveApi = {startLiveSession, requestLiveToken, endLiveSession}

export type LiveSessionController = {
  start(): Promise<void>
  setMic(on: boolean): Promise<void>
  /** Returns false when nothing was sent (no session, or a bad source id). */
  setBlind(on: boolean, src?: string): Promise<boolean>
  setCamera(on: boolean): Promise<void>
  end(): Promise<void>
  /** The room, once started (the screen renders its StageVideo). */
  room(): LiveRoom | null
}

export function createLiveSessionController({
  agentDid,
  roomFactory,
  onChange,
  api = defaultApi,
}: {
  agentDid: string
  roomFactory: LiveRoomFactory
  onChange: (state: LiveSessionState) => void
  api?: LiveApi
}): LiveSessionController {
  let state = initialLiveSessionState
  let session: {sid: string; wsUrl: string} | null = null
  let room: LiveRoom | null = null
  let offStage: (() => void) | null = null

  const set = (patch: Partial<LiveSessionState>) => {
    state = {...state, ...patch}
    onChange(state)
  }
  // Read through a function: the phase changes across awaits.
  const phase = (): LivePhase => state.phase
  const live = () => phase() === 'connected' && !!session && !!room

  return {
    async start() {
      if (state.phase !== 'idle') return
      set({phase: 'starting', error: null})
      const res = await api.startLiveSession({agentDid})
      if (!res.ok) {
        if (phase() === 'starting') {
          set({phase: 'failed', error: res.error.kind})
        }
        return
      }
      const {sid, wsUrl, token} = res.data
      // Left before the runtime answered: end the session it just made.
      if (phase() !== 'starting') {
        await api.endLiveSession({sid})
        return
      }
      session = {sid, wsUrl}
      const r = roomFactory({sid})
      room = r
      offStage = r.onStageChange(stage => set({stage}))
      try {
        await r.connect({wsUrl, token})
        await r.setMicrophoneEnabled(true)
      } catch {
        if (phase() === 'starting') set({phase: 'failed', error: 'connect'})
        return
      }
      // Left while connecting: end() has already ended the session.
      if (phase() !== 'starting') {
        await r.disconnect().catch(() => {})
        return
      }
      set({phase: 'connected', micOn: true})
    },

    async setMic(on) {
      if (!live()) return
      await room!.setMicrophoneEnabled(on)
      set({micOn: on})
    },

    async setBlind(on, src = ALL_SOURCES) {
      if (!live()) return false
      const msg = blindMessage(on, src)
      if (!msg) return false
      await room!.publishData(encodeBlindMessage(msg), {
        topic: BLIND_TOPIC,
        reliable: true,
      })
      if (src === ALL_SOURCES) set({blindOn: on})
      return true
    },

    async setCamera(on) {
      if (!live() || state.cameraPending || on === state.cameraOn) return
      if (!on) {
        await room!.setCameraEnabled(false)
        set({cameraOn: false})
        return
      }
      set({cameraPending: true, error: null})
      const res = await api.requestLiveToken({sid: session!.sid, camera: true})
      if (!res.ok) {
        set({cameraPending: false, error: res.error.kind})
        return
      }
      try {
        // The new grant takes effect on join, so rejoin with the camera token
        // before publishing anything from the camera.
        await room!.disconnect()
        await room!.connect({wsUrl: session!.wsUrl, token: res.data.token})
        await room!.setMicrophoneEnabled(state.micOn)
        await room!.setCameraEnabled(true)
      } catch {
        set({cameraPending: false, error: 'connect'})
        return
      }
      set({cameraPending: false, cameraOn: true})
    },

    async end() {
      if (state.phase === 'ended') return
      const s = session
      const r = room
      session = null
      offStage?.()
      offStage = null
      set({phase: 'ended', micOn: false, cameraOn: false, stage: null})
      if (r) await r.disconnect().catch(() => {})
      if (s) await api.endLiveSession({sid: s.sid})
    },

    room: () => room,
  }
}
