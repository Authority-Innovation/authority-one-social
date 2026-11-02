/**
 * The live sessions this app has open, so signing out or switching account
 * can end them while that account's bearer is still current (review 679a9d48
 * H2 item 4). Tiny and dependency-free: `state/session` imports it, and it
 * must not pull in the Live client (nothing here is LiveKit).
 *
 * Each controller's /end reads its bearer synchronously when it starts,
 * before the account's tokens are cleared. An account switch starts the ends;
 * sign-out and account delete also wait for them, within a bound (review
 * r404 a; 3b593301c F21).
 */
type End = () => Promise<void>

const open = new Set<End>()

/** Returns the unregister function. */
export function registerLiveSession(end: End): () => void {
  open.add(end)
  return () => {
    open.delete(end)
  }
}

/** Start ending every open live session (sign-out, account switch). */
export function endOpenLiveSessions(): void {
  for (const end of [...open]) {
    void end().catch(() => {})
  }
}

/** How long sign-out and deleting the account wait for Agent Live's /end. */
export const LIVE_END_WAIT_MS = 8_000

/** Is any live session registered (sign-out waits only then)? */
export const hasOpenLiveSessions = () => open.size > 0

/**
 * End every open live session and wait for the ends, at most `timeoutMs`
 * (review 3b593301c F21: deleting the account must not race its /end; the
 * bearer may stop working once the account is gone). Never rejects; says
 * whether the ends settled or the bound expired first (review r392 L7).
 */
export function endOpenLiveSessionsAndWait(
  timeoutMs: number,
): Promise<'settled' | 'timed_out'> {
  const ends = Promise.allSettled([...open].map(end => end())).then(
    () => 'settled' as const,
  )
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timed_out'>(resolve => {
    timer = setTimeout(() => resolve('timed_out'), timeoutMs)
  })
  return Promise.race([ends, timeout]).finally(() => clearTimeout(timer))
}

/** For tests. */
export const openLiveSessionCount = () => open.size
/** For tests: forget sessions a previous test left open. */
export const forgetLiveSessionsForTests = () => open.clear()
