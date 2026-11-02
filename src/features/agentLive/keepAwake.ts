import {useEffect} from 'react'
import {activateKeepAwakeAsync, deactivateKeepAwake} from 'expo-keep-awake'

import {logger} from '#/logger'
import {type LivePhase} from './session'

// Its own tag: an untagged release elsewhere (a video unmounting) must not
// let the screen sleep under a running session.
export const LIVE_KEEP_AWAKE_TAG = 'agentLive'

/** From the owner's tap until the session is over, idle or failed. */
export function keepsAwake(phase: LivePhase): boolean {
  return phase !== 'idle' && phase !== 'ended' && phase !== 'failed'
}

/**
 * Turns the idle timer off while a Live session is open, and back on when it
 * ends or the screen goes (Elliott on build 47: the screen went dark after a
 * few minutes while the agent kept talking). Not tied to focus: a screen
 * pushed over Live leaves the session running.
 */
export function useLiveKeepAwake(phase: LivePhase) {
  const on = keepsAwake(phase)
  useEffect(() => {
    if (!on) return
    activateKeepAwakeAsync(LIVE_KEEP_AWAKE_TAG).catch(e =>
      logger.warn('agentLive: keep awake failed', {safeMessage: e}),
    )
    return () => {
      deactivateKeepAwake(LIVE_KEEP_AWAKE_TAG).catch(() => {})
    }
  }, [on])
}
