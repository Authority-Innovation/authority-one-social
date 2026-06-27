import {useQuery} from '@tanstack/react-query'

import {type FeedProfileWeights,fetchFeedProfile} from '#/lib/agent-runtime'
import {STALE} from '#/state/queries'
import {createQueryKey} from '#/state/queries/util'

/**
 * The owner's learned interest weights (GET /app/feed/profile), used to rank the
 * For You feed. Resolves to `undefined` when signed out / unreachable, so the feed
 * falls back to the round-robin blend.
 */
export function useFeedProfileQuery() {
  return useQuery<FeedProfileWeights | undefined>({
    queryKey: createQueryKey('feedProfile', {}),
    queryFn: () => fetchFeedProfile(),
    staleTime: STALE.MINUTES.FIVE,
  })
}
