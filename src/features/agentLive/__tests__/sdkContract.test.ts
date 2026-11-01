/* eslint-disable import-x/no-nodejs-modules -- reads the installed SDK source */
/**
 * Tripwires on the installed livekit-client, for the join gate (runtime
 * design AGENT-LIVE-JOIN-GATE-REVISED @ adeeadb, R1/R2). The app relies on
 * two SDK behaviours it does not implement itself; if an upgrade changes
 * either, these fail and the app needs its own handling.
 *
 * 1. `/rtc/v1` answering 404 (the edge does, before any `join_request`): the
 *    SDK turns the 404 from `/rtc/v1/validate` into ServiceNotFound and
 *    retries the same join on `/rtc` (the v0 path).
 * 2. A reconnect policy that returns null stops every retry and reports the
 *    loss as Disconnected at once (room/livekit.tsx NO_SDK_RECONNECT), so the
 *    session's full rejoin is the only reconnect.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

import {describe, expect, it} from '@jest/globals'

// The package's exports map hides package.json; read it from the install.
const PKG = path.join(__dirname, '../../../../node_modules/livekit-client')
const SDK = fs.readFileSync(
  path.join(PKG, 'dist/livekit-client.esm.mjs'),
  'utf8',
)
const VERSION = (
  JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8')) as {
    version: string
  }
).version

describe('livekit-client behaviours the join gate relies on', () => {
  it('is the pinned version these were read from', () => {
    expect(VERSION).toBe('2.23.0')
  })

  it('a /rtc/v1 404 becomes ServiceNotFound, unless it says the room does not exist', () => {
    expect(SDK).toMatch(
      /case 404:[\s\S]{0,200}requested room does not exist[\s\S]{0,200}ConnectionError\.notAllowed[\s\S]{0,200}ConnectionError\.serviceNotFound\([^)]*'v0-rtc'\)/,
    )
  })

  it('ServiceNotFound retries the same join on the v0 path (/rtc)', () => {
    expect(SDK).toMatch(
      /e\.reason === ConnectionErrorReason\.ServiceNotFound\)[\s\S]{0,400}return _this2\.join\(url, token, opts, abortSignal, true\)/,
    )
  })

  it('a null retry delay gives up at once and emits Disconnected', () => {
    expect(SDK).toMatch(
      /let delay = this\.getNextRetryDelay\([\s\S]{0,120}if \(delay === null\) \{\s*disconnect\(duration\);/,
    )
    expect(SDK).toMatch(
      /const disconnect = duration => \{[\s\S]{0,200}this\.emit\(EngineEvent\.Disconnected\)/,
    )
  })
})
