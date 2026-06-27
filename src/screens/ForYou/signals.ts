import {type FeedItem, type FeedMediaType, type FeedTags} from './types'

/**
 * Per-item engagement signals captured from the feed and POSTed (batched) to the
 * runtime (POST /app/feed/signals). These feed the ranking profile (M2).
 */
export type SignalAction =
  | 'watch' // value = completion % (0..100)
  | 'dwell' // value = dwell milliseconds
  | 'like'
  | 'skip' // item advanced quickly (value = dwell ms)
  | 'tapThrough'
  | 'openSource'

export interface SignalEvent {
  itemId: string
  mediaType: FeedMediaType
  tags: FeedTags
  action: SignalAction
  value?: number
  /** Unix ms. */
  at: number
}

/** Build a normalized signal event from a feed item. */
export function buildSignalEvent(
  item: FeedItem,
  action: SignalAction,
  at: number,
  value?: number,
): SignalEvent {
  return {
    itemId: item.id,
    mediaType: item.type,
    tags: item.tags,
    action,
    value,
    at,
  }
}

/** Completion percentage (0..100, clamped) from watched/total seconds. */
export function completionPct(watchedSec: number, durationSec: number): number {
  if (!durationSec || durationSec <= 0) return 0
  const pct = (watchedSec / durationSec) * 100
  return Math.max(0, Math.min(100, Math.round(pct)))
}

/** Default dwell threshold (ms) below which a view counts as a skip. */
export const SKIP_DWELL_MS = 1500

/** Whether a dwell duration counts as a skip (item advanced quickly). */
export function isSkip(dwellMs: number, threshold = SKIP_DWELL_MS): boolean {
  return dwellMs < threshold
}

export interface SignalBatcher {
  /** Queue an event; auto-flushes when the batch reaches `maxBatch`. */
  add(event: SignalEvent): void
  /** Flush whatever is queued now (e.g. on unmount / interval). */
  flushNow(): void
  /** Count of currently-queued events (for tests/diagnostics). */
  pending(): number
}

/**
 * Timer-free batcher: accumulates events and calls `flush(events)` when the queue
 * reaches `maxBatch` or on an explicit `flushNow()`. The provider wraps it with an
 * interval + unmount flush. `flush` must be resilient (never throws).
 */
export function createSignalBatcher(opts: {
  flush: (events: SignalEvent[]) => void
  maxBatch?: number
}): SignalBatcher {
  const maxBatch = opts.maxBatch ?? 10
  let queue: SignalEvent[] = []

  const drain = () => {
    if (queue.length === 0) return
    const events = queue
    queue = []
    opts.flush(events)
  }

  return {
    add(event) {
      queue.push(event)
      if (queue.length >= maxBatch) drain()
    },
    flushNow() {
      drain()
    },
    pending() {
      return queue.length
    },
  }
}
