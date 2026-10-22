/* eslint-disable import-x/no-nodejs-modules -- Node-side source-reading test */
import {readFileSync} from 'node:fs'
import path from 'node:path'

import {describe, expect, it} from '@jest/globals'

// BATTERY (2026-10-23): background location held a 48 h iOS location subscription.
// The shipped build must carry no background-location capability on iOS or Android.
const root = path.resolve(__dirname, '../../../..')
const config = readFileSync(path.join(root, 'app.config.js'), 'utf8')
const nativeController = readFileSync(
  path.join(root, 'src/state/contextEngine/backgroundLocation.native.ts'),
  'utf8',
)

describe('no background location in the shipped build', () => {
  it('iOS: no "location" UIBackgroundMode and no Always usage string', () => {
    const modes = config.match(/UIBackgroundModes:\s*\[([^\]]*)\]/)
    expect(modes).not.toBeNull()
    expect(modes![1]).not.toMatch(/location/)
    expect(config).not.toMatch(/NSLocationAlwaysAndWhenInUseUsageDescription/)
    expect(config).not.toMatch(/locationAlwaysAndWhenInUsePermission/)
  })

  it('expo-location plugin: background location disabled on iOS and Android', () => {
    expect(config).toMatch(/isIosBackgroundLocationEnabled:\s*false/)
    expect(config).toMatch(/isAndroidBackgroundLocationEnabled:\s*false/)
    expect(config).not.toMatch(/isIosBackgroundLocationEnabled:\s*true/)
    expect(config).not.toMatch(/isAndroidBackgroundLocationEnabled:\s*true/)
  })

  it('native controller: unsupported, never starts, and a queued wake stops updates', () => {
    expect(nativeController).toMatch(/export function backgroundLocationSupported\(\): boolean \{\n\s+return BACKGROUND_LOCATION_SHIPPED\n\}/)
    expect(nativeController).toMatch(/export async function startBackgroundUpdates\(\): Promise<boolean> \{\n\s+if \(!BACKGROUND_LOCATION_SHIPPED\) return false/)
    expect(nativeController).toMatch(/if \(!BACKGROUND_LOCATION_SHIPPED\) \{\n\s+await Location\.stopLocationUpdatesAsync\(BACKGROUND_LOCATION_TASK\)/)
  })
})
