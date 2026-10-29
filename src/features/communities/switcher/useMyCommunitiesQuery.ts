import {useQuery} from '@tanstack/react-query'

import {listMyCommunities} from '#/lib/agent-runtime/communitiesClient'
import {STALE} from '#/state/queries'
import {createQueryKey} from '#/state/queries/util'
import {useSession} from '#/state/session'
import {isCommunitySwitcherEnabled, toSwitcherCommunities} from './util'

const myCommunitiesQueryKeyRoot = 'myCommunities'

export const createMyCommunitiesQueryKey = (args: {did: string}) =>
  createQueryKey(myCommunitiesQueryKeyRoot, args)

/**
 * The communities the signed-in person belongs to. A signed-out result is an
 * empty list. Any other client error throws, so React Query keeps the last good
 * list (and the selection built on it) through a flaky refetch, and a first
 * load that fails shows no chips. A community the person has left is still
 * gone on the next successful fetch.
 */
export function useMyCommunitiesQuery() {
  const {currentAccount} = useSession()
  const did = currentAccount?.did ?? ''

  return useQuery({
    queryKey: createMyCommunitiesQueryKey({did}),
    queryFn: async () => {
      const res = await listMyCommunities()
      if (res.ok) return toSwitcherCommunities(res.data)
      if (res.error.kind === 'signed_out') return []
      throw new Error(`listMyCommunities failed: ${res.error.kind}`)
    },
    staleTime: STALE.MINUTES.ONE,
    enabled: !!did && isCommunitySwitcherEnabled(),
  })
}
