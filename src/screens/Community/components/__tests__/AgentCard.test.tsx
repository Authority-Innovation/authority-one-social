import {beforeAll, beforeEach, describe, expect, it, jest} from '@jest/globals'
import {i18n} from '@lingui/core'
import {I18nProvider} from '@lingui/react'
import {render} from '@testing-library/react-native'

// The bottom-sheet module reads Platform.Version at load, which is undefined
// under jest-expo/ios.
jest.mock('../../../../../modules/bottom-sheet', () => ({
  BottomSheet: () => null,
  BottomSheetNativeComponent: () => null,
  BottomSheetSnapPoint: {Hidden: 0, Partial: 1, Full: 2},
}))

// The agent label in a thread post renders only with the communities flag on.
jest.mock('#/env', () => ({
  ...jest.requireActual<Record<string, unknown>>('#/env'),
  COMMUNITIES_ENABLED: true,
}))

jest.mock('#/view/com/util/UserAvatar', () => {
  const {createElement} = require('react') as typeof import('react')
  const {View} = require('react-native')
  const avatar = () => createElement(View)
  return {UserAvatar: avatar}
})

// What the app's profile cache holds for each DID. Empty unless a test fills
// it, so a sponsor with no cached profile falls back to its handle.
const mockProfileCache = new Map<
  string,
  {did: string; handle: string; displayName?: string}
>()
jest.mock('#/state/queries/profile', () => ({
  useProfileQuery: ({did}: {did: string | undefined}) => ({
    data: did ? mockProfileCache.get(did) : undefined,
  }),
}))

import {
  asClientCommunity,
  DEV_RUNTIME,
  DOOR,
  doorCommunity,
  doorCommunityWithSponsorMember,
} from '#/lib/communities/__fixtures__/door'
import {ThemeProvider} from '#/alf'
import {CommunityThreadPost} from '#/features/communityAgent/CommunityThreadPost'
import {toDescriptor} from '../../descriptor'
import {AgentCard} from '../AgentCard'

/*
 * A Release build: Lingui registers no runtime message compiler when
 * NODE_ENV is production, and the agent card's messages are not in the
 * compiled catalog until the nightly extract. Jest runs with NODE_ENV=test,
 * where Lingui does register one, so it is removed here. Then the module the
 * app's i18n setup (#/locale/i18n and i18n.web) imports for its side effect is
 * loaded, as on device. (#/locale/i18n itself pulls in ESM-only polyfills that
 * jest cannot load.)
 */
beforeAll(() => {
  i18n.setMessagesCompiler(undefined as never)
  require('#/locale/messageCompiler')
  i18n.loadAndActivate({locale: 'en', messages: {}})
})

beforeEach(() => {
  mockProfileCache.clear()
})

const SPONSOR = DOOR.communityWithSponsorMember.community.agentSponsor

function renderCard(community: ReturnType<typeof doorCommunity>) {
  const d = toDescriptor(community.id, asClientCommunity(community))
  return render(
    <I18nProvider i18n={i18n}>
      <ThemeProvider theme="light">
        <AgentCard community={d} />
      </ThemeProvider>
    </I18nProvider>,
  )
}

function textOf(node: unknown): string {
  const flat = (n: unknown): string =>
    n == null || typeof n === 'boolean'
      ? ''
      : typeof n === 'string' || typeof n === 'number'
        ? String(n)
        : Array.isArray(n)
          ? n.map(flat).join('')
          : flat((n as {children?: unknown}).children)
  return flat(node)
}

describe('AgentCard sponsor line in a Release build (build 41)', () => {
  it('fills "run by" with the sponsor display name from the profile cache', () => {
    mockProfileCache.set(SPONSOR.did, {
      did: SPONSOR.did,
      handle: SPONSOR.handle,
      displayName: 'Carol Sponsor',
    })
    const r = renderCard(doorCommunityWithSponsorMember())
    const line = r.getByTestId('communityAgentSponsor')
    expect(line).toHaveTextContent('AI agent · run by Carol Sponsor')
    expect(textOf(r.toJSON())).not.toContain('{')
    expect(textOf(r.toJSON())).not.toContain(SPONSOR.did)
  })

  it('falls back to the agentSponsor handle when there is no display name', () => {
    const r = renderCard(doorCommunityWithSponsorMember())
    expect(r.getByTestId('communityAgentSponsor')).toHaveTextContent(
      `AI agent · run by ${SPONSOR.handle}`,
    )
    expect(textOf(r.toJSON())).not.toContain('{')
  })

  it('is just "AI agent" when the door sends handle null and no name is cached', () => {
    // door.json's admin view: the sponsor holds no membership, handle null.
    const r = renderCard(doorCommunity())
    expect(r.getByTestId('communityAgentSponsor')).toHaveTextContent(
      /^AI agent$/,
    )
    expect(textOf(r.toJSON())).not.toContain('{')
  })

  it('renders the Dev capture (agent {did, is_agent}, no agentSponsor) with no placeholder', () => {
    const r = renderCard(DEV_RUNTIME.home.community)
    expect(r.getByTestId('communityAgentCard')).toBeTruthy()
    expect(textOf(r.toJSON())).not.toContain('{')
  })
})

describe('CommunityThreadPost sponsor line in a Release build (build 41)', () => {
  it('fills "run by @handle" from the door agent item and agentSponsor', () => {
    const r = render(
      <I18nProvider i18n={i18n}>
        <ThemeProvider theme="light">
          <CommunityThreadPost
            post={DOOR.timeline.items.find(i => i.is_agent) as never}
            community={
              asClientCommunity(doorCommunityWithSponsorMember()) as never
            }
          />
        </ThemeProvider>
      </I18nProvider>,
    )
    expect(r.getByTestId('communityAgentSponsor')).toHaveTextContent(
      `AI agent · run by @${SPONSOR.handle}`,
    )
    expect(textOf(r.toJSON())).not.toContain('{')
  })
})
