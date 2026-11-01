/* eslint-disable import-x/no-nodejs-modules -- reads state/session's source */
/**
 * Review 679a9d48 H2 item 4: signing out or switching account starts ending
 * every open live session FIRST, while that account's bearer is still
 * current (features/agentLive/registry.ts). Read from the source, because
 * state/session has no provider harness: in each entry point the call comes
 * before anything that cancels, dispatches or creates the next session.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

import {describe, expect, it} from '@jest/globals'

const SRC = fs.readFileSync(
  path.join(__dirname, '../../../state/session/index.tsx'),
  'utf8',
)

/** The body of `const <name> = useCallback<...>(` up to its deps array. */
function body(name: string): string {
  const start = SRC.indexOf(`const ${name} = useCallback`)
  expect(start).toBeGreaterThan(-1)
  const end = SRC.indexOf('\n  )\n', start)
  return SRC.slice(start, end)
}

describe('sign-out and account switch end open live sessions first', () => {
  it('imports the registry hook', () => {
    expect(SRC).toMatch(
      /import \{endOpenLiveSessions\} from '#\/features\/agentLive\/registry'/,
    )
  })

  it('login calls it only after the new credentials worked, before the switch (f2caccaa F7)', () => {
    const b = body('login')
    const call = b.indexOf('endOpenLiveSessions()')
    expect(call).toBeGreaterThan(b.indexOf('createAgentAndLogin('))
    expect(call).toBeGreaterThan(b.indexOf('if (signal.aborted)'))
    expect(call).toBeLessThan(b.indexOf("type: 'switched-to-account'"))
  })

  it.each(['logoutCurrentAccount', 'logoutEveryAccount'])(
    '%s calls it before cancelling or dispatching',
    name => {
      const b = body(name)
      const call = b.indexOf('endOpenLiveSessions()')
      expect(call).toBeGreaterThan(-1)
      for (const later of [
        'cancelPendingTask()',
        'store.dispatch(',
        'createAgentAndLogin(',
      ]) {
        const i = b.indexOf(later)
        if (i > -1) expect(call).toBeLessThan(i)
      }
    },
  )

  it('resumeSession calls it on an account switch only, before resuming', () => {
    const b = body('resumeSession')
    const call = b.indexOf('endOpenLiveSessions()')
    expect(call).toBeGreaterThan(-1)
    expect(b.slice(0, call)).toMatch(/if \(isSwitchingAccounts\) \{[^}]*$/)
    expect(call).toBeLessThan(b.indexOf('createAgentAndResume('))
  })

  it('the registry pulls in nothing (no Live client in state/session)', () => {
    const reg = fs.readFileSync(path.join(__dirname, '../registry.ts'), 'utf8')
    expect(reg).not.toMatch(/^import /m)
  })
})
