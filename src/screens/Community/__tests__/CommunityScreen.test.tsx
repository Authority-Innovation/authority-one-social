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
  getThreadRoster: jest.fn(),
}))

// group.ts reads through the user's PDS agent (no group-AppView proxy yet), so
// the screen must never reach it. Any call here is a failure.
jest.mock('#/state/queries/group', () => ({
  useGroupTimelineQuery: jest.fn(() => ({data: undefined})),
  useGroupMembersQuery: jest.fn(() => ({data: undefined})),
  useGroupQuery: jest.fn(() => ({data: undefined})),
}))

// Post rows, roster rows and the agent card resolve people through the profile
// cache. Nothing is cached unless a test puts it in mockProfiles, so rows fall
// back to the item's own name or handle.
let mockProfiles: Record<
  string,
  {did: string; handle: string; displayName?: string; avatar?: string}
> = {}
jest.mock('#/state/queries/profile', () => ({
  ...jest.requireActual<Record<string, unknown>>('#/state/queries/profile'),
  useProfileQuery: ({did}: {did?: string}) => ({
    data: did ? mockProfiles[did] : undefined,
  }),
}))

const mockAgentCall = jest.fn()
let mockViewerDid: string | undefined = 'did:example:alice'
let mockViewerHandle: string | undefined
jest.mock('#/state/session', () => ({
  useAgent: () => ({call: mockAgentCall}),
  useSession: () => ({
    hasSession: !!mockViewerDid,
    currentAccount: mockViewerDid
      ? {did: mockViewerDid, handle: mockViewerHandle}
      : undefined,
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

// Records the avatar each row asks for, so a test can check it came from the
// profile cache.
jest.mock('#/view/com/util/UserAvatar', () => {
  const {createElement} = require('react') as typeof import('react')
  const {View} = require('react-native')
  const avatar = (props: {avatar?: string; type?: string}) =>
    createElement(View, {
      testID: 'userAvatar',
      accessibilityLabel: props.avatar ?? '',
      accessibilityHint: props.type ?? '',
    })
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

// The real composer entry renders; this records its props, and the composer
// itself is a mock so a press can be checked for its target.
const mockComposerEntry = jest.fn((_props: {communityId: string}) => null)
jest.mock('../components/CommunityComposerEntry', () => {
  const {createElement} = require('react') as typeof import('react')
  const actual = jest.requireActual<{
    CommunityComposerEntry: (p: object) => React.ReactNode
  }>('../components/CommunityComposerEntry')
  const entry = (props: {communityId: string}) => {
    mockComposerEntry(props)
    return createElement(actual.CommunityComposerEntry, props)
  }
  return {CommunityComposerEntry: entry}
})

const mockOpenComposer = jest.fn()
jest.mock('#/lib/hooks/useOpenComposer', () => ({
  useOpenComposer: () => ({openComposer: mockOpenComposer}),
}))

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

import REAL from '#/lib/communities/__fixtures__/door/dev-runtime-2026-10-30.json'

const getCommunity = communitiesClient.getCommunity as jest.Mock<
  typeof communitiesClient.getCommunity
>
const getTimeline = communitiesClient.getTimeline as jest.Mock<
  typeof communitiesClient.getTimeline
>
const getAgentGrant = communitiesClient.getAgentGrant as jest.Mock<
  typeof communitiesClient.getAgentGrant
>
const getThreadRoster = communitiesClient.getThreadRoster as jest.Mock<
  typeof communitiesClient.getThreadRoster
>
const launchCommunityAgent =
  communitiesClient.launchCommunityAgent as jest.Mock<
    typeof communitiesClient.launchCommunityAgent
  >
const groupTimeline = useGroupTimelineQuery as unknown as jest.Mock
const groupMembers = useGroupMembersQuery as unknown as jest.Mock

const ACCENT = '#12AB34'
const AGENT_DID = 'did:example:agent'
const SPONSOR_DID = 'did:example:sponsor'

function communityResponse(extra: Record<string, unknown> = {}) {
  return {
    id: 'btb',
    name: 'Between Two Beers Listeners',
    description: 'For listeners of the show.',
    memberCount: 1240,
    agentName: 'Steve',
    rules: 'Be kind. No spoilers before release day.',
    config: {
      tier: 'com.authorityone.community.config#members',
      theme: {accent: ACCENT},
      agent: AGENT_DID,
      agentSponsor: SPONSOR_DID,
      brand: {displayName: 'Between Two Beers'},
      consentVersion: 1,
    },
    ...extra,
  } as communitiesClient.Community
}

function configWith(overrides: Record<string, unknown>) {
  const base = communityResponse() as unknown as {config: object}
  return {...base.config, ...overrides}
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
  mockViewerHandle = undefined
  mockProfiles = {}
  jest.clearAllMocks()
  getThreadRoster.mockImplementation((_id, postId) =>
    Promise.resolve({ok: true, data: {postId, roster: []}}),
  )
  getAgentGrant.mockResolvedValue({
    ok: true,
    data: {communityId: 'btb', on: false},
  })
  getTimeline.mockResolvedValue({
    ok: true,
    data: {
      posts: [
        {
          id: 'p1',
          author: {
            displayName: 'Sam R.',
            is_agent: false,
            did: 'did:example:sam',
          },
          body: 'What should I listen to first?',
          createdAt: '2026-10-28T09:29:00.000Z',
        },
        {
          id: 'p2',
          // R3: the runtime sends the author DID with the is_agent flag.
          author: {displayName: 'Steve', is_agent: true, did: AGENT_DID},
          body: 'Episode 12 is a good start.',
          parentId: 'p1',
          createdAt: '2026-10-28T09:40:00.000Z',
        },
        {
          // A human whose author object carries a stray agent-like name.
          id: 'p3',
          author: {displayName: 'Steve Agent', is_agent: false},
          body: 'I am not an agent.',
          createdAt: '2026-10-28T09:41:00.000Z',
        },
      ],
    },
  })
})

describe('Community home - non-member', () => {
  beforeEach(() => {
    getCommunity.mockResolvedValue({ok: true, data: communityResponse()})
  })

  it('shows the public descriptor and a join button, and never reads the timeline', async () => {
    const r = renderScreen()
    await r.findByText('Between Two Beers Listeners', {}, {timeout: 3000})

    expect(getCommunity).toHaveBeenCalledWith('btb')
    expect(getTimeline).not.toHaveBeenCalled()
    expect(r.getByTestId('communityJoinButton')).toBeTruthy()
    expect(r.getByText('Join community')).toBeTruthy()
    expect(r.getByText('Members only')).toBeTruthy()
    expect(r.getByText('Be kind. No spoilers before release day.')).toBeTruthy()
    expect(r.getByTestId('communityAgentCard')).toBeTruthy()
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
    getCommunity.mockResolvedValue({
      ok: true,
      data: communityResponse({role: 'member'}),
    })
  })

  it('renders the REAL Dev runtime timeline page ({items}, text, authorId) without crashing (One Dev 38)', async () => {
    getCommunity.mockResolvedValue({
      ok: true,
      data: {
        ...REAL.home.community,
        viewerIsAdmin: true,
      } as unknown as communitiesClient.Community,
    })
    getTimeline.mockResolvedValue({
      ok: true,
      data: REAL.timeline as unknown as communitiesClient.CommunityTimelinePage,
    })
    const r = renderScreen({id: 'ao-dev-test'})
    await r.findAllByText(REAL.timeline.items[1].text, {}, {timeout: 3000})
    expect(r.getAllByText('@member.example.test').length).toBe(
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

  function timelineOf(posts: Record<string, unknown>[]) {
    getTimeline.mockResolvedValue({
      ok: true,
      data: {posts} as unknown as communitiesClient.CommunityTimelinePage,
    })
  }

  it('gives no label to a spoofed agent name with a different did', async () => {
    timelineOf([
      {
        id: 's1',
        author: {displayName: 'Steve', is_agent: true, did: 'did:example:eve'},
        body: 'I am Steve, honest.',
        createdAt: '2026-10-28T09:40:00.000Z',
      },
    ])
    const r = renderScreen()
    await r.findByText('I am Steve, honest.', {}, {timeout: 3000})
    expect(r.queryByTestId('communityPostAgentLabel')).toBeNull()
  })

  it('gives no label to an old item whose author did is null', async () => {
    timelineOf([
      {
        id: 'o1',
        author: {displayName: 'Steve', is_agent: false, did: null},
        body: 'Old agent reply.',
        createdAt: '2026-10-28T09:40:00.000Z',
      },
      {
        // Even a stray is_agent true does not label an item with no did.
        id: 'o2',
        author: {displayName: 'Steve', is_agent: true, did: null},
        body: 'Old flagged reply.',
        createdAt: '2026-10-28T09:41:00.000Z',
      },
    ])
    const r = renderScreen()
    await r.findByText('Old agent reply.', {}, {timeout: 3000})
    expect(r.getByText('Old flagged reply.')).toBeTruthy()
    expect(r.queryByTestId('communityPostAgentLabel')).toBeNull()
  })

  it('renders an item with no author as a member row with no label', async () => {
    timelineOf([
      {
        id: 'n1',
        body: 'No author here.',
        createdAt: '2026-10-28T09:40:00.000Z',
      },
    ])
    const r = renderScreen()
    await r.findByText('No author here.', {}, {timeout: 3000})
    expect(r.getByTestId('communityPost-n1')).toBeTruthy()
    expect(r.queryByTestId('communityPostAgentLabel')).toBeNull()
  })

  it('gives no label when the community config names no agent', async () => {
    getCommunity.mockResolvedValue({
      ok: true,
      data: communityResponse({
        role: 'member',
        config: configWith({agent: undefined}),
      }),
    })
    timelineOf([
      {
        id: 'a1',
        author: {displayName: 'Bot', is_agent: true, did: AGENT_DID},
        body: 'Agent with no config agent.',
        createdAt: '2026-10-28T09:40:00.000Z',
      },
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

describe('Community home - compose', () => {
  it('a member finds the compose control and it opens the composer targeted to this community at the members tier', async () => {
    getCommunity.mockResolvedValue({
      ok: true,
      data: communityResponse({role: 'member'}),
    })
    const r = renderScreen({id: 'btb'})
    const entry = await r.findByTestId(
      'communityComposerEntry',
      {},
      {timeout: 3000},
    )
    expect(r.getByText('Post to this community')).toBeTruthy()
    fireEvent.press(entry)
    expect(mockOpenComposer).toHaveBeenCalledTimes(1)
    const opts = mockOpenComposer.mock.calls[0][0] as {target: unknown}
    expect(opts.target).toEqual({kind: 'community', id: 'btb', tier: 'members'})
  })

  it('a non-member gets no compose control', async () => {
    getCommunity.mockResolvedValue({ok: true, data: communityResponse()})
    const r = renderScreen()
    await r.findByTestId('communityHeader', {}, {timeout: 3000})
    expect(r.queryByTestId('communityComposerEntry')).toBeNull()
  })
})

describe('Community home - agent grant row', () => {
  it('a member sees the grant row in a "Your settings" section, also with no agentSponsor', async () => {
    getCommunity.mockResolvedValue({
      ok: true,
      data: communityResponse({
        role: 'member',
        config: configWith({agentSponsor: undefined}),
      }),
    })
    const r = renderScreen()
    const section = await r.findByTestId(
      'communityAgentGrantSection',
      {},
      {timeout: 3000},
    )
    expect(within(section).getByText('Your settings')).toBeTruthy()
    expect(within(section).getByTestId('communityAgentGrantRow')).toBeTruthy()
    expect(
      within(section).getByText(
        'Give this community’s agent access to my content here',
      ),
    ).toBeTruthy()
  })

  it('a member sees the grant row with the runtime value', async () => {
    getCommunity.mockResolvedValue({
      ok: true,
      data: communityResponse({role: 'member'}),
    })
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
    getCommunity.mockResolvedValue({ok: true, data: communityResponse()})
    const r = renderScreen()
    await r.findByTestId('communityJoinButton', {}, {timeout: 3000})
    expect(r.queryByTestId('communityAgentGrantRow')).toBeNull()
    expect(getAgentGrant).not.toHaveBeenCalled()
  })

  it('a community with no agent gets no grant row and no grant read', async () => {
    getCommunity.mockResolvedValue({
      ok: true,
      data: communityResponse({
        role: 'member',
        config: configWith({agent: undefined}),
      }),
    })
    const r = renderScreen()
    await r.findByText('What should I listen to first?', {}, {timeout: 3000})
    expect(r.queryByTestId('communityAgentGrantRow')).toBeNull()
    expect(getAgentGrant).not.toHaveBeenCalled()
  })

  it('shows no grant row when the grant read fails', async () => {
    getCommunity.mockResolvedValue({
      ok: true,
      data: communityResponse({role: 'member'}),
    })
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
        data: communityResponse(
          mockViewerDid === 'did:example:alice' ? {role: 'member'} : {},
        ),
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
    getCommunity.mockResolvedValue({
      ok: true,
      data: communityResponse({role: 'member'}),
    })
    getTimeline.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        data: {
          posts: [
            {
              id: `p-${mockViewerDid}`,
              author: {displayName: 'Someone', is_agent: false},
              body: `Seen by ${mockViewerDid}`,
              createdAt: '2026-10-28T09:29:00.000Z',
            },
          ],
        },
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
    getCommunity.mockResolvedValue({
      ok: true,
      data: communityResponse({role: 'member'}),
    })
    const r = renderScreen()
    await r.findByTestId('communityHeader', {}, {timeout: 3000})
    expect(getTimeline).not.toHaveBeenCalled()
  })
})

describe('Community home - public tier', () => {
  const PUBLIC = configWith({tier: 'com.authorityone.community.config#public'})
  const GROUP_URI = 'at://did:example:owner/com.authorityone.group.profile/btb'

  it.each([
    ['non-member', {}],
    ['member', {role: 'member'}],
  ])(
    'shows posts as not available yet and reads nothing for a %s',
    async (_who, extra) => {
      getCommunity.mockResolvedValue({
        ok: true,
        data: communityResponse({
          ...extra,
          config: PUBLIC,
          groupUri: GROUP_URI,
        }),
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
      data: communityResponse({config: PUBLIC, groupUri: GROUP_URI}),
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
  it('is hidden when the config has no agent', async () => {
    getCommunity.mockResolvedValue({
      ok: true,
      data: communityResponse({config: configWith({agent: undefined})}),
    })
    const r = renderScreen()
    await r.findByTestId('communityHeader', {}, {timeout: 3000})
    expect(r.queryByTestId('communityAgentCard')).toBeNull()
  })

  it('renders for a member with just "AI agent" when the response has no agentSponsor', async () => {
    getCommunity.mockResolvedValue({
      ok: true,
      data: communityResponse({
        role: 'member',
        config: configWith({agentSponsor: undefined}),
      }),
    })
    const r = renderScreen()
    await r.findByTestId('communityAgentCard', {}, {timeout: 3000})
    expect(r.getByTestId('communityAgentSponsor')).toHaveTextContent(
      /^AI agent$/,
    )
    expect(r.getByTestId('communityAgentCard')).not.toHaveTextContent(
      'Between Two Beers',
    )
  })

  it('renders for a member on the REAL Dev runtime response (agent DID, no sponsor)', async () => {
    getCommunity.mockResolvedValue({
      ok: true,
      data: {
        ...REAL.home.community,
        viewerIsAdmin: true,
      } as unknown as communitiesClient.Community,
    })
    const r = renderScreen({id: 'ao-dev-test'})
    await r.findByTestId('communityAgentCard', {}, {timeout: 3000})
    expect(r.getByTestId('communityAgentSponsor')).toHaveTextContent(
      /^AI agent$/,
    )
  })

  it('shows "run by <handle>" from the runtime agentSponsor {did, handle}', async () => {
    getCommunity.mockResolvedValue({
      ok: true,
      data: communityResponse({
        role: 'member',
        config: configWith({agentSponsor: undefined}),
        agentSponsor: {did: SPONSOR_DID, handle: 'sam.example.com'},
      }),
    })
    const r = renderScreen()
    const card = await r.findByTestId('communityAgentCard', {}, {timeout: 3000})
    expect(within(card).getByText('Steve')).toBeTruthy()
    expect(r.getByTestId('communityAgentSponsor')).toHaveTextContent(
      'AI agent · run by sam.example.com',
    )
    expect(r.getByTestId('communityAgentScope')).toBeTruthy()
    expect(r.getByTestId('communityAgentCard')).not.toHaveTextContent(
      SPONSOR_DID,
    )
  })

  it('never shows the sponsor DID as a name when agentSponsor has no handle', async () => {
    getCommunity.mockResolvedValue({
      ok: true,
      data: communityResponse({
        role: 'member',
        config: configWith({agentSponsor: undefined}),
        agentSponsor: {did: SPONSOR_DID},
      }),
    })
    const r = renderScreen()
    await r.findByTestId('communityAgentCard', {}, {timeout: 3000})
    expect(r.getByTestId('communityAgentSponsor')).toHaveTextContent(
      /^AI agent$/,
    )
    expect(r.getByTestId('communityAgentCard')).not.toHaveTextContent(
      SPONSOR_DID,
    )
  })

  it('shows no sponsor name, and never the community name, when the sponsor has no name', async () => {
    getCommunity.mockResolvedValue({ok: true, data: communityResponse()})
    const r = renderScreen()
    await r.findByTestId('communityAgentCard', {}, {timeout: 3000})
    const line = r.getByTestId('communityAgentSponsor')
    expect(line).toHaveTextContent(/^AI agent$/)
    expect(line).not.toHaveTextContent(/sponsor/i)
    expect(line).not.toHaveTextContent('Between Two Beers')
    expect(r.getByTestId('communityAgentCard')).not.toHaveTextContent(
      'Between Two Beers',
    )
  })
})

describe('Community home - agent launch control', () => {
  it('an admin sees the launch control below the agent card', async () => {
    getCommunity.mockResolvedValue({
      ok: true,
      data: communityResponse({role: 'member', viewerIsAdmin: true}),
    })
    const r = renderScreen()
    await r.findByTestId('communityAgentLaunchControl', {}, {timeout: 3000})
    expect(r.getByTestId('communityAgentCard')).toBeTruthy()
  })

  it('an owner without viewerIsAdmin gets no launch control', async () => {
    getCommunity.mockResolvedValue({
      ok: true,
      data: communityResponse({role: 'owner'}),
    })
    const r = renderScreen()
    await r.findByTestId('communityAgentCard', {}, {timeout: 3000})
    expect(r.queryByTestId('communityAgentLaunchControl')).toBeNull()
  })

  it('a former admin (viewerIsAdmin false) gets no launch control', async () => {
    getCommunity.mockResolvedValue({
      ok: true,
      data: communityResponse({role: 'member', viewerIsAdmin: false}),
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

    getCommunity.mockResolvedValue({ok: true, data: communityResponse()})
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
      data: communityResponse({config: configWith({theme: {accent: 'red'}})}),
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

  it('renders no compose control, agent card or "Your settings" for a member with Communities off', async () => {
    mockCommunitiesEnabled = false
    getCommunity.mockResolvedValue({
      ok: true,
      data: communityResponse({
        role: 'member',
        agentSponsor: {did: SPONSOR_DID, handle: 'sam.example.com'},
      }),
    })
    const r = renderScreen()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Home'))
    expect(r.queryByTestId('communityComposerEntry')).toBeNull()
    expect(r.queryByTestId('communityAgentCard')).toBeNull()
    expect(r.queryByTestId('communityAgentGrantSection')).toBeNull()
    expect(r.queryByText('Your settings')).toBeNull()
    expect(mockComposerEntry).not.toHaveBeenCalled()
    expect(getCommunity).not.toHaveBeenCalled()
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

/*
 * One Dev 39 polish 5-7. The payloads are the real Dev runtime responses in
 * fixtures/dev-runtime-2026-10-30.json. Before a launch the runtime answers
 * `agent: null` with `agent_error` and no `agentSponsor`; after it, the member
 * response carries `agentSponsor: {did, handle}` (runtime door `sponsorView`,
 * test communities-agent-sponsor-bfd5a63c).
 */
const REAL_AGENT_DID = REAL.home.community.agent.did
const REAL_MEMBER_DID = REAL.timeline.items[0].author.did
const REAL_MEMBER_HANDLE = REAL.timeline.items[0].authorId

function realHome(extra: Record<string, unknown> = {}) {
  // getCommunity hands the screen `viewerIsAdmin` (readCommunity), not the
  // runtime's `viewer_is_admin`.
  const {viewer_is_admin: admin, ...rest} = REAL.home.community
  return {
    ...rest,
    viewerIsAdmin: admin,
    ...extra,
  } as unknown as communitiesClient.Community
}

const BEFORE_LAUNCH = realHome({
  agent: null,
  agent_error: 'agent_sponsor_missing',
})
const AFTER_LAUNCH = realHome({
  agentSponsor: {did: REAL_MEMBER_DID, handle: REAL_MEMBER_HANDLE},
})

describe('Community home - after an agent launch (One Dev 39)', () => {
  beforeEach(() => {
    getTimeline.mockResolvedValue({
      ok: true,
      data: REAL.timeline as unknown as communitiesClient.CommunityTimelinePage,
    })
    mockProfiles = {
      [REAL_AGENT_DID]: {
        did: REAL_AGENT_DID,
        handle: 'bob.example.test',
        displayName: 'Bob',
      },
    }
  })

  it('refetches the home and shows the agent card and the grant switch, with no reload', async () => {
    getCommunity
      .mockResolvedValueOnce({ok: true, data: BEFORE_LAUNCH})
      .mockResolvedValue({ok: true, data: AFTER_LAUNCH})
    launchCommunityAgent.mockResolvedValue({ok: true, data: null})

    const r = renderScreen({id: 'ao-dev-test'})
    const button = await r.findByTestId(
      'communityAgentLaunchButton',
      {},
      {timeout: 3000},
    )
    // Item 7: polish 2's compose entry is on the home for a member.
    expect(r.getByTestId('communityComposerEntry')).toBeTruthy()
    expect(r.queryByTestId('communityAgentCard')).toBeNull()
    expect(r.queryByTestId('communityAgentGrantRow')).toBeNull()
    expect(getAgentGrant).not.toHaveBeenCalled()

    fireEvent.press(button)
    await r.findByTestId('communityAgentLaunched', {}, {timeout: 3000})
    expect(launchCommunityAgent).toHaveBeenCalledWith('ao-dev-test')

    const card = await r.findByTestId(
      'communityAgentCard',
      {},
      {timeout: 3000},
    )
    expect(getCommunity).toHaveBeenCalledTimes(2)
    expect(within(card).getByText('Bob')).toBeTruthy()
    expect(within(card).getByText('◆ Agent')).toBeTruthy()
    expect(r.getByTestId('communityAgentSponsor')).toHaveTextContent(
      `AI agent · run by ${REAL_MEMBER_HANDLE}`,
    )

    const section = await r.findByTestId(
      'communityAgentGrantSection',
      {},
      {timeout: 3000},
    )
    expect(within(section).getByTestId('communityAgentGrantRow')).toBeTruthy()
    expect(
      within(section).getByText(
        'Give this community’s agent access to my content here',
      ),
    ).toBeTruthy()
    expect(getAgentGrant).toHaveBeenCalledWith('ao-dev-test')
    expect(r.getByTestId('communityComposerEntry')).toBeTruthy()
  })

  it('a failed launch refetches nothing and shows no agent card', async () => {
    getCommunity.mockResolvedValue({ok: true, data: BEFORE_LAUNCH})
    launchCommunityAgent.mockResolvedValue({
      ok: false,
      error: {kind: 'http', status: 403},
    })
    const r = renderScreen({id: 'ao-dev-test'})
    fireEvent.press(
      await r.findByTestId('communityAgentLaunchButton', {}, {timeout: 3000}),
    )
    await r.findByTestId('communityAgentLaunchError', {}, {timeout: 3000})
    expect(getCommunity).toHaveBeenCalledTimes(1)
    expect(r.queryByTestId('communityAgentCard')).toBeNull()
  })
})

describe('Community home - Members tab roster (One Dev 39)', () => {
  const MEMBER_AVATAR = 'https://cdn.example.test/member.jpg'
  const AGENT_AVATAR = 'https://cdn.example.test/bob.jpg'

  beforeEach(() => {
    getTimeline.mockResolvedValue({
      ok: true,
      data: REAL.timeline as unknown as communitiesClient.CommunityTimelinePage,
    })
    getThreadRoster.mockResolvedValue({
      ok: true,
      data: REAL.roster,
    })
    mockProfiles = {
      // The member roster entry has no DID; its id is the account handle.
      [REAL_MEMBER_HANDLE]: {
        did: REAL_MEMBER_DID,
        handle: REAL_MEMBER_HANDLE,
        displayName: 'Morgan Member',
        avatar: MEMBER_AVATAR,
      },
      [REAL_AGENT_DID]: {
        did: REAL_AGENT_DID,
        handle: 'bob.example.test',
        displayName: 'Bob',
        avatar: AGENT_AVATAR,
      },
    }
  })

  it('lists the real roster with names, avatars, the ADMIN badge and the agent label', async () => {
    mockViewerHandle = REAL_MEMBER_HANDLE
    getCommunity.mockResolvedValue({ok: true, data: AFTER_LAUNCH})
    const r = renderScreen({id: 'ao-dev-test', members: true})

    const roster = await r.findByTestId('communityRoster', {}, {timeout: 3000})
    expect(r.queryByText(/isn’t available yet/)).toBeNull()

    const member = within(roster).getByTestId(
      `communityRosterRow-${REAL_MEMBER_HANDLE}`,
    )
    expect(within(member).getByText('Morgan Member')).toBeTruthy()
    expect(within(member).getByTestId('userAvatar')).toHaveProp(
      'accessibilityLabel',
      MEMBER_AVATAR,
    )
    expect(within(member).getByText('ADMIN')).toBeTruthy()
    expect(within(member).queryByTestId('communityRosterAgentLabel')).toBeNull()

    const agentEntry = REAL.roster.roster.find(e => e.is_agent)!
    const agent = within(roster).getByTestId(
      `communityRosterRow-${agentEntry.id}`,
    )
    expect(within(agent).getByText('Bob')).toBeTruthy()
    expect(within(agent).getByText('◆ Agent')).toBeTruthy()
    expect(within(agent).getByTestId('userAvatar')).toHaveProp(
      'accessibilityLabel',
      AGENT_AVATAR,
    )
    expect(within(agent).queryByTestId('communityRosterAdminBadge')).toBeNull()

    // One roster read per top-level post in the real timeline.
    const topLevel = REAL.timeline.items.filter(i => !i.parentId)
    expect(getThreadRoster).toHaveBeenCalledTimes(topLevel.length)
    for (const item of topLevel) {
      expect(getThreadRoster).toHaveBeenCalledWith('ao-dev-test', item.id)
    }
    // Merged across threads: one row per person.
    expect(within(roster).getAllByTestId('communityRosterName')).toHaveLength(
      2,
    )
  })

  it('gives no ADMIN badge to a member the runtime did not mark', async () => {
    mockViewerHandle = REAL_MEMBER_HANDLE
    getCommunity.mockResolvedValue({
      ok: true,
      data: realHome({viewerIsAdmin: false}),
    })
    const r = renderScreen({id: 'ao-dev-test', members: true})
    const roster = await r.findByTestId('communityRoster', {}, {timeout: 3000})
    expect(within(roster).queryByTestId('communityRosterAdminBadge')).toBeNull()
  })

  it('falls back to the handle when the profile is not cached', async () => {
    mockProfiles = {}
    getCommunity.mockResolvedValue({ok: true, data: AFTER_LAUNCH})
    const r = renderScreen({id: 'ao-dev-test', members: true})
    const roster = await r.findByTestId('communityRoster', {}, {timeout: 3000})
    expect(within(roster).getByText(`@${REAL_MEMBER_HANDLE}`)).toBeTruthy()
  })

  it('never labels an is_agent entry whose DID is not the config agent', async () => {
    getThreadRoster.mockResolvedValue({
      ok: true,
      data: {
        postId: REAL.roster.postId,
        roster: [
          REAL.roster.roster[0],
          {id: 'community-agent', did: 'did:plc:spoof', is_agent: true},
        ],
      },
    })
    getCommunity.mockResolvedValue({ok: true, data: AFTER_LAUNCH})
    const r = renderScreen({id: 'ao-dev-test', members: true})
    const roster = await r.findByTestId('communityRoster', {}, {timeout: 3000})
    expect(within(roster).queryByTestId('communityRosterAgentLabel')).toBeNull()
    expect(within(roster).getAllByTestId('communityRosterName')).toHaveLength(
      1,
    )
  })

  it('shows an error when every roster read fails', async () => {
    getThreadRoster.mockResolvedValue({
      ok: false,
      error: {kind: 'http', status: 404},
    })
    getCommunity.mockResolvedValue({ok: true, data: AFTER_LAUNCH})
    const r = renderScreen({id: 'ao-dev-test', members: true})
    await r.findByTestId('communityRosterError', {}, {timeout: 3000})
    expect(r.queryByTestId('communityRoster')).toBeNull()
  })

  it('a non-member reads no roster', async () => {
    getCommunity.mockResolvedValue({ok: true, data: communityResponse()})
    const r = renderScreen({members: true})
    await r.findByTestId('communityMembersSection', {}, {timeout: 3000})
    expect(
      r.getByText('Only members can see who else is in this community.'),
    ).toBeTruthy()
    expect(r.queryByTestId('communityRoster')).toBeNull()
    expect(getThreadRoster).not.toHaveBeenCalled()
  })

  it('flag off renders no roster, agent card or grant switch and reads nothing', async () => {
    mockCommunitiesEnabled = false
    getCommunity.mockResolvedValue({ok: true, data: AFTER_LAUNCH})
    const r = renderScreen({id: 'ao-dev-test', members: true})
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Home'))
    expect(r.queryByTestId('communityMembersSection')).toBeNull()
    expect(r.queryByTestId('communityRoster')).toBeNull()
    expect(r.queryByTestId('communityAgentCard')).toBeNull()
    expect(r.queryByTestId('communityAgentGrantRow')).toBeNull()
    expect(r.queryByTestId('communityComposerEntry')).toBeNull()
    expect(getCommunity).not.toHaveBeenCalled()
    expect(getThreadRoster).not.toHaveBeenCalled()
    expect(getAgentGrant).not.toHaveBeenCalled()
  })
})
