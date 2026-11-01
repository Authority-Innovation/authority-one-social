/**
 * REJOIN (join gate R2, runtime design AGENT-LIVE-JOIN-GATE-REVISED @ adeeadb).
 * The One app's copy of the runtime's rule, `live-agent/src/rejoin.js` on
 * feat/agent-live-r2-workers-v2 @ 9fc23bd (the agent job and AO Edge use it):
 * keep the backoff and the final reasons the same in both.
 *
 * A lost LiveKit connection is a FULL rejoin with a FRESH join token, never
 * LiveKit's resume: the Dev signal site refuses every resume (R1). A bound
 * token is proven (the proof always trades it for the token that joins) and
 * replaces the held participant; an unbound one waits until the dead
 * participant leaves (R2 v2). FINAL reasons never rejoin: we left, the room or
 * session is over, the runtime removed us (except a refused rejoin, see
 * REJOIN_REFUSED_GRACE_S, and an unbound session's removal, see session.ts),
 * or our own replacement took the identity. Pure: no SDK, no network.
 *
 * Reasons are the LiveKit protocol's DisconnectReason names, shared by
 * livekit-client (this app) and @livekit/rtc-node (the workers).
 */
import {type LiveDisconnectReason} from './room/types'

/**
 * The room's departure_timeout the runtime sets (seconds). Measured by the
 * runtime on livekit-server 1.9.1 (live-agent/src/rejoin.js @ 9fc23bd): it is
 * room-level (the room closes this long after its last participant leaves),
 * not a per-participant hold; how long an active participant is held is not
 * measured. The backoff still outlasts it.
 */
export const LIVEKIT_DEPARTURE_TIMEOUT_S = 30

/**
 * One attempt after each wait; after the last, give up ("reconnect failed",
 * shown on screen). 31 s in all, longer than the departure timeout, so an
 * unbound rejoin that has to wait for the dead participant to leave still
 * gets a try after it has (the runtime no longer replaces it, R2 v2).
 */
export const REJOIN_BACKOFF_MS: readonly number[] = Object.freeze([
  1000, 2000, 4000, 8000, 16000,
])

/**
 * A rejoin connection removed within this long of connecting is a REFUSED
 * rejoin (the old participant is still held), not a removal from the session:
 * it takes the next rung, and the ladder is not reset (R2 contract rev 4;
 * the workers' REJOIN_REFUSED_GRACE_MS on 9fc23bd). Only a drop of a
 * connection that was not refused starts the ladder again.
 */
export const REJOIN_REFUSED_GRACE_S = 10

export const FINAL_REASONS: ReadonlySet<string> = new Set([
  'CLIENT_INITIATED',
  'DUPLICATE_IDENTITY',
  'PARTICIPANT_REMOVED',
  'ROOM_DELETED',
  'ROOM_CLOSED',
  'USER_REJECTED',
])

/** The reason's name from a DisconnectReason (a number, or already a name). */
export function reasonName(
  reason: unknown,
  enumObj: Record<number, string> | null = null,
): string {
  if (typeof reason === 'string') return reason
  if (
    typeof reason === 'number' &&
    enumObj &&
    typeof enumObj[reason] === 'string'
  )
    return enumObj[reason]
  return 'UNKNOWN_REASON'
}

export const isFinal = (name: string) => FINAL_REASONS.has(name)

/**
 * The session's view of a reason. Every FINAL name maps to one that ends the
 * session; everything else (including no reason at all, which is what the SDK
 * reports when it gives up under NO_SDK_RECONNECT) is `network`: a rejoin.
 */
export function disconnectReasonOf(name: string): LiveDisconnectReason {
  switch (name) {
    case 'CLIENT_INITIATED':
      return 'client'
    case 'PARTICIPANT_REMOVED':
      return 'removed'
    case 'ROOM_DELETED':
    case 'ROOM_CLOSED':
      return 'room_deleted'
    case 'DUPLICATE_IDENTITY':
      return 'duplicate_identity'
    case 'USER_REJECTED':
      return 'rejected'
    default:
      return 'network'
  }
}
