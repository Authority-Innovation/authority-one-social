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
  it('calls endOpenLiveSessions before the server deleteAccount', () => {
    const end = SRC.indexOf('endOpenLiveSessions()')
    const del = SRC.indexOf('agent.com.atproto.server.deleteAccount(')
    expect(end).toBeGreaterThan(-1)
    expect(del).toBeGreaterThan(-1)
    expect(end).toBeLessThan(del)
  })
})
