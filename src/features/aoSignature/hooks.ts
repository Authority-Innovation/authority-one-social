import {useCallback, useMemo, useSyncExternalStore} from 'react'

import * as persisted from '#/state/persisted'
import {useAgent} from '#/state/session'
import {AO_SIGNATURE_CONFIG} from './config'
import {type AOPdsPort} from './signIn'
import {type AOState, getAOState, subscribeAO} from './store'

const DARK_STATE: AOState = {loaded: true, record: null, notice: null}
const subscribeNothing = () => () => {}
const getDark = () => DARK_STATE

/** The AO session state; a constant "nothing" while the lane is dark. */
export function useAOSignatureState(): AOState {
  const armed = AO_SIGNATURE_CONFIG !== null
  return useSyncExternalStore(
    armed ? subscribeAO : subscribeNothing,
    armed ? getAOState : getDark,
  )
}

export type AOGate = 'loading' | 'shell' | null

/**
 * What the navigator should render instead of the social app, if anything:
 *  · 'shell'  — signed in with Signature but not to the social app (no PDS
 *               session), or the AO session that speaks for this account
 *               still needs its first agent (the picker);
 *  · 'loading'— armed, no PDS session, and the device store is still being read;
 *  · null     — carry on exactly as before (always, while dark).
 */
export function useAOSignatureGate(
  hasSession: boolean,
  currentDid: string | undefined,
): AOGate {
  const s = useAOSignatureState()
  if (AO_SIGNATURE_CONFIG === null) return null
  if (!hasSession && !s.loaded) return 'loading'
  const r = s.record
  if (!r) return null
  if (!hasSession) return 'shell'
  if (currentDid === r.did && r.needsAgent) return 'shell'
  return null
}

function persistedPds(): {did: string; accessJwt: string} | null {
  try {
    const acct = persisted.get('session')?.currentAccount
    return acct?.did && acct.accessJwt
      ? {did: acct.did, accessJwt: acct.accessJwt}
      : null
  } catch {
    return null
  }
}

/** The persisted PDS session (what a web page reload has before the agent
 *  resumes) — used to finish a web link after the Janus round trip. */
export const persistedPdsPort: AOPdsPort = {
  current: persistedPds,
  refresh: () => Promise.resolve(persistedPds()),
}

/** The social app's PDS session for the link ceremony: the live agent's
 *  session (refreshable), falling back to the persisted one (web, at boot). */
export function usePdsPort(): AOPdsPort {
  const agent = useAgent()
  const current = useCallback((): {did: string; accessJwt: string} | null => {
    const live = agent.session
    if (live?.did && live.accessJwt) {
      return {did: live.did, accessJwt: live.accessJwt}
    }
    return persistedPds()
  }, [agent])
  return useMemo(
    () => ({
      current,
      async refresh() {
        await agent.sessionManager.refreshSession()
        return current()
      },
    }),
    [agent, current],
  )
}
