/**
 * At most one run at a time: a call while a run is in flight gets THAT run's
 * promise instead of starting a second one (the boot tick and an AppState
 * `active` tick must never refresh/sync concurrently).
 */
export function singleFlight(fn: () => Promise<void>): () => Promise<void> {
  let inFlight: Promise<void> | null = null
  return () => {
    if (inFlight) return inFlight
    inFlight = fn().finally(() => {
      inFlight = null
    })
    return inFlight
  }
}
