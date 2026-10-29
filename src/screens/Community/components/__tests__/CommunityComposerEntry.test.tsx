import {describe, expect, it, jest} from '@jest/globals'
import {i18n} from '@lingui/core'
import {I18nProvider} from '@lingui/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {fireEvent, render} from '@testing-library/react-native'

const mockFlags = {COMMUNITIES_ENABLED: true}
jest.mock('#/env', () => ({
  get COMMUNITIES_ENABLED() {
    return mockFlags.COMMUNITIES_ENABLED
  },
}))
jest.mock('#/alf', () => ({atoms: new Proxy({}, {get: () => ({})})}))
jest.mock('#/components/Button', () => {
  const {Pressable, Text} =
    jest.requireActual<typeof import('react-native')>('react-native')
  return {
    Button: ({
      children,
      label,
      onPress,
      testID,
    }: {
      children: React.ReactNode
      label: string
      onPress: () => void
      testID: string
    }) => (
      <Pressable
        testID={testID}
        accessibilityLabel={label}
        accessibilityHint=""
        onPress={onPress}>
        {children}
      </Pressable>
    ),
    ButtonText: ({children}: {children: React.ReactNode}) => (
      <Text>{children}</Text>
    ),
  }
})
const mockOpenComposer = jest.fn()
jest.mock('#/lib/hooks/useOpenComposer', () => ({
  useOpenComposer: () => ({openComposer: mockOpenComposer}),
}))
jest.mock('#/state/session', () => ({
  useSession: () => ({currentAccount: {did: 'did:plc:viewer'}}),
}))
jest.mock('../../queries', () => ({
  createCommunityTimelineQueryKey: (args: unknown) => [
    'communityTimeline',
    args,
  ],
}))

import {CommunityComposerEntry} from '../CommunityComposerEntry'

function renderEntry() {
  i18n.loadAndActivate({locale: 'en', messages: {}})
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider i18n={i18n}>
        <CommunityComposerEntry communityId="ao-dev-test" tier="members" />
      </I18nProvider>
    </QueryClientProvider>,
  )
}

describe('CommunityComposerEntry', () => {
  it('opens the composer with its target fixed to this community', () => {
    mockFlags.COMMUNITIES_ENABLED = true
    mockOpenComposer.mockReset()
    const r = renderEntry()
    fireEvent.press(r.getByTestId('communityComposerEntry'))
    expect(mockOpenComposer).toHaveBeenCalledTimes(1)
    const opts = mockOpenComposer.mock.calls[0][0] as {target: unknown}
    expect(opts.target).toEqual({
      kind: 'community',
      id: 'ao-dev-test',
      tier: 'members',
    })
  })

  it('renders nothing with Communities off', () => {
    mockFlags.COMMUNITIES_ENABLED = false
    const r = renderEntry()
    expect(r.queryByTestId('communityComposerEntry')).toBeNull()
  })
})
