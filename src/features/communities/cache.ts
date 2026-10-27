/**
 * Query-cache scoping for community feeds.
 *
 * Community feed queries live under their own root and carry the account DID
 * in the key. On an account switch the root is removed explicitly. The
 * QueryProvider already builds a fresh QueryClient per DID (lib/react-query),
 * but members content must not depend on that staying true, and the old
 * client is otherwise left holding it until garbage collection.
 */
import {useEffect, useRef} from 'react'
import {type QueryClient, useQueryClient} from '@tanstack/react-query'

export const COMMUNITY_FEED_RQKEY_ROOT = 'community-feed'

export function removeCommunityQueries(queryClient: QueryClient) {
  queryClient.removeQueries({queryKey: [COMMUNITY_FEED_RQKEY_ROOT]})
}

/**
 * Removes every community feed query when the account changes, and when the
 * owning provider unmounts (which is how an account switch looks today).
 */
export function useRemoveCommunityQueriesOnAccountSwitch(
  accountDid: string | undefined,
) {
  const queryClient = useQueryClient()
  const lastDid = useRef(accountDid)

  useEffect(() => {
    if (lastDid.current !== accountDid) {
      lastDid.current = accountDid
      removeCommunityQueries(queryClient)
    }
  }, [accountDid, queryClient])

  useEffect(() => {
    return () => removeCommunityQueries(queryClient)
  }, [queryClient])
}

export function CommunityCacheGuard({
  accountDid,
}: {
  accountDid: string | undefined
}) {
  useRemoveCommunityQueriesOnAccountSwitch(accountDid)
  return null
}
