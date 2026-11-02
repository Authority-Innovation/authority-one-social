/* eslint-disable import-x/no-nodejs-modules -- reads the dialog's source */
/**
 * Dispatch ruling on review 784dbc925 F21: deleting the account is a
 * sign-out, so a held Agent Live session is ended first, while the
 * account's bearer still works. Read from the source: the dialog needs the
 * whole session and email stack to render.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

import {describe, expect, it} from '@jest/globals'

const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'DeleteAccountDialog.tsx'),
  'utf8',
)

describe('deleting the account ends Agent Live first', () => {
  it('awaits the end (bounded) before the server deleteAccount (3b593301c F21)', () => {
    const end = SRC.search(
      /await endOpenLiveSessionsAndWait\(\s*LIVE_END_BEFORE_DELETE_MS,?\s*\)/,
    )
    const del = SRC.indexOf('agent.com.atproto.server.deleteAccount(')
    expect(end).toBeGreaterThan(-1)
    expect(del).toBeGreaterThan(-1)
    expect(end).toBeLessThan(del)
  })

  it('logs when the bound expires, before the delete goes ahead (r392 L7)', () => {
    const timedOut = SRC.indexOf("if (liveEnd === 'timed_out')")
    const warn = SRC.search(
      /logger\.warn\(\s*'agentLive: account delete went ahead with \/end unsettled'/,
    )
    const del = SRC.indexOf('agent.com.atproto.server.deleteAccount(')
    expect(timedOut).toBeGreaterThan(-1)
    expect(warn).toBeGreaterThan(timedOut)
    expect(warn).toBeLessThan(del)
  })

  it('uses the shared bound, not a local copy (r392 L10)', () => {
    expect(SRC).not.toMatch(/const LIVE_END_BEFORE_DELETE_MS\s*=/)
    expect(SRC).toMatch(
      /LIVE_END_BEFORE_DELETE_MS,?\s*\n?\s*\}? from '#\/features\/agentLive\/registry'/,
    )
  })
})
