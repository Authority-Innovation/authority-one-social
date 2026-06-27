/**
 * Source-level guard for the unified-history rendering in MessageBubble.
 *
 * A full render test is impractical here: importing MessageBubble pulls in the
 * `#/alf` → Typography/Loader → native import chain that jest-expo can't evaluate
 * (the same limitation the ApprovalCard test documents). So we pin — at the source —
 * the two behaviors this task adds, plus the no-Lingui rule:
 *   1. mediaUrls render as inline <Image> bubbles (history AND live /app/chat replies).
 *   2. the channel annotation is rendered from the pure `channelBadge` (plain strings).
 *   3. no Lingui `<Trans>`/macro creeps in (it would garble our custom labels).
 *
 * The plain-string labels themselves are asserted directly in channelBadge.test.ts.
 */
import {readFileSync} from 'fs'
import {join} from 'path'

import {describe, expect, it} from '@jest/globals'

const SRC = readFileSync(join(__dirname, '..', 'MessageBubble.tsx'), 'utf8')

describe('MessageBubble renders media + channel badges (no compiled-catalog dependency)', () => {
  it('renders inline images from mediaUrls (maps over them into an <Image>)', () => {
    expect(SRC).toMatch(/from 'expo-image'/)
    expect(SRC).toMatch(/media\.map\(/)
    expect(SRC).toMatch(/<Image/)
    expect(SRC).toMatch(/source=\{\{uri: url\}\}/)
  })

  it('derives the channel annotation from the pure channelBadge helper', () => {
    expect(SRC).toMatch(/import \{channelBadge\} from '\.\/channelBadge'/)
    expect(SRC).toMatch(/channelBadge\(message\.channel\)/)
    // The voice case shows the mic glyph.
    expect(SRC).toMatch(/badge\.mic/)
    expect(SRC).toMatch(/MicIcon/)
  })

  it('does not import or use any Lingui macro (the source of raw-msg-id renders)', () => {
    expect(SRC).not.toMatch(/@lingui\/(react|core)\/macro/)
    expect(SRC).not.toMatch(/<Trans[\s>]/)
  })
})
