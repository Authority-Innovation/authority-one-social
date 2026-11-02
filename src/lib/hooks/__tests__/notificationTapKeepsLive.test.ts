/* eslint-disable import-x/no-nodejs-modules -- reads the tap sites' source */
/**
 * Dispatch ruling on review c23bdc031 F1 (review 27020b222 F13): a
 * notification tap never ends Agent Live, so every account switch a tap
 * starts passes 'Notification', which useAccountSwitcher turns into
 * {keepLive: true}. Read from the source: these handlers need the whole
 * navigation and notification stack to render.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

import {describe, expect, it} from '@jest/globals'

const SITES = ['src/lib/hooks/useNotificationHandler.ts', 'src/Navigation.tsx']

describe('a notification tap that switches account keeps Live', () => {
  it.each(SITES)(
    '%s: every onPressSwitchAccount call passes Notification',
    file => {
      const src = fs.readFileSync(
        path.join(__dirname, '../../../..', file),
        'utf8',
      )
      const calls = [...src.matchAll(/onPressSwitchAccount\(([^)]*)\)/g)].map(
        m => m[1],
      )
      expect(calls.length).toBeGreaterThan(0)
      for (const args of calls) expect(args).toMatch(/,\s*'Notification'\s*$/)
    },
  )
})
