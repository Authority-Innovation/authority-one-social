/** Agent Live is native-only; the web build has no device key to hold with. */
export function wasHeldHere(_ownerDid: string, _sid: string): Promise<boolean> {
  return Promise.resolve(false)
}

export function markHeldHere(_ownerDid: string, _sid: string): Promise<void> {
  return Promise.resolve()
}
