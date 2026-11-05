const door = require('../../../src/lib/communities/__fixtures__/door/door.json')
const {
  checkNoBraces,
  checkNoRawHandles,
  runHardChecks,
  checkShape,
  doorShapes,
  doorRouteOf,
} = require('../lib/checks')

const CLEAN = {
  text: 'AO Dev Test\nMember\nAI agent · run by Alice Smith\nPosts\nMembers\nHello garden',
  nameSlots: [
    {slot: 'communityAgentSponsor', text: 'AI agent · run by Alice Smith'},
    {slot: 'communityPostAuthorName', text: 'Dr. Bob Jones'},
    {slot: 'communityRosterName', text: 'Community agent'},
  ],
  consoleErrors: [],
}

describe('hard checks', () => {
  it('a clean fixture passes', () => {
    expect(runHardChecks(CLEAN)).toEqual([])
  })

  it('a literal "{sponsorName}" fails', () => {
    const text = 'AI agent · run by {sponsorName}'
    expect(checkNoBraces(text)).toHaveLength(1)
    expect(runHardChecks({...CLEAN, text})).not.toEqual([])
  })

  it.each([
    'AI agent · run by alice.pds.authority-one.com',
    'AI agent · run by @alice.test',
    'did:plc:gardensponsorfixture',
    'bob.bsky.social',
  ])('a raw handle where a name is expected fails: %s', text => {
    expect(
      checkNoRawHandles([{slot: 'communityAgentSponsor', text}]),
    ).toHaveLength(1)
  })

  it('a known handle fails even without a TLD shape', () => {
    expect(
      checkNoRawHandles(
        [{slot: 'communityPostAuthorName', text: 'devtester'}],
        ['devtester'],
      ),
    ).toHaveLength(1)
  })

  it('"isn’t available yet" fails', () => {
    expect(
      runHardChecks({...CLEAN, text: 'Members isn’t available yet'}),
    ).not.toEqual([])
  })

  it('crash text fails', () => {
    expect(
      runHardChecks({
        ...CLEAN,
        text: "TypeError: Cannot read properties of undefined (reading 'id')",
      }),
    ).not.toEqual([])
    expect(
      runHardChecks({...CLEAN, text: 'Oops! Something went wrong.'}),
    ).not.toEqual([])
  })

  it('any console error fails', () => {
    expect(
      runHardChecks({
        ...CLEAN,
        consoleErrors: [{kind: 'console.error', text: 'boom'}],
      }),
    ).toEqual(['console console.error: boom'])
  })
})

describe('door shapes (from door.json)', () => {
  const shapes = doorShapes()

  it('the fixtures match their own shapes', () => {
    expect(checkShape(door.timeline, shapes.timeline)).toEqual([])
    expect(checkShape(door.roster, shapes.roster)).toEqual([])
    expect(
      checkShape({items: door.export.items, cursor: null}, shapes.timeline),
    ).toEqual([])
  })

  it('a next-page cursor string is allowed', () => {
    expect(checkShape({items: [], cursor: 'abc'}, shapes.timeline)).toEqual([])
  })

  it('a key the door never sends fails', () => {
    const item = {...door.timeline.items[0], role: 'admin'}
    expect(checkShape({items: [item], cursor: null}, shapes.timeline)).toEqual([
      '$.items[0].role: key not in the door fixtures',
    ])
    expect(checkShape({posts: [], cursor: null}, shapes.timeline)).toContain(
      '$.posts: key not in the door fixtures',
    )
  })

  it('a missing or retyped field fails', () => {
    expect(checkShape({items: []}, shapes.timeline)).toEqual([
      '$.cursor: missing',
    ])
    const roster = {
      ...door.roster,
      roster: [{id: 'x', did: 7, is_agent: false}],
    }
    expect(checkShape(roster, shapes.roster)).toEqual([
      '$.roster[0].did: expected null|string, got number',
    ])
  })

  it('routes runtime URLs to the shape they answer with', () => {
    const base = 'https://authority-one-agent-runtime-dev.e-479.workers.dev'
    expect(
      doorRouteOf(`${base}/app/communities/ao-dev-test/timeline?x=1`),
    ).toBe('timeline')
    expect(
      doorRouteOf(`${base}/app/communities/ao-dev-test/posts/p1/roster`),
    ).toBe('roster')
    expect(doorRouteOf(`${base}/app/communities/ao-dev-test`)).toBeNull()
  })
})
