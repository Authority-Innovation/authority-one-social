import {describe, expect, it} from '@jest/globals'

import {
  INITIAL_VOICE_CONV_STATE,
  type VoiceConvEvent,
  type VoiceConvState,
  voiceConvReducer,
} from '../voiceConversationMachine'

/** Run a sequence of events from a start state; return the final state + the flat
 *  list of commands emitted along the way (command types only, for compact asserts). */
function run(
  start: VoiceConvState,
  events: VoiceConvEvent[],
): {state: VoiceConvState; cmds: string[]} {
  let state = start
  const cmds: string[] = []
  for (const e of events) {
    const r = voiceConvReducer(state, e)
    state = r.state
    cmds.push(...r.commands.map(c => c.type))
  }
  return {state, cmds}
}

describe('voiceConvReducer', () => {
  it('starts off', () => {
    expect(INITIAL_VOICE_CONV_STATE).toBe('off')
  })

  it('TOGGLE_ON: off → listening and opens the mic', () => {
    const r = voiceConvReducer('off', {type: 'TOGGLE_ON'})
    expect(r.state).toBe('listening')
    expect(r.commands).toEqual([{type: 'START_LISTENING'}])
  })

  it('full happy loop: listen → think → speak → listen again', () => {
    const r = run('off', [
      {type: 'TOGGLE_ON'},
      {type: 'ENDPOINT', text: 'what time is it'},
      {type: 'REPLY_READY', text: "It's noon."},
      {type: 'SPEAK_DONE'},
    ])
    expect(r.state).toBe('listening')
    expect(r.cmds).toEqual([
      'START_LISTENING', // toggle on
      'STOP_LISTENING', // endpoint
      'SEND', // endpoint
      'START_LISTENING', // reply ready: reopen mic FIRST
      'SPEAK', // ...then speak
      // SPEAK_DONE → already listening, no command
    ])
  })

  it('ENDPOINT carries the utterance text into SEND', () => {
    const r = voiceConvReducer('listening', {type: 'ENDPOINT', text: '  hello bob  '})
    expect(r.state).toBe('thinking')
    expect(r.commands).toEqual([
      {type: 'STOP_LISTENING'},
      {type: 'SEND', text: 'hello bob'},
    ])
  })

  it('empty ENDPOINT keeps listening (no send)', () => {
    const r = voiceConvReducer('listening', {type: 'ENDPOINT', text: '   '})
    expect(r.state).toBe('listening')
    expect(r.commands).toEqual([])
  })

  it('REPLY_READY speaks AND reopens the mic, mic before speak', () => {
    const r = voiceConvReducer('thinking', {type: 'REPLY_READY', text: 'Sure.'})
    expect(r.state).toBe('speaking')
    expect(r.commands).toEqual([
      {type: 'START_LISTENING'},
      {type: 'SPEAK', text: 'Sure.'},
    ])
  })

  it('empty REPLY_READY (action-only turn) returns to listening', () => {
    const r = voiceConvReducer('thinking', {type: 'REPLY_READY', text: ''})
    expect(r.state).toBe('listening')
    expect(r.commands).toEqual([{type: 'START_LISTENING'}])
  })

  it('barge-in: speech while speaking cuts playback and listens', () => {
    const r = voiceConvReducer('speaking', {type: 'SPEECH_ACTIVITY', text: 'actually'})
    expect(r.state).toBe('listening')
    expect(r.commands).toEqual([{type: 'STOP_SPEAKING'}])
  })

  it('sub-threshold blip (empty) does NOT barge in', () => {
    const r = voiceConvReducer('speaking', {type: 'SPEECH_ACTIVITY', text: '   '})
    expect(r.state).toBe('speaking')
    expect(r.commands).toEqual([])
  })

  it('SPEAK_DONE: speaking → listening (mic already open, no command)', () => {
    const r = voiceConvReducer('speaking', {type: 'SPEAK_DONE'})
    expect(r.state).toBe('listening')
    expect(r.commands).toEqual([])
  })

  it('TOGGLE_OFF from any active state stops mic + playback', () => {
    for (const s of ['listening', 'thinking', 'speaking'] as VoiceConvState[]) {
      const r = voiceConvReducer(s, {type: 'TOGGLE_OFF'})
      expect(r.state).toBe('off')
      expect(r.commands).toEqual([
        {type: 'STOP_SPEAKING'},
        {type: 'STOP_LISTENING'},
      ])
    }
  })

  it('TOGGLE_OFF when already off is a no-op', () => {
    const r = voiceConvReducer('off', {type: 'TOGGLE_OFF'})
    expect(r.state).toBe('off')
    expect(r.commands).toEqual([])
  })

  it('ERROR recovers the call by listening again', () => {
    expect(voiceConvReducer('thinking', {type: 'ERROR'}).state).toBe('listening')
    expect(voiceConvReducer('speaking', {type: 'ERROR'}).state).toBe('listening')
  })

  it('events are ignored in non-matching states (no spurious transitions)', () => {
    // A reply arriving while off / listening must not jump to speaking.
    expect(voiceConvReducer('off', {type: 'REPLY_READY', text: 'x'}).state).toBe('off')
    expect(voiceConvReducer('listening', {type: 'SPEAK_DONE'}).state).toBe('listening')
    expect(voiceConvReducer('off', {type: 'SPEECH_ACTIVITY', text: 'x'}).state).toBe('off')
  })
})
