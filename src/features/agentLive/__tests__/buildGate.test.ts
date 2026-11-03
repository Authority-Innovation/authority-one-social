/* eslint-disable import-x/no-nodejs-modules -- Node-side config and source-reading test */
/**
 * Ruling 1: the LiveKit SDK ships only with EXPO_PUBLIC_AGENT_LIVE_ENABLED on
 * (the development-live profile), and nothing imports it at module load.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

import {describe, expect, it, jest} from '@jest/globals'

const mockSdkLoaded = jest.fn()
jest.mock('@livekit/react-native', () => {
  mockSdkLoaded('@livekit/react-native')
  return {
    registerGlobals: () => {},
    AudioSession: {},
    VideoTrack: () => null,
  }
})
jest.mock('livekit-client', () => {
  mockSdkLoaded('livekit-client')
  class Room {
    remoteParticipants = new Map()
    on() {
      return this
    }
  }
  return {Room, RoomEvent: {}, Track: {Kind: {}, Source: {}}}
})

const ROOT = path.resolve(__dirname, '../../../..')
const gate = require(path.join(ROOT, 'plugins/agentLive')) as {
  AGENT_LIVE_FLAG: string
  LIVE_NATIVE_PACKAGES: string[]
  LIVE_JS_MODULE_RE: RegExp
  isAgentLiveEnabled(env: Record<string, string | undefined>): boolean
  agentLivePlugins(env: Record<string, string | undefined>): unknown[]
  agentLiveRNDependencies(
    env: Record<string, string | undefined>,
  ): Record<string, unknown>
  addPodfileExclude(src: string): string
  addSettingsGradleExclude(src: string): string
}

const ON = {EXPO_PUBLIC_AGENT_LIVE_ENABLED: 'true'}

describe('flag values per EAS profile', () => {
  const eas = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8'),
  ) as {build: Record<string, {env?: Record<string, string>}>}
  const profiles = eas.build

  it('only development-live turns it on', () => {
    const on = Object.entries(profiles)
      .filter(([, p]) => p.env?.EXPO_PUBLIC_AGENT_LIVE_ENABLED === 'true')
      .map(([name]) => name)
    expect(on).toEqual(['development-live'])
  })

  it('every profile sets it explicitly; production, preview and testflight are false', () => {
    for (const [, p] of Object.entries(profiles)) {
      expect(['true', 'false']).toContain(p.env?.EXPO_PUBLIC_AGENT_LIVE_ENABLED)
    }
    for (const name of [
      'base',
      'production',
      'production-apk',
      'preview',
      'testflight',
      'testflight-android',
      'development',
      'development-communities',
    ]) {
      expect(profiles[name]?.env?.EXPO_PUBLIC_AGENT_LIVE_ENABLED).toBe('false')
    }
  })
})

describe('native build gate', () => {
  it('only exactly "true" turns it on', () => {
    expect(gate.isAgentLiveEnabled({})).toBe(false)
    expect(gate.isAgentLiveEnabled({EXPO_PUBLIC_AGENT_LIVE_ENABLED: '1'})).toBe(
      false,
    )
    expect(
      gate.isAgentLiveEnabled({EXPO_PUBLIC_AGENT_LIVE_ENABLED: 'TRUE'}),
    ).toBe(false)
    expect(gate.isAgentLiveEnabled(ON)).toBe(true)
  })

  it('off: no LiveKit or WebRTC config plugin, only the exclusion', () => {
    const plugins = JSON.stringify(gate.agentLivePlugins({}))
    expect(plugins).not.toMatch(/livekit|webrtc/i)
    expect(gate.agentLivePlugins({})).toEqual([
      './plugins/agentLive/withAgentLiveExcluded.js',
    ])
  })

  it('on: the LiveKit Expo plugin and the WebRTC config plugin', () => {
    expect(gate.agentLivePlugins(ON)).toEqual([
      '@livekit/react-native-expo-plugin',
      '@config-plugins/react-native-webrtc',
    ])
  })

  it('off: every native LiveKit package is unlinked on both platforms', () => {
    const deps = gate.agentLiveRNDependencies({})
    for (const p of gate.LIVE_NATIVE_PACKAGES) {
      expect(deps[p]).toEqual({platforms: {ios: null, android: null}})
    }
    expect(gate.agentLiveRNDependencies(ON)).toEqual({})
  })

  it('off: the Expo module is excluded in the Podfile and settings.gradle', () => {
    const podfile = gate.addPodfileExclude(
      "target 'App' do\n  use_expo_modules!\n  config = use_native_modules!\nend\n",
    )
    expect(podfile).toContain(
      "  use_expo_modules!(exclude: ['@livekit/react-native', '@livekit/react-native-webrtc', '@livekit/react-native-expo-plugin'])",
    )
    expect(gate.addPodfileExclude(podfile)).toBe(podfile)
    const gradle = gate.addSettingsGradleExclude(
      'expoAutolinking.useExpoModules()\nexpoAutolinking.useExpoVersionCatalog()\n',
    )
    expect(gradle).toMatch(
      /expoAutolinking\.exclude = \[[^\]]*'@livekit\/react-native-expo-plugin'[^\]]*\]\nexpoAutolinking\.useExpoModules\(\)/,
    )
    expect(gate.addSettingsGradleExclude(gradle)).toBe(gradle)
  })

  it('a template without the anchor fails the build rather than linking the SDK', () => {
    expect(() => gate.addPodfileExclude("target 'App' do\nend\n")).toThrow()
    expect(() =>
      gate.addSettingsGradleExclude('rootProject.name = "x"'),
    ).toThrow()
  })

  it('Metro stubs every SDK import, and nothing else', () => {
    for (const m of [
      '@livekit/react-native',
      '@livekit/react-native-webrtc',
      '@livekit/components-react',
      'livekit-client',
      'livekit-client/dist/livekit-client.esm.mjs',
    ]) {
      expect(gate.LIVE_JS_MODULE_RE.test(m)).toBe(true)
    }
    for (const m of [
      '@livekit/react-native-expo-plugin',
      'react-native',
      'livekit',
    ]) {
      expect(gate.LIVE_JS_MODULE_RE.test(m)).toBe(false)
    }
  })
})

describe('no SDK import at module load', () => {
  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, {withFileTypes: true}).flatMap(e => {
      const p = path.join(dir, e.name)
      if (e.isDirectory())
        return e.name === 'node_modules' ? [] : sourceFiles(p)
      return /\.(ts|tsx|js|jsx)$/.test(e.name) ? [p] : []
    })
  }

  it('only the binding imports LiveKit, and only a dynamic import reaches it', () => {
    const SDK =
      /from\s+['"](@livekit\/[^'"]+|livekit-client)['"]|require\(\s*['"](@livekit\/|livekit-client)/
    const importers = sourceFiles(path.join(ROOT, 'src'))
      .filter(f => !f.includes('__tests__'))
      .filter(f => SDK.test(fs.readFileSync(f, 'utf8')))
      .map(f => path.relative(ROOT, f).split(path.sep).join('/'))
    expect(importers).toEqual(['src/features/agentLive/room/livekit.tsx'])

    const STATIC_BINDING =
      /(from|require\()\s*['"](\.\/livekit|#\/features\/agentLive\/room\/livekit)['"]/
    const staticBindingImporters = sourceFiles(path.join(ROOT, 'src'))
      .filter(f => !f.includes('__tests__'))
      .filter(f => STATIC_BINDING.test(fs.readFileSync(f, 'utf8')))
    expect(staticBindingImporters).toEqual([])
  })

  it('loading the room module evaluates no SDK; the binding behind its dynamic import does', () => {
    mockSdkLoaded.mockClear()
    jest.isolateModules(() => {
      require('../room')
      require('../session')
    })
    expect(mockSdkLoaded).not.toHaveBeenCalled()

    // The loader reaches the binding only through import() (jest here can't
    // run import() without --experimental-vm-modules, so the control creates
    // a room from the binding directly).
    const loader = fs.readFileSync(
      path.join(ROOT, 'src/features/agentLive/room/index.ts'),
      'utf8',
    )
    expect(loader).toContain("await import('./livekit')")
    jest.isolateModules(() => {
      const {createLiveKitRoom} = require('../room/livekit') as {
        createLiveKitRoom: (args: {sid: string}) => unknown
      }
      createLiveKitRoom({sid: 'ls_01JBX8M4Q2T7V9WZ3K5N6P8R0S'})
    })
    expect(mockSdkLoaded).toHaveBeenCalledWith('@livekit/react-native')
    expect(mockSdkLoaded).toHaveBeenCalledWith('livekit-client')
  })
})
