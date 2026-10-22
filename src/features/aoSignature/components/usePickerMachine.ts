import {useEffect, useReducer, useRef} from 'react'

import {type AOClient} from '../client'
import {
  initialPickerState,
  pickerEffect,
  type PickerPhase,
  pickerReducer,
} from '../picker'

/**
 * Drives the picker state machine. The side effect for a phase runs EXACTLY
 * once per phase object: keyed on phase identity (not on the token or the
 * whole state), with the token read from a ref — so a token refresh while
 * `creating`, or StrictMode's double effect, never re-POSTs /app/agents.
 *
 * `sid`: the AO session the picker runs for. It is captured when each phase's
 * effect STARTS; an answer that lands after the session changed (another
 * sign-in, a reverify) is dropped, so A's primary can never become B's. The
 * Shell also remounts the picker per sid (`key={record.sid}`).
 */
export function usePickerMachine(
  token: string,
  sid: string,
  client: AOClient | null,
) {
  const [state, dispatch] = useReducer(pickerReducer, initialPickerState)
  const tokenRef = useRef(token)
  const sidRef = useRef(sid)
  const started = useRef<PickerPhase | null>(null)

  useEffect(() => {
    tokenRef.current = token
    sidRef.current = sid
  }, [token, sid])

  const phase = state.phase
  useEffect(() => {
    if (!client || started.current === phase) return
    started.current = phase
    const sidAtStart = sidRef.current
    void pickerEffect(phase, client, tokenRef.current).then(ev => {
      // A different session now: this answer is not theirs.
      if (!ev || sidRef.current !== sidAtStart) return
      // The reducer ignores an event that no longer fits the phase.
      dispatch(ev)
    })
  }, [phase, client])

  return [state, dispatch] as const
}
