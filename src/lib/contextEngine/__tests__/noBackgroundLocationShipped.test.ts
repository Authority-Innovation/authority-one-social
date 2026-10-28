/* eslint-disable import-x/no-nodejs-modules -- Node-side source-reading test */
import {readFileSync} from 'node:fs'
import path from 'node:path'

import {describe, expect, it} from '@jest/globals'

import {BACKGROUND_LOCATION_SHIPPED, backgroundMigration} from '../derive'

// BATTERY (2026-10-23): background location held a 48 h iOS location subscription.
// TWO-STEP REMOVAL. This release: code never starts background updates and, in the
// FOREGROUND only, stops any task restored from an older build; the native background capability STAYS so that a
// natively restored task doesn't crash on launch (expo-task-manager restores it before
// any JS). The next release removes the capability.
const root = path.resolve(__dirname, '../../../..')
const read = (p: string) => readFileSync(path.join(root, p), 'utf8')
const config = read('app.config.js')
const controller = read('src/state/contextEngine/backgroundLocation.native.ts')
const provider = read('src/state/contextEngine/ContextEngineProvider.tsx')

describe('background location: off in code, capability kept one release', () => {
  it('nothing ships background capture', () => {
    expect(BACKGROUND_LOCATION_SHIPPED).toBe(false)
    expect(backgroundMigration({backgroundEnabled: true})).toEqual({
      stopUpdates: true,
      clearPref: true,
    })
  })

  it('crash safety: the iOS location background mode is still declared this release', () => {
    const modes = config.match(/UIBackgroundModes:\s*\[([^\]]*)\]/)
    expect(modes).not.toBeNull()
    expect(modes![1]).toMatch(/'location'/)
  })

  it('the native controller refuses to start, reports unsupported, and a background wake does nothing', () => {
    expect(controller).toContain('return BACKGROUND_LOCATION_SHIPPED')
    expect(controller).toContain(
      'if (!BACKGROUND_LOCATION_SHIPPED) return false',
    )
    // Build 33 crash: the task callback unregistered its own task mid-execution.
    expect(controller).toContain('if (!BACKGROUND_LOCATION_SHIPPED) return\n')
    const task = controller
      .slice(
        controller.indexOf('TaskManager.defineTask('),
        controller.indexOf('export function backgroundLocationSupported'),
      )
      .replace(/^\s*\/\/.*$/gm, '') // code only, not the explanatory comments
    expect(task).not.toMatch(/stopLocationUpdatesAsync|unregisterTask/)
  })

  it('launch stops any restored task in the FOREGROUND only, and clears the pref', () => {
    expect(provider).toContain('const mig = backgroundMigration(p)')
    expect(provider).toContain(
      'return runOnceWhenForeground(stopRestoredBackgroundUpdatesOnce)',
    )
    expect(provider).not.toContain('void stopBackgroundUpdates()')
  })
})
