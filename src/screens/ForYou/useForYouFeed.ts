import {useQuery} from '@tanstack/react-query'

import {STALE} from '#/state/queries'
import {createQueryKey} from '#/state/queries/util'
import {loadForYouFeed} from './sources'
import {type FeedItem} from './types'

const forYouQueryKeyRoot = 'forYouFeed'
const createForYouQueryKey = () => createQueryKey(forYouQueryKeyRoot, {})

/**
 * Loads + blends the "For You" feed from all registered source adapters. Each
 * adapter is individually resilient (live sources fall back to sample), so this
 * query effectively never errors — it returns whatever the sources could provide.
 */
export function useForYouFeed() {
  return useQuery<FeedItem[]>({
    queryKey: createForYouQueryKey(),
    queryFn: ({signal}) => loadForYouFeed(undefined, {signal, limit: 20}),
    staleTime: STALE.MINUTES.FIVE,
  })
}
