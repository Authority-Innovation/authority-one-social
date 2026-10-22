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
 */
export function usePickerMachine(token: string, client: AOClient | null) {
  const [state, dispatch] = useReducer(pickerReducer, initialPickerState)
  const tokenRef = useRef(token)
  const started = useRef<PickerPhase | null>(null)

  useEffect(() => {
    tokenRef.current = token
  }, [token])

  const phase = state.phase
  useEffect(() => {
    if (!client || started.current === phase) return
    started.current = phase
    void pickerEffect(phase, client, tokenRef.current).then(ev => {
      // The reducer ignores an event that no longer fits the phase.
      if (ev) dispatch(ev)
    })
  }, [phase, client])

  return [state, dispatch] as const
}
