import {beforeEach, describe, expect, it, jest} from '@jest/globals'

import {
  createSilenceEndpointer,
  END_OF_SPEECH_SILENCE_MS,
  MIN_SPEECH_CHARS,
} from '../speechEndpointer'

/**
 * The endpointer's whole job is timing, so drive it with a virtual clock: every
 * speech update should restart the silence window, and ONLY a sustained silence
 * past END_OF_SPEECH_SILENCE_MS should finalize. A mid-sentence pause shorter than
 * the window must NOT cut the user off.
 */

beforeEach(() => {
  jest.useFakeTimers()
})

describe('createSilenceEndpointer', () => {
  it('sane default window is ~1.8s and forgiving of a ~1s pause', () => {
    expect(END_OF_SPEECH_SILENCE_MS).toBeGreaterThanOrEqual(1500)
    expect(END_OF_SPEECH_SILENCE_MS).toBeLessThanOrEqual(2200)
    // A natural ~1s thinking pause must be shorter than the finalize window.
    expect(1000).toBeLessThan(END_OF_SPEECH_SILENCE_MS)
  })

  it('finalizes after sustained silence with the full transcript', () => {
    const onEndpoint = jest.fn()
    const ep = createSilenceEndpointer({onEndpoint})

    ep.noteSpeech('hello bob')
    expect(onEndpoint).not.toHaveBeenCalled()

    jest.advanceTimersByTime(END_OF_SPEECH_SILENCE_MS)
    expect(onEndpoint).toHaveBeenCalledTimes(1)
    expect(onEndpoint).toHaveBeenCalledWith('hello bob')
  })

  it('a partial update RESETS the silence timer (no premature finalize)', () => {
    const onEndpoint = jest.fn()
    const ep = createSilenceEndpointer({onEndpoint})

    ep.noteSpeech('what time')
    // Almost at the threshold...
    jest.advanceTimersByTime(END_OF_SPEECH_SILENCE_MS - 100)
    // ...a new partial arrives → timer restarts.
    ep.noteSpeech('what time is it')
    jest.advanceTimersByTime(END_OF_SPEECH_SILENCE_MS - 100)
    // Still within a (reset) window — must NOT have fired yet.
    expect(onEndpoint).not.toHaveBeenCalled()

    // Now go silent for the full window.
    jest.advanceTimersByTime(100)
    expect(onEndpoint).toHaveBeenCalledTimes(1)
    expect(onEndpoint).toHaveBeenCalledWith('what time is it')
  })

  it('tolerates a ~1s mid-sentence thinking pause then continued speech', () => {
    const onEndpoint = jest.fn()
    const ep = createSilenceEndpointer({onEndpoint})

    ep.noteSpeech('I was thinking')
    jest.advanceTimersByTime(1000) // ~1s pause to think — shorter than the window
    expect(onEndpoint).not.toHaveBeenCalled()
    ep.noteSpeech('I was thinking we should ship it')
    jest.advanceTimersByTime(END_OF_SPEECH_SILENCE_MS)

    expect(onEndpoint).toHaveBeenCalledTimes(1)
    expect(onEndpoint).toHaveBeenCalledWith('I was thinking we should ship it')
  })

  it('a final-segment update also resets the timer (not just partials)', () => {
    const onEndpoint = jest.fn()
    const ep = createSilenceEndpointer({onEndpoint})

    ep.noteSpeech('first part') // e.g. a partial
    jest.advanceTimersByTime(END_OF_SPEECH_SILENCE_MS - 200)
    // The engine commits a segment; useVoice forwards finals through the same path.
    ep.noteSpeech('first part and the second part')
    jest.advanceTimersByTime(END_OF_SPEECH_SILENCE_MS - 200)
    expect(onEndpoint).not.toHaveBeenCalled()

    jest.advanceTimersByTime(200)
    expect(onEndpoint).toHaveBeenCalledWith('first part and the second part')
  })

  it('does not finalize on silence alone (no speech ever heard)', () => {
    const onEndpoint = jest.fn()
    const ep = createSilenceEndpointer({onEndpoint})

    // Sub-threshold blips should not arm an endpoint.
    ep.noteSpeech('')
    ep.noteSpeech('a'.slice(0, MIN_SPEECH_CHARS - 1))
    jest.advanceTimersByTime(END_OF_SPEECH_SILENCE_MS * 3)

    expect(onEndpoint).not.toHaveBeenCalled()
    expect(ep.hasSpeech()).toBe(false)
  })

  it('reset() cancels a pending endpoint and clears state', () => {
    const onEndpoint = jest.fn()
    const ep = createSilenceEndpointer({onEndpoint})

    ep.noteSpeech('hello there')
    expect(ep.hasSpeech()).toBe(true)
    ep.reset()
    jest.advanceTimersByTime(END_OF_SPEECH_SILENCE_MS * 2)

    expect(onEndpoint).not.toHaveBeenCalled()
    expect(ep.current()).toBe('')
    expect(ep.hasSpeech()).toBe(false)
  })

  it('keeps the latest/most-complete transcript even if a later update is empty', () => {
    const onEndpoint = jest.fn()
    const ep = createSilenceEndpointer({onEndpoint})

    ep.noteSpeech('the full sentence')
    ep.noteSpeech('') // a stray empty update must not erase what we captured
    jest.advanceTimersByTime(END_OF_SPEECH_SILENCE_MS)

    expect(onEndpoint).toHaveBeenCalledWith('the full sentence')
  })

  it('respects a custom silence window', () => {
    const onEndpoint = jest.fn()
    const ep = createSilenceEndpointer({onEndpoint, silenceMs: 500})

    ep.noteSpeech('quick')
    jest.advanceTimersByTime(499)
    expect(onEndpoint).not.toHaveBeenCalled()
    jest.advanceTimersByTime(1)
    expect(onEndpoint).toHaveBeenCalledTimes(1)
  })
})
