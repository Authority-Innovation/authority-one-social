import {beforeEach, describe, expect, it, jest} from '@jest/globals'
import {i18n} from '@lingui/core'
import {I18nProvider} from '@lingui/react'
import {render} from '@testing-library/react-native'

// A stub of the app's profile cache: what useProfileQuery would return for
// each actor (DID or handle) already in the cache.
const mockProfileCache = new Map<
  string,
  {did: string; handle: string; displayName?: string; avatar?: string}
>()
const mockProfileLookups: (string | undefined)[] = []
jest.mock('#/state/queries/profile', () => ({
  useProfileQuery: ({did}: {did: string | undefined}) => {
    mockProfileLookups.push(did)
    return {data: did ? mockProfileCache.get(did) : undefined}
  },
}))

jest.mock('#/view/com/util/UserAvatar', () => {
  const {createElement} = require('react') as typeof import('react')
  const {View} = require('react-native')
  const avatar = (props: {avatar?: string; type?: string}) =>
    createElement(View, {
      testID: 'communityPostAvatar',
      avatarUri: props.avatar,
      avatarType: props.type,
    })
  return {UserAvatar: avatar}
})

import {Provider as TickProvider} from '#/state/shell/tick-every-minute'
import {ThemeProvider} from '#/alf'
import {type MemberPostRowData, toMemberPostRows} from '../../memberRows'
import {MemberPostRow} from '../MemberPostRow'

i18n.loadAndActivate({locale: 'en', messages: {}})

const AGENT_DID = 'did:plc:agentagentagentaaaaaaaaa'
const MEMBER_DID = 'did:plc:membermemberaaaaaaaaaaaa'

function hoursAgo(h: number) {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString()
}

/** A row read through the real reader, from the door's item shape. */
function rowFrom(item: Record<string, unknown>): MemberPostRowData {
  const [row] = toMemberPostRows([{items: [item]}])
  return row
}

function memberItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    parentId: null,
    authorId: 'member.example.test',
    text: 'Hello community',
    createdAt: hoursAgo(2),
    is_agent: false,
    author: {did: MEMBER_DID, is_agent: false},
    ...overrides,
  }
}

function renderRow(post: MemberPostRowData, agentDid?: string) {
  return render(
    <I18nProvider i18n={i18n}>
      <ThemeProvider theme="light">
        <TickProvider>
          <MemberPostRow post={post} agentDid={agentDid} />
        </TickProvider>
      </ThemeProvider>
    </I18nProvider>,
  )
}

beforeEach(() => {
  mockProfileCache.clear()
  mockProfileLookups.length = 0
})

describe('MemberPostRow', () => {
  it('renders the display name and avatar resolved from the profile cache', () => {
    mockProfileCache.set(MEMBER_DID, {
      did: MEMBER_DID,
      handle: 'member.example.test',
      displayName: 'Mia Member',
      avatar: 'https://cdn.example.test/mia.jpg',
    })
    const r = renderRow(rowFrom(memberItem()), AGENT_DID)
    expect(mockProfileLookups).toContain(MEMBER_DID)
    expect(r.getByTestId('communityPostAuthorName')).toHaveTextContent(
      'Mia Member',
    )
    expect(r.queryByText('member.example.test')).toBeNull()
    expect(r.getByTestId('communityPostAvatar').props.avatarUri).toBe(
      'https://cdn.example.test/mia.jpg',
    )
  })

  it('looks the profile up by handle when the item has no author did', () => {
    mockProfileCache.set('member.example.test', {
      did: MEMBER_DID,
      handle: 'member.example.test',
      displayName: 'Mia Member',
    })
    const r = renderRow(rowFrom(memberItem({author: undefined})))
    expect(mockProfileLookups).toContain('member.example.test')
    expect(r.getByTestId('communityPostAuthorName')).toHaveTextContent(
      'Mia Member',
    )
  })

  it('falls back to the handle when the profile is not cached', () => {
    const r = renderRow(rowFrom(memberItem()), AGENT_DID)
    expect(r.getByTestId('communityPostAuthorName')).toHaveTextContent(
      '@member.example.test',
    )
    expect(r.getByTestId('communityPostAvatar').props.avatarUri).toBeUndefined()
  })

  it('falls back to the handle when the cached profile has no display name', () => {
    mockProfileCache.set(MEMBER_DID, {
      did: MEMBER_DID,
      handle: 'member.example.test',
      displayName: '  ',
    })
    const r = renderRow(rowFrom(memberItem()))
    expect(r.getByTestId('communityPostAuthorName')).toHaveTextContent(
      '@member.example.test',
    )
  })

  it('shows the agent label for an is_agent author whose did matches the config agent', () => {
    mockProfileCache.set(AGENT_DID, {
      did: AGENT_DID,
      handle: 'steve.example.test',
      displayName: 'Steve',
    })
    const r = renderRow(
      rowFrom(
        memberItem({
          authorId: 'steve.example.test',
          is_agent: true,
          author: {did: AGENT_DID, is_agent: true},
        }),
      ),
      AGENT_DID,
    )
    expect(r.getByTestId('communityPostAuthorName')).toHaveTextContent('Steve')
    expect(r.getByTestId('communityPostAgentLabel')).toBeTruthy()
  })

  it('shows no agent label when the did does not match, even with is_agent and the agent name', () => {
    mockProfileCache.set('did:plc:eve', {
      did: 'did:plc:eve',
      handle: 'eve.example.test',
      displayName: 'Steve',
    })
    const r = renderRow(
      rowFrom(
        memberItem({
          authorId: 'eve.example.test',
          is_agent: true,
          author: {did: 'did:plc:eve', is_agent: true},
        }),
      ),
      AGENT_DID,
    )
    expect(r.getByTestId('communityPostAuthorName')).toHaveTextContent('Steve')
    expect(r.queryByTestId('communityPostAgentLabel')).toBeNull()
  })

  it('shows no agent label for a member row or when the community names no agent', () => {
    const member = renderRow(rowFrom(memberItem()), AGENT_DID)
    expect(member.queryByTestId('communityPostAgentLabel')).toBeNull()
    member.unmount()

    const noConfig = renderRow(
      rowFrom(memberItem({author: {did: AGENT_DID, is_agent: true}})),
      undefined,
    )
    expect(noConfig.queryByTestId('communityPostAgentLabel')).toBeNull()
  })

  it('renders the short relative time, not a date string', () => {
    const r = renderRow(rowFrom(memberItem({createdAt: hoursAgo(2)})))
    expect(r.getByTestId('communityPostTime')).toHaveTextContent('· 2h')

    const days = renderRow(
      rowFrom(memberItem({id: 'p2', createdAt: hoursAgo(3 * 24 + 1)})),
    )
    expect(days.getByTestId('communityPostTime')).toHaveTextContent('· 3d')
  })

  it('keeps the full date for screen readers', () => {
    const createdAt = '2026-10-29T19:18:34.328Z'
    const r = renderRow(rowFrom(memberItem({createdAt})))
    expect(r.getByTestId('communityPostTime').props.accessibilityLabel).toBe(
      i18n.date(new Date(createdAt), {dateStyle: 'long', timeStyle: 'short'}),
    )
  })

  it('renders no time for an item without a valid createdAt', () => {
    const r = renderRow(rowFrom(memberItem({createdAt: 'not a date'})))
    expect(r.queryByTestId('communityPostTime')).toBeNull()
  })
})
