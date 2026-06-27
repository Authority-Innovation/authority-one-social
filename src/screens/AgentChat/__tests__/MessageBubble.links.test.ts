/**
 * Agent-chat bubbles must turn URLs in the message text into tappable links.
 *
 * SYMPTOM (live, in-app): URLs inside an agent (or user) chat bubble rendered as
 * plain, non-tappable text — e.g. a Nango connect link sent by the agent could
 * not be opened. The bubble rendered `message.text` in a plain `<Text>`.
 *
 * FIX: `MessageBubble.tsx` now renders the message via the app's `RichText`
 * component (the same one the DM bubbles use). RichText takes the plain string,
 * runs `detectFacetsWithoutResolution()`, and renders detected URLs through
 * `InlineLinkText` — reusing the app's standard, safe link-opening path.
 *
 * Two layers of guard here:
 *
 *  1. BEHAVIOURAL — exercise the exact facet detection RichText relies on
 *     (`@atproto/api` RichText + `detectFacetsWithoutResolution`) and assert a
 *     URL becomes a `link` segment while plain prose stays a single text
 *     segment with no link. This is the "URL becomes a link node / non-URL text
 *     unchanged" check, run against the real library, not a mock.
 *
 *  2. SOURCE-LEVEL — pin that the bubble actually wires RichText with the link
 *     styling/safety props. A full component render is impractical in this repo
 *     (the `#/alf` → Dialog → bottom-sheet import chain can't be evaluated under
 *     jest-expo — see ApprovalCard.test.tsx), so we guard the wiring at source
 *     the same way the sibling tests do.
 */
import {readFileSync} from 'fs'
import {join} from 'path'

import {RichText as RichTextAPI} from '@atproto/api'

/** Collect the segments of a string exactly as `RichText` does internally. */
function segmentsFor(text: string) {
  const rt = new RichTextAPI({text})
  rt.detectFacetsWithoutResolution()
  return Array.from(rt.segments())
}

describe('agent-chat message link detection (RichText facet behaviour)', () => {
  it('turns a URL in the message into a tappable link segment', () => {
    const url = 'https://connect.nango.dev/?session_token=abc123'
    const segs = segmentsFor(`Tap to connect: ${url}`)

    const linkSegs = segs.filter(s => s.link)
    expect(linkSegs.length).toBe(1)
    expect(linkSegs[0].link?.uri).toBe(url)
    // The leading prose is preserved as its own (non-link) segment.
    expect(segs.some(s => !s.link && s.text.includes('Tap to connect'))).toBe(
      true,
    )
  })

  it('linkifies a scheme-prefixed http URL', () => {
    const segs = segmentsFor('http://authority-one.com x')
    const linkSegs = segs.filter(s => s.link)
    expect(linkSegs.length).toBe(1)
    expect(linkSegs[0].link?.uri).toBe('http://authority-one.com')
  })

  it('leaves a bare domain (no scheme) as plain text — documented contract', () => {
    // `detectFacetsWithoutResolution()` only tags scheme-prefixed URLs; bare
    // domains like "authority-one.com" are NOT linkified without the agent
    // resolution path. Agent links (e.g. the Nango connect URL) always carry a
    // scheme, so this is the right, conservative behavior for rendering.
    const segs = segmentsFor('see authority-one.com for details')
    expect(segs.some(s => s.link)).toBe(false)
  })

  it('leaves plain, URL-free text as a single text segment with no link', () => {
    const segs = segmentsFor('Sure — I have scheduled that for tomorrow.')
    expect(segs.length).toBe(1)
    expect(segs[0].link).toBeUndefined()
    expect(segs[0].text).toBe('Sure — I have scheduled that for tomorrow.')
  })
})

describe('MessageBubble wires RichText for safe, styled links', () => {
  const SRC = readFileSync(
    join(__dirname, '..', 'MessageBubble.tsx'),
    'utf8',
  )

  it('renders the message text through RichText (not a plain <Text>{message.text}</Text>)', () => {
    expect(SRC).toMatch(/import\s*\{\s*RichText\s*\}\s*from\s*'#\/components\/RichText'/)
    expect(SRC).toMatch(/<RichText[\s\S]*value=\{message\.text\}/)
    // The old plain-text rendering of the message body must be gone.
    expect(SRC).not.toMatch(/<Text[^>]*>\s*\{message\.text\}\s*<\/Text>/)
  })

  it('underlines links and routes them through the safe (proxied) link path', () => {
    expect(SRC).toMatch(/interactiveStyle=\{a\.underline\}/)
    expect(SRC).toMatch(/shouldProxyLinks=\{true\}/)
  })
})
