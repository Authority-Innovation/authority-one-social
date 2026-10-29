import {beforeEach, describe, expect, it, jest} from '@jest/globals'
import {i18n} from '@lingui/core'
import {I18nProvider} from '@lingui/react'
import {
  act,
  fireEvent,
  render as rtlRender,
} from '@testing-library/react-native'

// The real #/alf barrel drags in Layout -> Dialog -> the native bottom-sheet
// module, which cannot load under jest. These components only read style
// atoms and theme colors, so proxy stubs are faithful enough.
jest.mock('#/alf', () => {
  const styleProxy: Record<string, object> = new Proxy({}, {get: () => ({})})
  return {
    atoms: styleProxy,
    useTheme: () => ({
      atoms: styleProxy,
      palette: new Proxy({}, {get: () => '#000000'}),
    }),
  }
})

jest.mock('#/components/Typography', () => {
  const {Text} = require('react-native')
  return {Text}
})

// Exposes the requested shape so the agent's distinct avatar is assertable.
jest.mock('#/view/com/util/UserAvatar', () => {
  const {View} = require('react-native')
  return {
    UserAvatar: ({shape}: {shape?: string}) => (
      <View testID={`avatarShape-${shape ?? 'circle'}`} />
    ),
  }
})

// A minimal toggle: pressing the item flips its value through onChange.
jest.mock('#/components/forms/Toggle', () => {
  const {Pressable, Text} = require('react-native')
  return {
    Item: ({
      label,
      value,
      onChange,
      children,
    }: {
      label: string
      value: boolean
      onChange: (v: boolean) => void
      children: React.ReactNode
    }) => (
      <Pressable
        testID="agentGrantToggle"
        accessibilityLabel={label}
        accessibilityHint=""
        accessibilityState={{checked: value}}
        onPress={() => onChange(!value)}>
        {children}
      </Pressable>
    ),
    LabelText: ({children}: {children: React.ReactNode}) => (
      <Text>{children}</Text>
    ),
    Platform: () => null,
  }
})

jest.mock('#/logger', () => ({
  logger: {warn: jest.fn(), error: jest.fn(), info: jest.fn()},
}))

jest.mock('#/lib/agent-runtime/communitiesClient', () => ({
  setAgentGrant: jest.fn(),
}))

const mockFlags = {communities: true}
jest.mock('#/env', () => ({
  get COMMUNITIES_ENABLED() {
    return mockFlags.communities
  },
}))

import {setAgentGrant} from '#/lib/agent-runtime/communitiesClient'
import {
  asClientCommunity,
  DOOR_AGENT_DID,
  DOOR_SPONSOR_DID,
  doorCommunity,
  doorCommunityWithSponsorMember,
  doorItem,
} from '#/lib/communities/__fixtures__/door'
import {logger} from '#/logger'
import {AgentGrantRow} from '../AgentGrantRow'
import {CommunityThreadPost} from '../CommunityThreadPost'
import {resolveAuthorLabel} from '../labelRule'
import {
  type CommunityAgentConfig,
  type CommunityThreadPostData as Post,
} from '../types'

i18n.loadAndActivate({locale: 'en', messages: {}})

function isChecked(el: {props: unknown}): boolean {
  const props = el.props as {accessibilityState?: {checked?: boolean}}
  return props.accessibilityState?.checked === true
}

// Press, then let the setAgentGrant promise settle inside act.
async function press(el: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(el)
    await Promise.resolve()
  })
}

function render(ui: React.ReactElement) {
  return rtlRender(<I18nProvider i18n={i18n}>{ui}</I18nProvider>)
}

const mockSetAgentGrant = setAgentGrant as jest.Mock<typeof setAgentGrant>

const HUMAN_DID = doorItem('post').author!.did!
const DISCLOSURE_URL = 'https://example.com/garden/agent'

/**
 * door.json's community after its sponsor joined, as a member sees it:
 * `agent.did` and `agentSponsor: {did, handle: 'carol-sponsor'}`.
 */
const community: CommunityAgentConfig = asClientCommunity(
  doorCommunityWithSponsorMember(),
)
const SPONSOR_HANDLE = community.agentSponsor!.handle!

/** The same community without the sponsor view (a runtime before bfd5a63c). */
function withoutSponsor(c: CommunityAgentConfig): CommunityAgentConfig {
  const {agentSponsor: _sponsor, ...rest} = c
  return rest
}

/** door.json's agent item; by default with no sources, as the door sends them. */
function agentReply(overrides: Partial<Post> = {}): Post {
  return {...doorItem('agent'), sources: [], no_source: true, ...overrides}
}

beforeEach(() => {
  mockFlags.communities = true
  jest.clearAllMocks()
})

describe('community agent label rule (N1)', () => {
  it('agent author with is_agent and the config DID: pill, sponsor line, square avatar', () => {
    const r = render(
      <CommunityThreadPost post={agentReply()} community={community} />,
    )
    expect(r.getByTestId('communityPostAgent')).toBeTruthy()
    expect(r.getByTestId('communityAgentPill')).toBeTruthy()
    expect(r.getByText('◆ Agent')).toBeTruthy()
    expect(community.agent?.did).toBe(DOOR_AGENT_DID)
    expect(r.getByTestId('communityAgentSponsor')).toHaveTextContent(
      `AI agent · run by @${SPONSOR_HANDLE}`,
    )
    expect(r.getByTestId('avatarShape-square')).toBeTruthy()
    expect(r.queryByTestId('avatarShape-circle')).toBeNull()
  })

  it('human whose handle ends in pds.authority-one.com renders as a human', () => {
    const post: Post = {
      ...doorItem('post'),
      // Shares the agent's host. The rule must never look at the member id.
      authorId: 'sam.pds.authority-one.com',
      author: {did: HUMAN_DID, is_agent: false},
      text: 'New here. Where should I start?',
    }
    const r = render(<CommunityThreadPost post={post} community={community} />)
    expect(r.getByTestId('communityPostMember')).toBeTruthy()
    expect(r.queryByTestId('communityAgentPill')).toBeNull()
    expect(r.queryByTestId('communityAgentSponsor')).toBeNull()
    expect(r.getByTestId('avatarShape-circle')).toBeTruthy()
  })

  it('is_agent from an author that is not the config agent renders as a human', () => {
    const r = render(
      <CommunityThreadPost
        post={agentReply({
          author: {did: HUMAN_DID, is_agent: true},
        })}
        community={community}
      />,
    )
    expect(r.getByTestId('communityPostMember')).toBeTruthy()
    expect(r.queryByTestId('communityAgentPill')).toBeNull()
  })

  it('the config agent DID without is_agent renders as a human', () => {
    expect(
      resolveAuthorLabel({is_agent: false, did: DOOR_AGENT_DID}, community),
    ).toEqual({kind: 'member'})
  })

  it('agent with no sponsor renders as a human with an operator warning', () => {
    const noSponsor = {...withoutSponsor(community), viewerIsAdmin: true}
    const r = render(
      <CommunityThreadPost post={agentReply()} community={noSponsor} />,
    )
    expect(r.getByTestId('communityPostMember')).toBeTruthy()
    expect(r.queryByTestId('communityAgentPill')).toBeNull()
    expect(r.queryByTestId('communityAgentSponsor')).toBeNull()
    expect(r.queryByTestId('communityAgentSources')).toBeNull()
    expect(r.queryByTestId('communityAgentNoSource')).toBeNull()
    expect(r.getByTestId('avatarShape-circle')).toBeTruthy()
    expect(r.getByTestId('communityAgentNoSponsorWarning')).toBeTruthy()
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  it('sponsor with no handle (door answers null) shows the agent label, never the community name or DID', () => {
    // door.json's community before the sponsor joined: handle null.
    const unnamed = asClientCommunity(doorCommunity())
    expect(unnamed.agentSponsor).toEqual({did: DOOR_SPONSOR_DID, handle: null})
    expect(resolveAuthorLabel(agentReply().author, unnamed)).toEqual({
      kind: 'agent',
      sponsorHandle: '',
    })
    const r = render(
      <CommunityThreadPost post={agentReply()} community={unnamed} />,
    )
    expect(r.getByTestId('communityPostAgent')).toBeTruthy()
    expect(r.getByTestId('communityAgentSponsor')).toHaveTextContent(
      'AI agent',
      {exact: true},
    )
    fireEvent.press(r.getByTestId('communityAgentWhy'))
    const text = JSON.stringify(r.toJSON())
    expect(text).not.toContain(community.name)
    expect(text).not.toContain(DOOR_SPONSOR_DID)
    expect(text).not.toContain('run by')
  })

  it('agent with no sponsor shows no warning to an ordinary member', () => {
    const r = render(
      <CommunityThreadPost
        post={agentReply()}
        community={withoutSponsor(community)}
      />,
    )
    expect(r.getByTestId('communityPostMember')).toBeTruthy()
    expect(r.queryByTestId('communityAgentNoSponsorWarning')).toBeNull()
  })
})

describe('community agent sources', () => {
  it('reply with sources lists each item', () => {
    // door.json's agent item as the door sent it, plus a second source with
    // no date (`at: null`).
    const real = doorItem('agent')
    const [cited] = real.sources!
    const r = render(
      <CommunityThreadPost
        post={{
          ...real,
          sources: [
            cited,
            {
              title: 'Garden notes, winter (sample)',
              kind: 'show notes',
              ref: 'https://example.test/notes/2',
              at: null,
            },
          ],
        }}
        community={community}
      />,
    )
    expect(r.getByTestId('communityAgentSources')).toBeTruthy()
    expect(r.getAllByTestId('communityAgentSource')).toHaveLength(2)
    expect(r.getByText(cited.title!)).toBeTruthy()
    expect(r.getByText('Garden notes, winter (sample)')).toBeTruthy()
    // kind, then the cited item's own date (`at`), in that order.
    expect(
      r.getByText(
        `${cited.kind} · ${i18n.date(new Date(cited.at!), {dateStyle: 'medium'})}`,
      ),
    ).toBeTruthy()
    expect(r.getByText('show notes')).toBeTruthy()
    expect(r.getByText('Sources')).toBeTruthy()
    expect(r.queryByTestId('communityAgentNoSource')).toBeNull()
  })

  it('reply with no sources says "No source cited"', () => {
    const r = render(
      <CommunityThreadPost post={agentReply()} community={community} />,
    )
    expect(r.getByText('No source cited')).toBeTruthy()
    expect(r.queryByTestId('communityAgentSources')).toBeNull()
  })

  it('"Why am I seeing an agent?" opens the disclosure with its link', () => {
    const r = render(
      <CommunityThreadPost
        post={agentReply()}
        community={community}
        agentDisclosureUrl={DISCLOSURE_URL}
      />,
    )
    expect(r.queryByTestId('communityAgentWhyBody')).toBeNull()
    fireEvent.press(r.getByTestId('communityAgentWhy'))
    expect(r.getByTestId('communityAgentWhyBody')).toBeTruthy()
    expect(r.getByTestId('communityAgentDisclosureLink')).toBeTruthy()
  })
})

describe('agent grant row', () => {
  it('is off by default and toggling calls setAgentGrant once with true', async () => {
    mockSetAgentGrant.mockResolvedValue({
      ok: true,
      data: {communityId: 'btb-listeners', on: true},
    })
    const r = render(<AgentGrantRow communityId="btb-listeners" />)
    const toggle = r.getByTestId('agentGrantToggle')
    expect(isChecked(toggle)).toBe(false)
    expect(
      r.getByText('Give this community’s agent access to my content here'),
    ).toBeTruthy()

    await press(toggle)
    expect(mockSetAgentGrant).toHaveBeenCalledTimes(1)
    expect(mockSetAgentGrant).toHaveBeenCalledWith('btb-listeners', true)
    expect(isChecked(r.getByTestId('agentGrantToggle'))).toBe(true)
  })

  it('turning it off calls setAgentGrant once with false', async () => {
    mockSetAgentGrant.mockResolvedValue({
      ok: true,
      data: {communityId: 'btb-listeners', on: false},
    })
    const r = render(<AgentGrantRow communityId="btb-listeners" initialValue />)
    await press(r.getByTestId('agentGrantToggle'))
    expect(mockSetAgentGrant).toHaveBeenCalledTimes(1)
    expect(mockSetAgentGrant).toHaveBeenCalledWith('btb-listeners', false)
  })

  it('copy names the community agent, never the person’s own agent', () => {
    const r = render(<AgentGrantRow communityId="btb-listeners" />)
    const text = JSON.stringify(r.toJSON())
    expect(text).toContain('community’s agent')
    expect(text).toContain('access to your content in this community')
    expect(text).not.toMatch(/members-only/i)
    expect(text).not.toMatch(/\bBob\b/)
    expect(text).not.toMatch(/\bmy agent\b/i)
    expect(text).not.toMatch(/\byour agent\b/i)
    expect(text).not.toMatch(/\bfor me\b/)
  })

  it('snaps back and shows an error when the runtime refuses', async () => {
    mockSetAgentGrant.mockResolvedValue({
      ok: false,
      error: {kind: 'http', status: 500},
    })
    const r = render(<AgentGrantRow communityId="btb-listeners" />)
    await press(r.getByTestId('agentGrantToggle'))
    expect(isChecked(r.getByTestId('agentGrantToggle'))).toBe(false)
    expect(r.getByTestId('communityAgentGrantError')).toBeTruthy()
  })
})

describe('flag off (EXPO_PUBLIC_COMMUNITIES_ENABLED)', () => {
  it('shows no agent UI on an agent reply', () => {
    mockFlags.communities = false
    const r = render(
      <CommunityThreadPost
        post={agentReply({
          sources: [
            {
              title: 'Episode 12 (sample)',
              kind: null,
              ref: 'https://example.com',
              at: null,
            },
          ],
        })}
        community={community}
      />,
    )
    expect(r.getByTestId('communityPostMember')).toBeTruthy()
    expect(r.queryByTestId('communityAgentPill')).toBeNull()
    expect(r.queryByTestId('communityAgentSponsor')).toBeNull()
    expect(r.queryByTestId('communityAgentSources')).toBeNull()
    expect(r.queryByTestId('communityAgentNoSource')).toBeNull()
    expect(r.queryByTestId('communityAgentWhy')).toBeNull()
    expect(r.getByTestId('avatarShape-circle')).toBeTruthy()
  })

  it('renders no agent grant row', () => {
    mockFlags.communities = false
    const r = render(<AgentGrantRow communityId="btb-listeners" />)
    expect(r.queryByTestId('communityAgentGrantRow')).toBeNull()
    expect(r.toJSON()).toBeNull()
  })
})
