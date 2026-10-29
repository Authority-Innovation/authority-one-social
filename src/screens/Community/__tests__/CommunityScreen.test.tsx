import {useEffect} from 'react'
import {beforeEach, describe, expect, it, jest} from '@jest/globals'
import {i18n} from '@lingui/core'
import {I18nProvider} from '@lingui/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {fireEvent, render, waitFor, within} from '@testing-library/react-native'

// The bottom-sheet module reads Platform.Version at load, which is undefined
// under jest-expo/ios.
jest.mock('../../../../modules/bottom-sheet', () => ({
  BottomSheet: () => null,
  BottomSheetNativeComponent: () => null,
  BottomSheetSnapPoint: {Hidden: 0, Partial: 1, Full: 2},
}))

let mockCommunitiesEnabled = true
jest.mock('#/env', () => {
  const actual = jest.requireActual<Record<string, unknown>>('#/env')
  // A real getter, read at render time. (An object-literal getter next to a
  // spread is flattened to a value by the spread transform.)
  const env = {...actual}
  Object.defineProperty(env, '__esModule', {value: true})
  Object.defineProperty(env, 'COMMUNITIES_ENABLED', {
    get: () => mockCommunitiesEnabled,
  })
  return env
})

const mockNavigate = jest.fn()
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<Record<string, unknown>>('@react-navigation/native'),
  useNavigation: () => ({navigate: mockNavigate}),
}))

jest.mock('#/lib/agent-runtime/communitiesClient', () => ({
  getCommunity: jest.fn(),
  getTimeline: jest.fn(),
  getAgentGrant: jest.fn(),
  setAgentGrant: jest.fn(),
  launchCommunityAgent: jest.fn(),
}))

// group.ts reads through the user's PDS agent (no group-AppView proxy yet), so
// the screen must never reach it. Any call here is a failure.
jest.mock('#/state/queries/group', () => ({
  useGroupTimelineQuery: jest.fn(() => ({data: undefined})),
  useGroupMembersQuery: jest.fn(() => ({data: undefined})),
  useGroupQuery: jest.fn(() => ({data: undefined})),
}))

const mockAgentCall = jest.fn()
let mockViewerDid: string | undefined = 'did:example:alice'
jest.mock('#/state/session', () => ({
  useAgent: () => ({call: mockAgentCall}),
  useSession: () => ({
    hasSession: !!mockViewerDid,
    currentAccount: mockViewerDid ? {did: mockViewerDid} : undefined,
  }),
}))

// Layout's header pulls in navigation, analytics and breakpoints; plain views
// are enough to check what the screen puts inside it.
// Factories use createElement and lower-case names so the React compiler's
// transform does not reach into them.
jest.mock('#/components/Layout', () => {
  const {createElement} = require('react') as typeof import('react')
  const {View} = require('react-native')
  const pass = (props: {children?: React.ReactNode}) =>
    createElement(View, null, props.children)
  const none = () => null
  return {
    ...jest.requireActual<Record<string, unknown>>('#/components/Layout/const'),
    Screen: pass,
    Content: pass,
    Center: pass,
    Header: {
      Outer: pass,
      Content: pass,
      Slot: pass,
      BackButton: none,
      TitleText: pass,
    },
  }
})

jest.mock('#/components/Link', () => {
  const {createElement} = require('react') as typeof import('react')
  const {Text} = require('react-native')
  const link = (props: {children?: React.ReactNode}) =>
    createElement(Text, null, props.children)
  return {InlineLinkText: link}
})

jest.mock('#/view/com/util/UserAvatar', () => {
  const avatar = () => null
  return {UserAvatar: avatar}
})

const mockOpenJoin = jest.fn()
jest.mock('#/components/Dialog', () => ({
  useDialogControl: () => ({
    id: 'join',
    ref: {current: null},
    open: mockOpenJoin,
    close: jest.fn(),
  }),
}))

jest.mock('../components/JoinConsentEntry', () => {
  const entry = () => null
  return {JoinConsentEntry: entry}
})

const mockComposerEntry = jest.fn((_props: {communityId: string}) => null)
jest.mock('../components/CommunityComposerEntry', () => {
  const entry = (props: {communityId: string}) => mockComposerEntry(props)
  return {CommunityComposerEntry: entry}
})

import * as communitiesClient from '#/lib/agent-runtime/communitiesClient'
import {
  useGroupMembersQuery,
  useGroupTimelineQuery,
} from '#/state/queries/group'
import {applyCommunitiesFlag} from '#/screens/Community/linking'
import {ThemeProvider, useTheme} from '#/alf'
import {router} from '#/routes'
import {CommunityMembersScreen, CommunityScreen} from '../index'

i18n.loadAndActivate({locale: 'en', messages: {}})

import {
  asClientCommunity,
  clientCommunity,
  DEV_RUNTIME as REAL,
  DOOR_AGENT_DID,
  DOOR_SPONSOR_DID,
  doorCommunity,
  doorCommunityWithSponsorMember,
  doorItem,
  doorPage,
} from '#/lib/communities/__fixtures__/door'
import {type DoorItem} from '#/lib/communities/doorContract'

const getCommunity = communitiesClient.getCommunity as jest.Mock<
  typeof communitiesClient.getCommunity
>
const getTimeline = communitiesClient.getTimeline as jest.Mock<
  typeof communitiesClient.getTimeline
>
const getAgentGrant = communitiesClient.getAgentGrant as jest.Mock<
  typeof communitiesClient.getAgentGrant
>
const groupTimeline = useGroupTimelineQuery as unknown as jest.Mock
const groupMembers = useGroupMembersQuery as unknown as jest.Mock

type Community = communitiesClient.Community

const AGENT_DID = DOOR_AGENT_DID

/**
 * door.json's community (GET /:id) after its sponsor joined, as the client
 * hands it to a member who is not an admin: `agent.did`, `agentSponsor:
 * {did, handle: 'carol-sponsor'}`, `accent`, `viewerIsAdmin: false`. Only
 * door fields; `extra` changes the value of door fields.
 */
function memberCommunity(extra: Partial<Community> = {}): Community {
  return {...asClientCommunity(doorCommunityWithSponsorMember()), ...extra}
}

/** The same member response without `agent` (the agent flag off). */
function withoutAgent(c: Community = memberCommunity()): Community {
  const {agent: _agent, agentSponsor: _sponsor, ...rest} = c
  return rest
}

/** The same member response without `agentSponsor` (a runtime before bfd5a63c). */
function withoutSponsor(c: Community = memberCommunity()): Community {
  const {agentSponsor: _sponsor, ...rest} = c
  return rest
}

/**
 * door.json's community with every agent/admin flag off (no `agent`,
 * `agentSponsor` or `viewer_is_admin`), which the descriptor reads as a
 * non-member. The real door answers GET /:id `not_found` to a non-member, so
 * this is the only door shape that reaches the non-member home.
 */
function nonMemberCommunity(): Community {
  return clientCommunity()
}

const COMMUNITY_NAME = doorCommunity().name
const ACCENT = doorCommunity().accent!

/** door.json's member post, re-keyed. Never a hand-made item shape. */
function item(
  id: string,
  text: string,
  author: DoorItem['author'],
  extra: Partial<DoorItem> = {},
): DoorItem {
  return {...doorItem('post'), id, text, author, ...extra}
}

/** The app theme as any screen outside the community header sees it. */
const seen = {theme: ''}
function ThemeProbe() {
  const t = useTheme()
  const theme = `${t.palette.primary_500}|${String(t.atoms.bg.backgroundColor)}`
  useEffect(() => {
    seen.theme = theme
  }, [theme])
  return null
}

function newQueryClient() {
  return new QueryClient({defaultOptions: {queries: {retry: false}}})
}

function renderScreen({
  id = 'btb',
  members = false,
  queryClient = newQueryClient(),
}: {id?: string; members?: boolean; queryClient?: QueryClient} = {}) {
  const route = {key: 'k', name: members ? 'CommunityMembers' : 'Community'}
  const Screen = (members ? CommunityMembersScreen : CommunityScreen) as (p: {
    route: unknown
    navigation: unknown
  }) => React.ReactNode
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider i18n={i18n}>
        <ThemeProvider theme="light">
          <Screen route={{...route, params: {id}}} navigation={{}} />
          <ThemeProbe />
        </ThemeProvider>
      </I18nProvider>
    </QueryClientProvider>,
  )
}

type JsonNode = {
  props: {testID?: string; style?: unknown}
  children: (JsonNode | string)[] | null
}

/**
 * Every rendered host element whose style mentions `colour`, with whether it
 * sits inside the community header.
 */
function elementsUsingColour(r: ReturnType<typeof render>, colour: string) {
  const found: {testID?: string; inHeader: boolean}[] = []
  const walk = (node: JsonNode | string, inHeader: boolean) => {
    if (typeof node === 'string') return
    const here = inHeader || node.props.testID === 'communityHeader'
    if (JSON.stringify(node.props.style ?? null).includes(colour)) {
      found.push({testID: node.props.testID, inHeader: here})
    }
    for (const child of node.children ?? []) walk(child, here)
  }
  const json = r.toJSON() as unknown as JsonNode | JsonNode[] | null
  for (const root of Array.isArray(json) ? json : json ? [json] : []) {
    walk(root, false)
  }
  return found
}

beforeEach(() => {
  mockCommunitiesEnabled = true
  mockViewerDid = 'did:example:alice'
  jest.clearAllMocks()
  getAgentGrant.mockResolvedValue({
    ok: true,
    data: {communityId: 'btb', on: false},
  })
  getTimeline.mockResolvedValue({
    ok: true,
    data: doorPage([
      item('p1', 'What should I listen to first?', {
        did: 'did:example:sam',
        is_agent: false,
      }),
      // R3: the runtime sends the author DID with the is_agent flag.
      item(
        'p2',
        'Episode 12 is a good start.',
        {did: AGENT_DID, is_agent: true},
        {parentId: 'p1', authorId: 'community-agent'},
      ),
      // A member whose member id is the agent's: still a member.
      item(
        'p3',
        'I am not an agent.',
        {did: 'did:example:steve', is_agent: false},
        {authorId: 'community-agent'},
      ),
    ]),
  })
})

describe('Community home - non-member', () => {
  beforeEach(() => {
    getCommunity.mockResolvedValue({ok: true, data: nonMemberCommunity()})
  })

  it('shows the public descriptor and a join button, and never reads the timeline', async () => {
    const r = renderScreen()
    await r.findByText(COMMUNITY_NAME, {}, {timeout: 3000})

    expect(getCommunity).toHaveBeenCalledWith('btb')
    expect(getTimeline).not.toHaveBeenCalled()
    expect(r.getByTestId('communityJoinButton')).toBeTruthy()
    expect(r.getByText('Join community')).toBeTruthy()
    expect(r.getByText('Members only')).toBeTruthy()
    // The flags-off response has no agent, so no agent card.
    expect(r.queryByTestId('communityAgentCard')).toBeNull()
    expect(r.queryByTestId('communityMemberBadge')).toBeNull()
  })

  it('renders no members-tier content, only placeholder rows', async () => {
    const r = renderScreen()
    await r.findByTestId('communityWallPlaceholder', {}, {timeout: 3000})

    expect(r.queryByTestId('communityMembersTimeline')).toBeNull()
    expect(r.queryByText('What should I listen to first?')).toBeNull()
    expect(r.queryByText('Episode 12 is a good start.')).toBeNull()
    expect(r.getByTestId('communityMembersNotice')).toBeTruthy()
    // A walled community is never read through group.ts either.
    for (const call of groupTimeline.mock.calls) {
      expect(call[0]).toBeUndefined()
    }
    // No composer for a non-member.
    expect(mockComposerEntry).not.toHaveBeenCalled()
  })

  it('opens the join-consent entry from the join button', async () => {
    const r = renderScreen()
    fireEvent.press(
      await r.findByTestId('communityJoinButton', {}, {timeout: 3000}),
    )
    expect(mockOpenJoin).toHaveBeenCalledTimes(1)
  })
})

describe('Community home - member', () => {
  beforeEach(() => {
    getCommunity.mockResolvedValue({ok: true, data: memberCommunity()})
  })

  it('renders the REAL Dev runtime timeline page ({items}, text, authorId) without crashing (One Dev 38)', async () => {
    getCommunity.mockResolvedValue({
      ok: true,
      data: asClientCommunity(REAL.home.community),
    })
    getTimeline.mockResolvedValue({
      ok: true,
      data: REAL.timeline,
    })
    const r = renderScreen({id: 'ao-dev-test'})
    await r.findAllByText(REAL.timeline.items[1].text, {}, {timeout: 3000})
    expect(r.getAllByText('member.example.test').length).toBe(
      REAL.timeline.items.length,
    )
  })

  it('reads the timeline with only this community id', async () => {
    const r = renderScreen({id: 'btb'})
    await r.findByText('What should I listen to first?', {}, {timeout: 3000})

    expect(getTimeline).toHaveBeenCalled()
    for (const call of getTimeline.mock.calls) {
      expect(call[0]).toBe('btb')
    }
    expect(getCommunity.mock.calls.every(call => call[0] === 'btb')).toBe(true)
    expect(r.getByTestId('communityMemberBadge')).toBeTruthy()
    expect(r.queryByTestId('communityJoinButton')).toBeNull()
    expect(r.queryByTestId('communityWallPlaceholder')).toBeNull()
  })

  it('labels only the item whose is_agent and author.did match the config agent', async () => {
    const r = renderScreen()
    await r.findByText('Episode 12 is a good start.', {}, {timeout: 3000})
    expect(r.getByText('I am not an agent.')).toBeTruthy()
    expect(r.getAllByTestId('communityPostAgentLabel')).toHaveLength(1)
    expect(
      within(r.getByTestId('communityPost-p2')).getByTestId(
        'communityPostAgentLabel',
      ),
    ).toBeTruthy()
    // A member item, and a member named like the agent.
    for (const id of ['p1', 'p3']) {
      expect(
        within(r.getByTestId(`communityPost-${id}`)).queryByTestId(
          'communityPostAgentLabel',
        ),
      ).toBeNull()
    }
  })

  function timelineOf(items: DoorItem[]) {
    getTimeline.mockResolvedValue({ok: true, data: doorPage(items)})
  }

  it('gives no label to a spoofed agent name with a different did', async () => {
    timelineOf([
      item('s1', 'I am Steve, honest.', {
        did: 'did:example:eve',
        is_agent: true,
      }),
    ])
    const r = renderScreen()
    await r.findByText('I am Steve, honest.', {}, {timeout: 3000})
    expect(r.queryByTestId('communityPostAgentLabel')).toBeNull()
  })

  it('gives no label to an old item whose author did is null', async () => {
    timelineOf([
      // door.json's legacy item: written before the author DID was stored.
      {...doorItem('legacy'), id: 'o1', text: 'Old agent reply.'},
      // Even a stray is_agent true does not label an item with no did.
      item('o2', 'Old flagged reply.', {did: null, is_agent: true}),
    ])
    const r = renderScreen()
    await r.findByText('Old agent reply.', {}, {timeout: 3000})
    expect(r.getByText('Old flagged reply.')).toBeTruthy()
    expect(r.queryByTestId('communityPostAgentLabel')).toBeNull()
  })

  it('renders an item with no author as a member row with no label', async () => {
    // The door with the agent flag off: no is_agent and no author.
    const {author: _author, is_agent: _isAgent, ...flagOff} = doorItem('post')
    timelineOf([{...flagOff, id: 'n1', text: 'No author here.'}])
    const r = renderScreen()
    await r.findByText('No author here.', {}, {timeout: 3000})
    expect(r.getByTestId('communityPost-n1')).toBeTruthy()
    expect(r.queryByTestId('communityPostAgentLabel')).toBeNull()
  })

  it('gives no label when the community config names no agent', async () => {
    getCommunity.mockResolvedValue({
      ok: true,
      data: withoutAgent(),
    })
    timelineOf([
      item('a1', 'Agent with no config agent.', {
        did: AGENT_DID,
        is_agent: true,
      }),
    ])
    const r = renderScreen()
    await r.findByText('Agent with no config agent.', {}, {timeout: 3000})
    expect(r.queryByTestId('communityAgentCard')).toBeNull()
    expect(r.queryByTestId('communityPostAgentLabel')).toBeNull()
  })

  it('passes this community id to the composer entry', async () => {
    const r = renderScreen({id: 'btb'})
    await r.findByText('What should I listen to first?', {}, {timeout: 3000})
    expect(mockComposerEntry).toHaveBeenCalled()
    for (const call of mockComposerEntry.mock.calls) {
      expect(call[0]).toEqual({communityId: 'btb', tier: 'members'})
    }
  })

  it('opens on the Members tab from /c/:id/members', async () => {
    const r = renderScreen({members: true})
    await r.findByTestId('communityMembersSection', {}, {timeout: 3000})
    expect(r.queryByTestId('communityPosts')).toBeNull()
    fireEvent.press(r.getByTestId('communityTab-posts'))
    expect(r.getByTestId('communityPosts')).toBeTruthy()
  })
})

describe('Community home - agent grant row', () => {
  it('a member sees the grant row with the runtime value', async () => {
    getCommunity.mockResolvedValue({ok: true, data: memberCommunity()})
    getAgentGrant.mockResolvedValue({
      ok: true,
      data: {communityId: 'btb', on: true},
    })
    const r = renderScreen()
    await r.findByTestId('communityAgentGrantRow', {}, {timeout: 3000})
    expect(getAgentGrant).toHaveBeenCalledWith('btb')
    expect(
      r.getByText('Give this community’s agent access to my content here'),
    ).toBeTruthy()
  })

  it('a non-member gets no grant row and no grant read', async () => {
    getCommunity.mockResolvedValue({ok: true, data: nonMemberCommunity()})
    const r = renderScreen()
    await r.findByTestId('communityJoinButton', {}, {timeout: 3000})
    expect(r.queryByTestId('communityAgentGrantRow')).toBeNull()
    expect(getAgentGrant).not.toHaveBeenCalled()
  })

  it('a community with no agent gets no grant row and no grant read', async () => {
    getCommunity.mockResolvedValue({ok: true, data: withoutAgent()})
    const r = renderScreen()
    await r.findByText('What should I listen to first?', {}, {timeout: 3000})
    expect(r.queryByTestId('communityAgentGrantRow')).toBeNull()
    expect(getAgentGrant).not.toHaveBeenCalled()
  })

  it('shows no grant row when the grant read fails', async () => {
    getCommunity.mockResolvedValue({ok: true, data: memberCommunity()})
    getAgentGrant.mockResolvedValue({
      ok: false,
      error: {kind: 'http', status: 500},
    })
    const r = renderScreen()
    await r.findByText('What should I listen to first?', {}, {timeout: 3000})
    await waitFor(() => expect(getAgentGrant).toHaveBeenCalled())
    expect(r.queryByTestId('communityAgentGrantRow')).toBeNull()
  })
})

describe('Community home - account-scoped cache', () => {
  it('does not show one account the cached community or timeline of another', async () => {
    const queryClient = newQueryClient()
    getCommunity.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        data:
          mockViewerDid === 'did:example:alice'
            ? memberCommunity()
            : nonMemberCommunity(),
      }),
    )

    // Alice, a member, loads the members-tier timeline.
    const alice = renderScreen({queryClient})
    await alice.findByText(
      'What should I listen to first?',
      {},
      {timeout: 3000},
    )
    alice.unmount()
    expect(getTimeline).toHaveBeenCalledTimes(1)

    // Bob, not a member, opens the same community on the same device.
    mockViewerDid = 'did:example:bob'
    const bob = renderScreen({queryClient})
    expect(bob.queryByText('What should I listen to first?')).toBeNull()
    expect(bob.queryByTestId('communityMemberBadge')).toBeNull()
    await bob.findByTestId('communityWallPlaceholder', {}, {timeout: 3000})
    expect(bob.queryByText('What should I listen to first?')).toBeNull()
    expect(getCommunity).toHaveBeenCalledTimes(2)
    expect(getTimeline).toHaveBeenCalledTimes(1)

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map(q => q.queryKey)
      .filter(k => k[0] === 'community' || k[0] === 'communityTimeline')
    const viewersOf = (root: string) =>
      keys
        .filter(k => k[0] === root)
        .map(k => (k[1] as {viewer: string}).viewer)
        .sort()
    expect(viewersOf('community')).toEqual([
      'did:example:alice',
      'did:example:bob',
    ])
    // Bob's descriptor says non-member, so no timeline entry exists for him.
    expect(viewersOf('communityTimeline')).toEqual(['did:example:alice'])
  })

  it('keeps two members on separate timeline entries', async () => {
    const queryClient = newQueryClient()
    getCommunity.mockResolvedValue({ok: true, data: memberCommunity()})
    getTimeline.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        data: doorPage([
          item(`p-${mockViewerDid}`, `Seen by ${mockViewerDid}`, {
            did: null,
            is_agent: false,
          }),
        ]),
      }),
    )

    const alice = renderScreen({queryClient})
    await alice.findByText('Seen by did:example:alice', {}, {timeout: 3000})
    alice.unmount()

    mockViewerDid = 'did:example:bob'
    const bob = renderScreen({queryClient})
    expect(bob.queryByText('Seen by did:example:alice')).toBeNull()
    await bob.findByText('Seen by did:example:bob', {}, {timeout: 3000})
    expect(bob.queryByText('Seen by did:example:alice')).toBeNull()
    expect(getTimeline).toHaveBeenCalledTimes(2)
  })

  it('makes no timeline read when signed out', async () => {
    mockViewerDid = undefined
    getCommunity.mockResolvedValue({ok: true, data: memberCommunity()})
    const r = renderScreen()
    await r.findByTestId('communityHeader', {}, {timeout: 3000})
    expect(getTimeline).not.toHaveBeenCalled()
  })
})

// NOT a door shape: the door sends no tier and no group URI, so the public
// tier is unreachable against it. These hold the descriptor's fail-closed
// reads (nothing is fetched for a public tier) on top of door.json's
// community; open item in the ccacde3b report.
describe('Community home - public tier', () => {
  const PUBLIC = {
    config: {tier: 'com.authorityone.community.config#public'},
    groupUri: 'at://did:example:owner/com.authorityone.group.profile/btb',
  }

  it.each([
    ['non-member', nonMemberCommunity],
    ['member', memberCommunity],
  ])(
    'shows posts as not available yet and reads nothing for a %s',
    async (_who, base) => {
      getCommunity.mockResolvedValue({
        ok: true,
        data: {...base(), ...PUBLIC},
      })
      const r = renderScreen()
      await r.findByTestId(
        'communityPublicPostsUnavailable',
        {},
        {timeout: 3000},
      )
      expect(r.queryByTestId('communityPublicTimeline')).toBeNull()
      expect(groupTimeline).not.toHaveBeenCalled()
      expect(groupMembers).not.toHaveBeenCalled()
      expect(mockAgentCall).not.toHaveBeenCalled()
      expect(getTimeline).not.toHaveBeenCalled()
    },
  )

  it('shows the member list as not available yet and reads nothing', async () => {
    getCommunity.mockResolvedValue({
      ok: true,
      data: {...nonMemberCommunity(), ...PUBLIC},
    })
    const r = renderScreen({members: true})
    await r.findByTestId(
      'communityPublicMembersUnavailable',
      {},
      {timeout: 3000},
    )
    expect(groupMembers).not.toHaveBeenCalled()
    expect(groupTimeline).not.toHaveBeenCalled()
    expect(mockAgentCall).not.toHaveBeenCalled()
  })
})

describe('Community home - agent card', () => {
  it('is hidden when the door sends no agent', async () => {
    getCommunity.mockResolvedValue({ok: true, data: withoutAgent()})
    const r = renderScreen()
    await r.findByTestId('communityHeader', {}, {timeout: 3000})
    expect(r.queryByTestId('communityAgentCard')).toBeNull()
  })

  it('is hidden when the door sends no agentSponsor', async () => {
    getCommunity.mockResolvedValue({ok: true, data: withoutSponsor()})
    const r = renderScreen()
    await r.findByTestId('communityHeader', {}, {timeout: 3000})
    expect(r.queryByTestId('communityAgentCard')).toBeNull()
  })

  it('shows the sponsor handle from agentSponsor', async () => {
    getCommunity.mockResolvedValue({ok: true, data: memberCommunity()})
    const r = renderScreen()
    await r.findByTestId('communityAgentCard', {}, {timeout: 3000})
    expect(r.getByText('Community agent')).toBeTruthy()
    expect(r.getByTestId('communityAgentSponsor')).toHaveTextContent(
      'AI agent · sponsor: @carol-sponsor',
    )
    expect(r.getByTestId('communityAgentScope')).toBeTruthy()
  })

  it('shows no sponsor, never the DID or the community name, when the handle is null', async () => {
    // door.json's community before the sponsor joined: handle null.
    const c = asClientCommunity(doorCommunity())
    expect(c.agentSponsor).toEqual({did: DOOR_SPONSOR_DID, handle: null})
    getCommunity.mockResolvedValue({ok: true, data: c})
    const r = renderScreen()
    await r.findByTestId('communityAgentCard', {}, {timeout: 3000})
    const line = r.getByTestId('communityAgentSponsor')
    expect(line).toHaveTextContent(/^AI agent$/)
    expect(line).not.toHaveTextContent(/sponsor/i)
    const card = r.getByTestId('communityAgentCard')
    expect(card).not.toHaveTextContent(DOOR_SPONSOR_DID)
    expect(card).not.toHaveTextContent(COMMUNITY_NAME)
  })
})

describe('Community home - agent launch control', () => {
  it('an admin sees the launch control below the agent card', async () => {
    getCommunity.mockResolvedValue({
      ok: true,
      data: memberCommunity({viewerIsAdmin: true}),
    })
    const r = renderScreen()
    await r.findByTestId('communityAgentLaunchControl', {}, {timeout: 3000})
    expect(r.getByTestId('communityAgentCard')).toBeTruthy()
  })

  it('no viewer_is_admin (the admin role off) gets no launch control', async () => {
    const {viewerIsAdmin: _admin, ...noAdminKey} = memberCommunity()
    getCommunity.mockResolvedValue({ok: true, data: noAdminKey})
    const r = renderScreen()
    await r.findByTestId('communityAgentCard', {}, {timeout: 3000})
    expect(r.queryByTestId('communityAgentLaunchControl')).toBeNull()
  })

  it('a former admin (viewerIsAdmin false) gets no launch control', async () => {
    getCommunity.mockResolvedValue({
      ok: true,
      data: memberCommunity({viewerIsAdmin: false}),
    })
    const r = renderScreen()
    await r.findByTestId('communityAgentCard', {}, {timeout: 3000})
    expect(r.queryByTestId('communityAgentLaunchControl')).toBeNull()
  })
})

describe('Community home - accent colour', () => {
  it('appears in the community header only, and the app theme is unchanged', async () => {
    // The app theme as it is with no community on screen.
    getCommunity.mockReturnValue(new Promise(() => {}))
    const before = renderScreen()
    const baseline = seen.theme
    before.unmount()

    getCommunity.mockResolvedValue({ok: true, data: memberCommunity()})
    const r = renderScreen()
    await r.findByTestId('communityHeader', {}, {timeout: 3000})

    expect(baseline).not.toBe('')
    expect(seen.theme).toBe(baseline)
    expect(baseline).not.toContain(ACCENT)

    const users = elementsUsingColour(r, ACCENT)
    expect(users.length).toBeGreaterThan(0)
    expect(users.filter(u => !u.inHeader)).toEqual([])
  })

  it('ignores an accent that is not a hex colour', async () => {
    getCommunity.mockResolvedValue({
      ok: true,
      data: memberCommunity({accent: 'red'}),
    })
    const r = renderScreen()
    await r.findByTestId('communityHeader', {}, {timeout: 3000})
    expect(elementsUsingColour(r, '"red"')).toHaveLength(0)
  })
})

describe('Community home - flag off', () => {
  it('lands a /c/:id deep link on Home', () => {
    expect(applyCommunitiesFlag(router.matchPath('/c/btb'), false)).toEqual([
      'Home',
      {},
    ])
    expect(
      applyCommunitiesFlag(router.matchPath('/c/btb/members'), false),
    ).toEqual(['Home', {}])
  })

  it('sends an in-app push to Home and reads nothing', async () => {
    mockCommunitiesEnabled = false
    const r = renderScreen()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Home'))
    expect(r.queryByTestId('communityHeader')).toBeNull()
    expect(getCommunity).not.toHaveBeenCalled()
    expect(getTimeline).not.toHaveBeenCalled()
    expect(getAgentGrant).not.toHaveBeenCalled()
    expect(r.queryByTestId('communityAgentGrantRow')).toBeNull()
  })
})

describe('Community home - errors', () => {
  it('shows an error state when the runtime refuses', async () => {
    getCommunity.mockResolvedValue({
      ok: false,
      error: {kind: 'http', status: 403},
    })
    const r = renderScreen()
    await r.findByTestId('communityError', {}, {timeout: 3000})
    expect(getTimeline).not.toHaveBeenCalled()
  })
})
