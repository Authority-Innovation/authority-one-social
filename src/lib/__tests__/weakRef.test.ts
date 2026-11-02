import {describe, expect, it} from '@jest/globals'

import {installWeakRef, StrongWeakRef} from '../weakRef'

describe('WeakRef for Hermes (Agent Live room-setup, builds 43 and 44)', () => {
  it('installs when the runtime has none', () => {
    const scope: {WeakRef?: unknown} = {}
    expect(installWeakRef(scope)).toBe(true)
    const WR = scope.WeakRef as typeof StrongWeakRef
    const target = {a: 1}
    const ref = new WR(target)
    expect(ref.deref()).toBe(target)
    expect(Object.prototype.toString.call(ref)).toBe('[object WeakRef]')
  })

  it('leaves a native WeakRef alone (Node, web)', () => {
    const scope = {WeakRef: globalThis.WeakRef as unknown}
    expect(installWeakRef(scope)).toBe(false)
    expect(scope.WeakRef).toBe(globalThis.WeakRef)
  })

  it('refuses a non-object target, as the native one does', () => {
    expect(() => new StrongWeakRef(1 as unknown as object)).toThrow(TypeError)
    expect(() => new WeakRef(1 as unknown as object)).toThrow(TypeError)
    expect(new StrongWeakRef(() => {}).deref()).toBeInstanceOf(Function)
  })
})
