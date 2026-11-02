/**
 * WeakRef for runtimes without one. React Native's Hermes has no WeakRef
 * (and no FinalizationRegistry), and livekit-client 2.23.0 calls
 * `new WeakRef(client)` unguarded in its signal state machine during
 * `new Room()`: Agent Live's "(code: room-setup)" on builds 43 and 44,
 * "ReferenceError: Property 'WeakRef' doesn't exist" (seen on the iOS
 * simulator). This one holds its target strongly: `deref()` always returns
 * it, which is what a WeakRef does while the target is alive. The cost is
 * that those targets are not collected early. FinalizationRegistry is left
 * absent, so livekit-client keeps its own guarded cleanup paths off.
 */
export class StrongWeakRef<T extends object> {
  readonly [Symbol.toStringTag] = 'WeakRef'
  private readonly target: T

  constructor(target: T) {
    if (
      target === null ||
      (typeof target !== 'object' && typeof target !== 'function')
    ) {
      throw new TypeError('WeakRef: target must be an object')
    }
    this.target = target
  }

  deref(): T | undefined {
    return this.target
  }
}

/** Installs StrongWeakRef as the global WeakRef when there is none. */
export function installWeakRef(
  scope: {WeakRef?: unknown} = globalThis,
): boolean {
  if (typeof scope.WeakRef === 'function') return false
  scope.WeakRef = StrongWeakRef
  return true
}
