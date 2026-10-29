import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals'
import {i18n} from '@lingui/core'
import {I18nProvider} from '@lingui/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {act, fireEvent, render, waitFor} from '@testing-library/react-native'

// Flags are read through getters so each test can flip them.
const mockFlags = {
  COMMUNITIES_ENABLED: true,
  COMMUNITY_SWITCHER: true,
  LOCKED_COMMUNITY: '',
}
jest.mock('#/env', () => ({
  get COMMUNITIES_ENABLED() {
    return mockFlags.COMMUNITIES_ENABLED
  },
  get COMMUNITY_SWITCHER() {
    return mockFlags.COMMUNITY_SWITCHER
  },
  get LOCKED_COMMUNITY() {
    return mockFlags.LOCKED_COMMUNITY
  },
}))

// The app theme, deep-frozen so any write to it throws. The real #/alf barrel
// drags in Layout -> Dialog -> the native bottom-sheet module, which cannot
// load under jest.
function deepFreeze<T>(o: T): T {
  Object.values(o as object).forEach(v => {
    if (typeof v === 'object' && v !== null) deepFreeze(v)
  })
  return Object.freeze(o)
}
const mockTheme = deepFreeze({
  name: 'light',
  palette: {primary_500: '#0070FF'},
  atoms: {
    bg: {backgroundColor: '#FFFFFF'},
    bg_contrast_25: {backgroundColor: '#F5F5F5'},
    border_contrast_low: {borderColor: '#DDDDDD'},
    text: {color: '#000000'},
    text_contrast_medium: {color: '#555555'},
  },
})
const mockThemeSnapshot = JSON.stringify(mockTheme)
jest.mock('#/alf', () => ({
  atoms: new Proxy({}, {get: () => ({})}),
  useTheme: () => mockTheme,
}))

jest.mock('#/components/Typography', () => {
  const {Text} = require('react-native')
  return {Text}
})

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
        accessibilityLabel={label}
        accessibilityHint=""
        onPress={onPress}
        testID={testID}>
        {children}
      </Pressable>
    ),
    ButtonText: ({children}: {children: React.ReactNode}) => (
      <Text>{children}</Text>
    ),
  }
})

// A small stand-in for the dialog: the outer renders its children only while
// open, and close() runs its callback straight away.
jest.mock('#/components/Dialog', () => {
  const {useState} = jest.requireActual<typeof import('react')>('react')
  const {View} =
    jest.requireActual<typeof import('react-native')>('react-native')
  return {
    useDialogControl: () => {
      const [isOpen, setOpen] = useState(false)
      return {
        id: 'sheet',
        ref: {current: null},
        isOpen,
        open: () => setOpen(true),
        close: (cb?: () => void) => {
          setOpen(false)
          cb?.()
        },
      }
    },
    Outer: ({
      control,
      children,
    }: {
      control: {isOpen: boolean}
      children: React.ReactNode
    }) => (control.isOpen ? <>{children}</> : null),
    Handle: () => null,
    Close: () => null,
    ScrollableInner: ({
      children,
      testID,
    }: {
      children: React.ReactNode
      testID: string
    }) => <View testID={testID}>{children}</View>,
  }
})

const mockNavigate = jest.fn()
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: mockNavigate}),
}))

jest.mock('#/state/session', () => ({
  useSession: () => ({hasSession: true, currentAccount: {did: 'did:example'}}),
}))

jest.mock('#/lib/agent-runtime/communitiesClient', () => ({
  listMyCommunities: jest.fn(),
}))

import {
  type Community,
  listMyCommunities,
} from '#/lib/agent-runtime/communitiesClient'
import {
  Provider as SelectedCommunityFeedProvider,
  useSelectedCommunityFeed,
} from '#/state/shell/selected-community'
import {CommunitySwitcher} from '../index'
import {createMyCommunitiesQueryKey} from '../useMyCommunitiesQuery'

const MY_KEY = createMyCommunitiesQueryKey({did: 'did:example'})

const mockList = listMyCommunities as jest.MockedFunction<
  typeof listMyCommunities
>

i18n.load('en', {})
i18n.activate('en')

const BTB = {
  id: 'btb',
  name: 'Between Two Beers Listeners',
  accent: '#C8102E',
  memberCount: 1240,
}
const AP = {id: 'ap', name: 'After Pride'}

let selectedSeen: string[] = []
function SelectionProbe() {
  selectedSeen.push(useSelectedCommunityFeed())
  return null
}

function renderSwitcher() {
  const queryClient = new QueryClient({
    defaultOptions: {queries: {retry: false, gcTime: Infinity}},
  })
  const r = render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <SelectedCommunityFeedProvider>
          <CommunitySwitcher />
          <SelectionProbe />
        </SelectedCommunityFeedProvider>
      </QueryClientProvider>
    </I18nProvider>,
  )
  return {...r, queryClient}
}

// Test-renderer nodes, read without depending on the renderer's types.
function propsOf(node: unknown): Record<string, unknown> {
  return (node as {props: Record<string, unknown>}).props
}

function lastSelected() {
  return selectedSeen[selectedSeen.length - 1]
}

const originalFetch = global.fetch
let fetchSpy: jest.Mock

beforeEach(() => {
  mockFlags.COMMUNITIES_ENABLED = true
  mockFlags.COMMUNITY_SWITCHER = true
  mockFlags.LOCKED_COMMUNITY = ''
  selectedSeen = []
  mockList.mockReset()
  mockNavigate.mockReset()
  fetchSpy = jest.fn()
  global.fetch = fetchSpy as unknown as typeof fetch
})

afterEach(() => {
  global.fetch = originalFetch
})

describe('CommunitySwitcher flags', () => {
  it('renders no row and makes no request when the switcher flag is off', () => {
    mockFlags.COMMUNITY_SWITCHER = false
    const r = renderSwitcher()
    expect(r.queryByTestId('communitySwitcher')).toBeNull()
    expect(mockList).not.toHaveBeenCalled()
  })

  it('renders no row when communities are off', () => {
    mockFlags.COMMUNITIES_ENABLED = false
    const r = renderSwitcher()
    expect(r.queryByTestId('communitySwitcher')).toBeNull()
    expect(mockList).not.toHaveBeenCalled()
  })

  it('renders no row in a brand build locked to one community', () => {
    mockFlags.LOCKED_COMMUNITY = 'ap'
    const r = renderSwitcher()
    expect(r.queryByTestId('communitySwitcher')).toBeNull()
  })
})

describe('CommunitySwitcher chips', () => {
  it('shows "All" then one chip per membership the client returns', async () => {
    mockList.mockResolvedValue({ok: true, data: [BTB, AP]})
    const r = renderSwitcher()
    await r.findByTestId('communityChip-btb')

    expect(r.getByTestId('communityChip-all')).toBeTruthy()
    expect(r.getByTestId('communityChip-ap')).toBeTruthy()
    const chipIds = r
      .getAllByRole('tab')
      .map(node => propsOf(node).testID as string)
    expect(chipIds).toEqual([
      'communityChip-all',
      'communityChip-btb',
      'communityChip-ap',
    ])
    expect(r.getByText('Between Two Beers Listeners')).toBeTruthy()
    expect(r.getByText('After Pride')).toBeTruthy()
  })

  it('shows only "All" when the client fails', async () => {
    mockList.mockResolvedValue({ok: false, error: {kind: 'network'}})
    const r = renderSwitcher()
    await waitFor(() => expect(mockList).toHaveBeenCalled())
    expect(r.getAllByRole('tab')).toHaveLength(1)
  })

  it('shows only "All" when the first load fails', async () => {
    mockList.mockResolvedValue({
      ok: false,
      error: {kind: 'http', status: 503},
    })
    const r = renderSwitcher()
    await waitFor(() => expect(mockList).toHaveBeenCalled())
    await waitFor(() =>
      expect(r.queryClient.getQueryState(MY_KEY)?.status).toBe('error'),
    )
    expect(r.getAllByRole('tab')).toHaveLength(1)
    expect(lastSelected()).toBe('communities')
  })

  it('shows only "All" when signed out', async () => {
    mockList.mockResolvedValue({ok: false, error: {kind: 'signed_out'}})
    const r = renderSwitcher()
    await waitFor(() => expect(mockList).toHaveBeenCalled())
    await waitFor(() =>
      expect(r.queryClient.getQueryState(MY_KEY)?.status).toBe('success'),
    )
    expect(r.getAllByRole('tab')).toHaveLength(1)
  })

  it('keeps the last good list and the selection when a refetch fails', async () => {
    mockList.mockResolvedValue({ok: true, data: [BTB, AP]})
    const r = renderSwitcher()
    await r.findByTestId('communityChip-btb')
    fireEvent.press(r.getByTestId('communityChip-btb'))
    expect(lastSelected()).toBe('community|btb')

    mockList.mockResolvedValue({ok: false, error: {kind: 'network'}})
    const calls = mockList.mock.calls.length
    await act(async () => {
      await r.queryClient.refetchQueries()
    })
    expect(mockList.mock.calls.length).toBe(calls + 1)
    expect(r.queryClient.getQueryState(MY_KEY)?.status).toBe('error')

    expect(r.getByTestId('communityChip-btb')).toBeTruthy()
    expect(r.getByTestId('communityChip-ap')).toBeTruthy()
    expect(
      propsOf(r.getByTestId('communityChip-btb')).accessibilityState,
    ).toEqual({selected: true})
    expect(lastSelected()).toBe('community|btb')
  })

  it('drops malformed and duplicate entries', async () => {
    mockList.mockResolvedValue({
      ok: true,
      data: [BTB, {id: '', name: 'x'}, {id: 'n'}, {...BTB}] as Community[],
    })
    const r = renderSwitcher()
    await r.findByTestId('communityChip-btb')
    expect(r.getAllByRole('tab')).toHaveLength(2)
  })

  it('selecting a chip updates shell state with no network call', async () => {
    mockList.mockResolvedValue({ok: true, data: [BTB, AP]})
    const r = renderSwitcher()
    await r.findByTestId('communityChip-btb')
    const listCalls = mockList.mock.calls.length
    expect(lastSelected()).toBe('communities')

    fireEvent.press(r.getByTestId('communityChip-btb'))
    expect(lastSelected()).toBe('community|btb')
    expect(
      propsOf(r.getByTestId('communityChip-btb')).accessibilityState,
    ).toEqual({selected: true})

    fireEvent.press(r.getByTestId('communityChip-all'))
    expect(lastSelected()).toBe('communities')

    expect(mockList.mock.calls.length).toBe(listCalls)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('tapping a community chip opens its community home; "All" does not navigate', async () => {
    mockList.mockResolvedValue({ok: true, data: [BTB, AP]})
    const r = renderSwitcher()
    await r.findByTestId('communityChip-btb')
    fireEvent.press(r.getByTestId('communityChip-btb'))
    expect(mockNavigate).toHaveBeenCalledWith('Community', {id: 'btb'})
    mockNavigate.mockReset()
    fireEvent.press(r.getByTestId('communityChip-all'))
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('removes a community the client no longer lists and falls back to "All"', async () => {
    mockList.mockResolvedValue({ok: true, data: [BTB, AP]})
    const r = renderSwitcher()
    await r.findByTestId('communityChip-btb')
    fireEvent.press(r.getByTestId('communityChip-btb'))
    expect(lastSelected()).toBe('community|btb')

    // The person leaves BTB; the next list no longer has it.
    mockList.mockResolvedValue({ok: true, data: [AP]})
    await act(async () => {
      await r.queryClient.refetchQueries()
    })

    await waitFor(() => expect(r.queryByTestId('communityChip-btb')).toBeNull())
    expect(r.getByTestId('communityChip-ap')).toBeTruthy()
    await waitFor(() => expect(lastSelected()).toBe('communities'))
  })
})

describe('CommunitySwitcher long-press sheet', () => {
  it('opens on long-press and closes again', async () => {
    mockList.mockResolvedValue({ok: true, data: [BTB, AP]})
    const r = renderSwitcher()
    await r.findByTestId('communityChip-btb')
    expect(r.queryByTestId('communitySwitcherSheet')).toBeNull()

    fireEvent(r.getByTestId('communityChip-btb'), 'longPress')
    expect(r.getByTestId('communitySwitcherSheet')).toBeTruthy()
    expect(r.getByText('1,240 members')).toBeTruthy()
    // Long-press alone does not change the selection.
    expect(lastSelected()).toBe('communities')

    fireEvent.press(r.getByTestId('communitySwitcherSheetClose'))
    expect(r.queryByTestId('communitySwitcherSheet')).toBeNull()
  })

  it('"Show in Home" selects the community after closing', async () => {
    mockList.mockResolvedValue({ok: true, data: [BTB, AP]})
    const r = renderSwitcher()
    await r.findByTestId('communityChip-ap')

    fireEvent(r.getByTestId('communityChip-ap'), 'longPress')
    fireEvent.press(r.getByTestId('communitySwitcherSheetShow'))
    expect(r.queryByTestId('communitySwitcherSheet')).toBeNull()
    expect(lastSelected()).toBe('community|ap')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('"Open community" navigates to the community route', async () => {
    mockList.mockResolvedValue({ok: true, data: [BTB]})
    const r = renderSwitcher()
    await r.findByTestId('communityChip-btb')

    fireEvent(r.getByTestId('communityChip-btb'), 'longPress')
    fireEvent.press(r.getByTestId('communitySwitcherSheetOpen'))
    expect(mockNavigate).toHaveBeenCalledWith('Community', {id: 'btb'})
  })
})

describe('CommunitySwitcher accent (N3)', () => {
  function flatten(style: unknown): Record<string, unknown> {
    if (Array.isArray(style)) {
      return Object.assign({}, ...style.map(flatten))
    }
    return (style as Record<string, unknown>) ?? {}
  }

  it('puts the accent on the chip and header only; the app theme is unchanged', async () => {
    mockList.mockResolvedValue({
      ok: true,
      data: [BTB, {...AP, accent: 'red; position: absolute'}],
    })
    const r = renderSwitcher()
    await r.findByTestId('communityChip-btb')

    // Before selection the header has no accent.
    expect(
      flatten(propsOf(r.getByTestId('communitySwitcher')).style)
        .borderBottomColor,
    ).toBeUndefined()

    fireEvent.press(r.getByTestId('communityChip-btb'))

    expect(
      flatten(propsOf(r.getByTestId('communitySwitcher')).style)
        .borderBottomColor,
    ).toBe('#C8102E')
    expect(
      flatten(propsOf(r.getByTestId('communityChip-btb')).style).borderColor,
    ).toBe('#C8102E')
    expect(
      flatten(propsOf(r.getByTestId('communityChip-btb-accent')).style)
        .backgroundColor,
    ).toBe('#C8102E')

    // A non-hex accent is ignored.
    expect(r.queryByTestId('communityChip-ap-accent')).toBeNull()

    // The app theme object is untouched (it is frozen, so a write would also
    // have thrown).
    expect(JSON.stringify(mockTheme)).toBe(mockThemeSnapshot)
    expect(mockTheme.palette.primary_500).toBe('#0070FF')
    expect(mockTheme.atoms.bg.backgroundColor).toBe('#FFFFFF')
  })
})
