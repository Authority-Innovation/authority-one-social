/**
 * Companion guard for the agent-chat link rendering (see MessageBubble.links.test.ts).
 *
 * NOTE: this file began life as a scratch probe and the sandbox would not allow
 * it to be deleted (read-only mount, EPERM on unlink), so it has been repurposed
 * into a real, useful assertion rather than left as junk. Safe to `rm` later.
 *
 * Pins the styling/safety contract the bubble relies on at the RichText layer:
 * a multi-link message keeps each URL as its own link segment and the prose
 * between them untouched.
 */
import {RichText as RichTextAPI} from '@atproto/api'

function linkUris(text: string) {
  const rt = new RichTextAPI({text})
  rt.detectFacetsWithoutResolution()
  return Array.from(rt.segments())
    .filter(s => s.link)
    .map(s => s.link!.uri)
}

describe('agent-chat link rendering — multi-link contract', () => {
  it('keeps every scheme-prefixed URL in a message as its own link', () => {
    const uris = linkUris(
      'connect https://connect.nango.dev/?session_token=abc then see https://authority-one.com/help',
    )
    expect(uris).toEqual([
      'https://connect.nango.dev/?session_token=abc',
      'https://authority-one.com/help',
    ])
  })
})
