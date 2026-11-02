/**
 * The live sessions this app has open, so signing out or switching account
 * can end them while that account's bearer is still current (review 679a9d48
 * H2 item 4). Tiny and dependency-free: `state/session` imports it, and it
 * must not pull in the Live client (nothing here is LiveKit).
 *
 * The end is started, not awaited: each controller's /end reads its bearer
 * synchronously when it starts, before the account's tokens are cleared, and
 * keeps retrying after the screen has gone.
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

/** How long deleting the account waits for Agent Live's /end. */
export const LIVE_END_BEFORE_DELETE_MS = 8_000

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
