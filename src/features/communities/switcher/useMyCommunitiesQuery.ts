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
 * The communities the signed-in person belongs to. Fails closed: any client
 * error yields an empty list, so a community the person has left never lingers
 * as a chip after the next fetch.
 */
export function useMyCommunitiesQuery() {
  const {currentAccount} = useSession()
  const did = currentAccount?.did ?? ''

  return useQuery({
    queryKey: createMyCommunitiesQueryKey({did}),
    queryFn: async () => {
      const res = await listMyCommunities()
      return res.ok ? toSwitcherCommunities(res.data) : []
    },
    staleTime: STALE.MINUTES.ONE,
    enabled: !!did && isCommunitySwitcherEnabled(),
  })
}
