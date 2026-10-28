// Includes a jest-only SOURCE-GUARD test over the reply openers.
// Node builtins are fine here (never bundled into the app).
// eslint-disable-next-line import-x/no-nodejs-modules
import {readdirSync, readFileSync, statSync} from 'node:fs'
// eslint-disable-next-line import-x/no-nodejs-modules
import {join} from 'node:path'

import {describe, expect, it} from '@jest/globals'

import {guardComposerPdsWrite} from '#/lib/communities/composerTarget'
import {feedPostTarget} from '#/lib/communities/feedPostTarget'
import {resolveTarget} from '#/lib/communities/resolveTarget'

const PDS_POST = 'at://did:plc:parent/app.bsky.feed.post/3kabc'

describe('feedPostTarget', () => {
  it('an AppView feed post is a profile post', () => {
    expect(feedPostTarget({uri: PDS_POST})).toEqual({kind: 'profile'})
  })

  it.each([
    ['runtime id', 'cpost_123'],
    ['empty uri', ''],
    ['non-post AT-URI', 'at://did:plc:x/app.bsky.graph.list/1'],
    ['nested path', `${PDS_POST}/extra`],
  ])('unknown for %s', (_, uri) => {
    expect(feedPostTarget({uri})).toBeUndefined()
  })

  it('unknown for a malformed post', () => {
    expect(feedPostTarget(null as never)).toBeUndefined()
    expect(feedPostTarget({uri: 42} as never)).toBeUndefined()
  })

  it('flag on: a reply to an ordinary post with its known profile target goes through', () => {
    const res = resolveTarget({
      communitiesEnabled: true,
      parent: {uri: PDS_POST, target: feedPostTarget({uri: PDS_POST})},
    })
    expect(res).toEqual({
      ok: true,
      target: {kind: 'profile'},
      route: 'pds',
      locked: false,
    })
    if (!res.ok) throw new Error('unreachable')
    expect(guardComposerPdsWrite(res.target)).toEqual({allowed: true})
  })

  it('flag on: a runtime-id parent is still refused (no members leak to PDS)', () => {
    expect(
      resolveTarget({
        communitiesEnabled: true,
        parent: {uri: 'cpost_123', target: feedPostTarget({uri: 'cpost_123'})},
      }),
    ).toEqual({ok: false, error: {code: 'unknown-parent-target'}})
  })
})

/*
 * Every `openComposer({replyTo: {...}})` call must pass the parent's target.
 * Without it, every reply is refused when the communities flag is on.
 */
describe('reply openers', () => {
  const SRC = join(__dirname, '..', '..', '..')

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (name === '__tests__' || name === 'node_modules') continue
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p, out)
      else if (/\.tsx?$/.test(name)) out.push(p)
    }
    return out
  }

  const openers = walk(SRC).flatMap(file => {
    const src = readFileSync(file, 'utf8')
    const blocks = [...src.matchAll(/replyTo: \{([^{}]*)\}/g)].map(m => m[1])
    return blocks.map(body => [file.slice(SRC.length + 1), body] as const)
  })

  it('finds the reply openers', () => {
    expect(openers.length).toBeGreaterThanOrEqual(7)
  })

  it.each(openers)('%s passes replyTo.target', (_, body) => {
    expect(body).toMatch(/\btarget:/)
  })
})
