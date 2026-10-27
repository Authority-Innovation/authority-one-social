import {type ReactNode} from 'react'
import {describe, expect, it} from '@jest/globals'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {renderHook} from '@testing-library/react-native'

import {
  COMMUNITY_FEED_RQKEY_ROOT,
  useRemoveCommunityQueriesOnAccountSwitch,
} from '#/features/communities/cache'

const ACCOUNT_A = 'did:example:a'
const ACCOUNT_B = 'did:example:b'

function seed(queryClient: QueryClient) {
  queryClient.setQueryData(
    [COMMUNITY_FEED_RQKEY_ROOT, 'communities', {}, {accountDid: ACCOUNT_A}],
    {pages: []},
  )
  queryClient.setQueryData(
    [
      COMMUNITY_FEED_RQKEY_ROOT,
      'community|community-a',
      {},
      {accountDid: ACCOUNT_A},
    ],
    {pages: []},
  )
  queryClient.setQueryData(['post-feed', 'following', {}], {pages: []})
}

function countRoot(queryClient: QueryClient, root: string) {
  return queryClient.getQueryCache().findAll({queryKey: [root]}).length
}

function setup() {
  const queryClient = new QueryClient()
  seed(queryClient)
  const wrapper = ({children}: {children: ReactNode}) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const hook = renderHook(
    ({did}: {did: string | undefined}) =>
      useRemoveCommunityQueriesOnAccountSwitch(did),
    {wrapper, initialProps: {did: ACCOUNT_A}},
  )
  return {queryClient, hook}
}

describe('community query cache on account switch', () => {
  it('keeps community queries while the account is unchanged', () => {
    const {queryClient, hook} = setup()
    hook.rerender({did: ACCOUNT_A})
    expect(countRoot(queryClient, COMMUNITY_FEED_RQKEY_ROOT)).toBe(2)
  })

  it('removes the community root when the account changes', () => {
    const {queryClient, hook} = setup()
    hook.rerender({did: ACCOUNT_B})
    expect(countRoot(queryClient, COMMUNITY_FEED_RQKEY_ROOT)).toBe(0)
    // Other roots are left alone.
    expect(countRoot(queryClient, 'post-feed')).toBe(1)
  })

  it('removes the community root on logout', () => {
    const {queryClient, hook} = setup()
    hook.rerender({did: undefined})
    expect(countRoot(queryClient, COMMUNITY_FEED_RQKEY_ROOT)).toBe(0)
  })

  it('removes the community root when the provider unmounts', () => {
    const {queryClient, hook} = setup()
    hook.unmount()
    expect(countRoot(queryClient, COMMUNITY_FEED_RQKEY_ROOT)).toBe(0)
    expect(countRoot(queryClient, 'post-feed')).toBe(1)
  })
})
