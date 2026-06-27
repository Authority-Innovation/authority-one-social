import {createContext, useContext, useEffect, useMemo, useState} from 'react'

import {postFeedSignals} from '#/lib/agent-runtime'
import {
  buildSignalEvent,
  createSignalBatcher,
  type SignalAction,
} from './signals'
import {type FeedItem} from './types'

/**
 * Captures per-item engagement (watch %, dwell, like, skip, tapThrough, openSource),
 * batches it, and POSTs to /app/feed/signals. Fire-and-forget: never disrupts the
 * UI. Flushes on a 10s interval and on unmount.
 */
interface FeedSignalsApi {
  record: (item: FeedItem, action: SignalAction, value?: number) => void
}

const FeedSignalsContext = createContext<FeedSignalsApi>({record: () => {}})

export function FeedSignalsProvider({children}: React.PropsWithChildren<{}>) {
  // Stable batcher for the provider's lifetime; flush posts the batch.
  const [batcher] = useState(() =>
    createSignalBatcher({
      flush: events => {
        void postFeedSignals(events)
      },
    }),
  )

  useEffect(() => {
    const id = setInterval(() => batcher.flushNow(), 10_000)
    return () => {
      clearInterval(id)
      batcher.flushNow()
    }
  }, [batcher])

  const value = useMemo<FeedSignalsApi>(
    () => ({
      record: (item, action, value) =>
        batcher.add(buildSignalEvent(item, action, Date.now(), value)),
    }),
    [batcher],
  )

  return (
    <FeedSignalsContext.Provider value={value}>
      {children}
    </FeedSignalsContext.Provider>
  )
}

export function useFeedSignals(): FeedSignalsApi {
  return useContext(FeedSignalsContext)
}
