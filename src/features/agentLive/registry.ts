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

/** For tests. */
export const openLiveSessionCount = () => open.size
/** For tests: forget sessions a previous test left open. */
export const forgetLiveSessionsForTests = () => open.clear()
