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
}))

jest.mock('#/state/queries/group', () => ({
  useGroupTimelineQuery: jest.fn(() => ({data: undefined})),
  useGroupMembersQuery: jest.fn(() => ({data: undefined})),
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
import {useGroupTimelineQuery} from '#/state/queries/group'
import {applyCommunitiesFlag} from '#/screens/Community/linking'
import {ThemeProvider, useTheme} from '#/alf'
import {router} from '#/routes'
import {CommunityMembersScreen, CommunityScreen} from '../index'

i18n.loadAndActivate({locale: 'en', messages: {}})

const getCommunity = communitiesClient.getCommunity as jest.Mock<
  typeof communitiesClient.getCommunity
>
const getTimeline = communitiesClient.getTimeline as jest.Mock<
  typeof communitiesClient.getTimeline
>
const groupTimeline = useGroupTimelineQuery as unknown as jest.Mock

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

function renderScreen({
  id = 'btb',
  members = false,
}: {id?: string; members?: boolean} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {queries: {retry: false}},
  })
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
  jest.clearAllMocks()
  getTimeline.mockResolvedValue({
    ok: true,
    data: {
      posts: [
        {
          id: 'p1',
          author: {displayName: 'Sam R.', is_agent: false},
          body: 'What should I listen to first?',
          createdAt: '2026-10-28T09:29:00.000Z',
        },
        {
          id: 'p2',
          author: {
            displayName: 'Steve',
            is_agent: true,
            did: AGENT_DID,
          } as communitiesClient.CommunityPostAuthor,
          body: 'Episode 12 is a good start.',
          parentId: 'p1',
          createdAt: '2026-10-28T09:40:00.000Z',
        },
        {
          // Flagged by the runtime but not the config's agent: no label.
          id: 'p3',
          author: {displayName: 'Steve Agent', is_agent: true},
          body: 'I am also an agent.',
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

  it('labels a post as the agent only from the config DID plus is_agent', async () => {
    const r = renderScreen()
    await r.findByText('Episode 12 is a good start.', {}, {timeout: 3000})
    expect(r.getByText('I am also an agent.')).toBeTruthy()
    expect(r.getAllByTestId('communityPostAgentLabel')).toHaveLength(1)
    expect(
      within(r.getByTestId('communityPost-p2')).getByTestId(
        'communityPostAgentLabel',
      ),
    ).toBeTruthy()
  })

  it('passes this community id to the composer entry', async () => {
    const r = renderScreen({id: 'btb'})
    await r.findByText('What should I listen to first?', {}, {timeout: 3000})
    expect(mockComposerEntry).toHaveBeenCalled()
    for (const call of mockComposerEntry.mock.calls) {
      expect(call[0]).toEqual({communityId: 'btb'})
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

  it('is hidden when the config has no agentSponsor', async () => {
    getCommunity.mockResolvedValue({
      ok: true,
      data: communityResponse({config: configWith({agentSponsor: undefined})}),
    })
    const r = renderScreen()
    await r.findByTestId('communityHeader', {}, {timeout: 3000})
    expect(r.queryByTestId('communityAgentCard')).toBeNull()
  })

  it('shows the name, sponsor line and scope when both are set', async () => {
    getCommunity.mockResolvedValue({ok: true, data: communityResponse()})
    const r = renderScreen()
    await r.findByTestId('communityAgentCard', {}, {timeout: 3000})
    expect(r.getByText('Steve')).toBeTruthy()
    expect(r.getByTestId('communityAgentSponsor')).toHaveTextContent(
      'AI agent · sponsor: Between Two Beers',
    )
    expect(r.getByTestId('communityAgentScope')).toBeTruthy()
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
