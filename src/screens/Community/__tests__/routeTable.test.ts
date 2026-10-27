import {describe, expect, it} from '@jest/globals'

import {router} from '#/routes'

const COMMUNITY_ROUTE_NAMES = ['Community', 'CommunityMembers']

describe('route table', () => {
  /*
   * The snapshot was recorded at the base commit (569b3b240), before the
   * Community routes were added. Adding them must leave every pre-existing
   * route - name, pattern and match order - exactly as it was.
   */
  it('keeps every pre-existing route unchanged', () => {
    const table = router.routes
      .filter(([name]) => !COMMUNITY_ROUTE_NAMES.includes(name))
      .map(([name, route]) => `${name} ${route.build({})}`)
    expect(table).toMatchSnapshot()
  })
})
