/**
 * CONTINUOUS VOICE-CHAT STATE MACHINE (pure).
 *
 * Models the hands-free "phone call with Bob" loop as an explicit state machine so
 * the loop logic is deterministic and unit-testable in isolation from React, the
 * mic, and TTS. The hook `useVoiceConversation` performs the emitted commands and
 * feeds real events back in.
 *
 *            ┌──────── TOGGLE_ON ────────┐
 *            ▼                           │
 *   off ──► listening ──ENDPOINT(text)──► thinking ──REPLY_READY(text)──► speaking
 *            ▲   ▲                                                          │  │
 *            │   └────────────── SPEAK_DONE ─────────────────────────────-─┘  │
 *            │                                                                  │
 *            └────────────────── SPEECH_ACTIVITY (barge-in) ───────────────────┘
 *
 * - listening: mic open, on-device STT streaming. Silence (endpointing) ends the
 *   utterance and sends it as a turn.
 * - thinking: turn in flight; mic closed so we don't capture during the wait.
 * - speaking: Bob's reply is playing AND the mic is reopened so the user can
 *   BARGE IN — any speech activity cuts playback and returns to listening.
 * - TOGGLE_OFF from anywhere returns to `off` and stops mic + playback.
 *
 * The reducer is a pure function: (state, event) → {state, commands}. It performs no
 * side effects; the hook runs the commands (START_LISTENING / STOP_LISTENING / SEND /
 * SPEAK / STOP_SPEAKING).
 */

export type VoiceConvState = 'off' | 'listening' | 'thinking' | 'speaking'

export type VoiceConvEvent =
  /** User flipped the single ON control. */
  | {type: 'TOGGLE_ON'}
  /** User flipped the single OFF control (or the screen unmounted). */
  | {type: 'TOGGLE_OFF'}
  /** Live speech detected (a non-empty partial/final transcript). Drives barge-in. */
  | {type: 'SPEECH_ACTIVITY'; text: string}
  /** End-of-utterance detected (silence after speech). `text` is the full utterance. */
  | {type: 'ENDPOINT'; text: string}
  /** The agent turn finished; `text` is the reply to speak (may be empty). */
  | {type: 'REPLY_READY'; text: string}
  /** TTS finished or was canceled. */
  | {type: 'SPEAK_DONE'}
  /** A recoverable error (STT/turn/TTS); keep the call alive by listening again. */
  | {type: 'ERROR'}

export type VoiceConvCommand =
  | {type: 'START_LISTENING'}
  | {type: 'STOP_LISTENING'}
  | {type: 'SEND'; text: string}
  | {type: 'SPEAK'; text: string}
  | {type: 'STOP_SPEAKING'}

export interface VoiceConvResult {
  state: VoiceConvState
  commands: VoiceConvCommand[]
}

export const INITIAL_VOICE_CONV_STATE: VoiceConvState = 'off'

const stay = (state: VoiceConvState): VoiceConvResult => ({state, commands: []})

/** Pure transition. Returns the next state and the side-effect commands to run. */
export function voiceConvReducer(
  state: VoiceConvState,
  event: VoiceConvEvent,
): VoiceConvResult {
  // TOGGLE_OFF is global: from any state, fully stop and go idle.
  if (event.type === 'TOGGLE_OFF') {
    if (state === 'off') return stay('off')
    return {state: 'off', commands: [{type: 'STOP_SPEAKING'}, {type: 'STOP_LISTENING'}]}
  }

  switch (state) {
    case 'off':
      if (event.type === 'TOGGLE_ON') {
        return {state: 'listening', commands: [{type: 'START_LISTENING'}]}
      }
      return stay('off')

    case 'listening':
      if (event.type === 'ENDPOINT') {
        const text = event.text.trim()
        // Empty endpoint (silence with no words) — keep listening.
        if (!text) return stay('listening')
        return {
          state: 'thinking',
          commands: [{type: 'STOP_LISTENING'}, {type: 'SEND', text}],
        }
      }
      // Speech activity while listening just means the user is talking — the hook
      // resets its endpoint timer; no state change here.
      return stay('listening')

    case 'thinking':
      if (event.type === 'REPLY_READY') {
        const text = event.text.trim()
        if (!text) {
          // Nothing to say (e.g. an action-only turn) — resume listening.
          return {state: 'listening', commands: [{type: 'START_LISTENING'}]}
        }
        // Reopen the mic FIRST (so starting it doesn't cancel the reply), THEN
        // speak — the open mic lets the user barge in mid-reply. Hardware echo
        // cancellation keeps Bob's own audio from self-triggering the barge-in.
        return {
          state: 'speaking',
          commands: [{type: 'START_LISTENING'}, {type: 'SPEAK', text}],
        }
      }
      if (event.type === 'ERROR') {
        return {state: 'listening', commands: [{type: 'START_LISTENING'}]}
      }
      return stay('thinking')

    case 'speaking':
      if (event.type === 'SPEECH_ACTIVITY') {
        // BARGE-IN: the user started talking over Bob → cut playback. The mic is
        // already open (reopened on entry to `speaking`), so we just stop speaking
        // and drop into listening to capture the interruption.
        if (!event.text.trim()) return stay('speaking')
        return {state: 'listening', commands: [{type: 'STOP_SPEAKING'}]}
      }
      if (event.type === 'SPEAK_DONE') {
        // Reply finished; mic is already open from `speaking` entry → keep listening.
        return stay('listening')
      }
      if (event.type === 'ERROR') {
        return {state: 'listening', commands: [{type: 'STOP_SPEAKING'}]}
      }
      return stay('speaking')

    default:
      return stay(state)
  }
}
