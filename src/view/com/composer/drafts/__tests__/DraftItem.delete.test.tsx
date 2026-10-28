/**
 * The drafts list hides the delete control when it passes no onDelete, which
 * DraftsListDialog does for a target that refuses PDS writes.
 */
import {describe, expect, it, jest} from '@jest/globals'
import {render} from '@testing-library/react-native'

// The real #/alf barrel drags in Dialog -> the native bottom-sheet module.
jest.mock('#/alf', () => {
  const styleProxy: Record<string, object> = new Proxy({}, {get: () => ({})})
  return {
    atoms: styleProxy,
    select: () => undefined,
    useTheme: () => ({
      name: 'light',
      atoms: styleProxy,
      palette: new Proxy({}, {get: () => '#000000'}),
    }),
  }
})
jest.mock('@lingui/react', () => ({
  useLingui: () => ({
    _: (d: {message?: string; id?: string}) => d.message ?? d.id ?? '',
  }),
}))
jest.mock('#/components/Typography', () => {
  const {Text} = require('react-native')
  return {Text}
})
jest.mock('#/components/Button', () => {
  const {Pressable} = require('react-native')
  return {
    Button: ({label, onPress}: {label: string; onPress: () => void}) => (
      <Pressable
        accessibilityLabel={label}
        accessibilityHint=""
        onPress={onPress}
      />
    ),
  }
})
jest.mock('#/components/Prompt', () => ({
  usePromptControl: () => ({open: jest.fn(), close: jest.fn()}),
  Basic: () => null,
}))
jest.mock('#/components/MediaPreview', () => ({}))
jest.mock('#/components/RichText', () => ({RichText: () => null}))
jest.mock('#/view/com/util/TimeElapsed', () => ({TimeElapsed: () => null}))
jest.mock('#/view/com/composer/drafts/state/storage', () => ({}))
jest.mock('#/view/com/composer/drafts/state/logger', () => ({
  logger: {debug: jest.fn(), warn: jest.fn(), error: jest.fn()},
}))
jest.mock('expo-video-thumbnails', () => ({}))

import {DraftItem} from '#/view/com/composer/drafts/DraftItem'
import {type DraftSummary} from '#/view/com/composer/drafts/state/schema'

const summary: DraftSummary = {
  id: 'd1',
  createdAt: '2026-10-28T00:00:00.000Z',
  updatedAt: '2026-10-28T00:00:00.000Z',
  draft: {posts: [{text: ''}]},
  posts: [{id: 'p1', text: ''}],
  meta: {
    isOriginatingDevice: true,
    postCount: 1,
    replyCount: 0,
    hasMedia: false,
    mediaCount: 0,
    hasQuotes: false,
    quoteCount: 0,
  },
}

describe('DraftItem delete control', () => {
  it('is shown when onDelete is passed', () => {
    const r = render(
      <DraftItem draft={summary} onSelect={() => {}} onDelete={() => {}} />,
    )
    expect(r.queryByLabelText('More options')).not.toBeNull()
  })

  it('is hidden when onDelete is omitted', () => {
    const r = render(<DraftItem draft={summary} onSelect={() => {}} />)
    expect(r.queryByLabelText('More options')).toBeNull()
    expect(r.queryByLabelText('Open draft')).not.toBeNull()
  })
})
