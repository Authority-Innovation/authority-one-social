import {afterEach, describe, expect, it, jest} from '@jest/globals'

import {
  endOpenLiveSessionsAndWait,
  forgetLiveSessionsForTests,
  LIVE_END_WAIT_MS,
  registerLiveSession,
} from '../registry'

afterEach(() => {
  forgetLiveSessionsForTests()
  jest.useRealTimers()
})

describe('endOpenLiveSessionsAndWait (review 3b593301c F21: delete waits for /end)', () => {
  it('resolves only after every end has finished', async () => {
    const done: string[] = []
    let release!: () => void
    const slow = new Promise<void>(r => (release = r))
    registerLiveSession(async () => {
      await slow
      done.push('a')
    })
    registerLiveSession(() => {
      done.push('b')
      return Promise.resolve()
    })
    let settled = false
    const waiting = endOpenLiveSessionsAndWait(8000).then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    release()
    await waiting
    expect(done.sort()).toEqual(['a', 'b'])
  })

  it('is bounded: an end that hangs is given up on at the timeout', async () => {
    jest.useFakeTimers()
    registerLiveSession(() => new Promise<void>(() => {}))
    let settled = false
    const waiting = endOpenLiveSessionsAndWait(8000).then(() => {
      settled = true
    })
    jest.advanceTimersByTime(7999)
    await Promise.resolve()
    expect(settled).toBe(false)
    jest.advanceTimersByTime(1)
    await waiting
    expect(settled).toBe(true)
  })

  it('a failing end does not reject the wait', async () => {
    registerLiveSession(() => Promise.reject(new Error('503')))
    await expect(endOpenLiveSessionsAndWait(8000)).resolves.toBe('settled')
  })

  it('says whether the ends settled or the bound expired (r392 L7)', async () => {
    registerLiveSession(() => Promise.resolve())
    await expect(endOpenLiveSessionsAndWait(8000)).resolves.toBe('settled')
    forgetLiveSessionsForTests()
    jest.useFakeTimers()
    registerLiveSession(() => new Promise<void>(() => {}))
    const waiting = endOpenLiveSessionsAndWait(8000)
    jest.advanceTimersByTime(8000)
    await expect(waiting).resolves.toBe('timed_out')
  })

  it('the delete bound is 8 s (r392 L10)', () => {
    expect(LIVE_END_WAIT_MS).toBe(8_000)
  })
})
