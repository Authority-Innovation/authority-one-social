import {describe, expect, it} from '@jest/globals'

import {singleFlight} from '../singleFlight'

describe('singleFlight', () => {
  it('overlapping calls share one run; a later call starts a new one', async () => {
    let runs = 0
    let release!: () => void
    const f = singleFlight(() => {
      runs++
      return new Promise<void>(r => {
        release = r
      })
    })
    const a = f()
    const b = f()
    expect(a).toBe(b)
    expect(runs).toBe(1)
    release()
    await a
    const c = f()
    expect(runs).toBe(2)
    release()
    await c
  })

  it('a failed run releases the guard', async () => {
    let runs = 0
    const f = singleFlight(() => {
      runs++
      return Promise.reject(new Error('x'))
    })
    await expect(f()).rejects.toThrow('x')
    await expect(f()).rejects.toThrow('x')
    expect(runs).toBe(2)
  })
})
