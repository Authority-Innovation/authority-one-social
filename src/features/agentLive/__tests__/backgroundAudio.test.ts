/* eslint-disable import-x/no-nodejs-modules -- Node-side config test */
/**
 * A live voice session must survive the phone locking: the development-live
 * build declares the iOS 'audio' background mode, and the session stays in
 * playAndRecord in every engine state. Other builds are unchanged.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

import {afterEach, describe, expect, it, jest} from '@jest/globals'

import {LIVE_IOS_AUDIO_POLICY} from '../room/audioSession'

const mockRegisterGlobals = jest.fn()
const mockSetupIOSAudioManagement = jest.fn(() => () => {})
jest.mock('@livekit/react-native', () => ({
  registerGlobals: mockRegisterGlobals,
  setupIOSAudioManagement: mockSetupIOSAudioManagement,
  AudioSession: {},
  VideoTrack: () => null,
}))
jest.mock('livekit-client', () => {
  class Room {
    remoteParticipants = new Map()
    on() {
      return this
    }
  }
  return {Room, RoomEvent: {}, Track: {Kind: {}, Source: {}}}
})

const ROOT = path.resolve(__dirname, '../../../..')
type InfoPlist = {UIBackgroundModes?: string[]}
type ExpoConfig = {ios: {infoPlist: InfoPlist}; plugins: unknown[]}
const appConfig = require(path.join(ROOT, 'app.config.js')) as () => {
  expo: ExpoConfig
}
const eas = (
  JSON.parse(fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8')) as {
    build: Record<string, {env?: Record<string, string>}>
  }
).build

const savedEnv = {...process.env}
afterEach(() => {
  process.env = {...savedEnv}
})

/**
 * Evaluates app.config.js under an EAS profile's env, then applies the
 * plugins/agentLive config plugins it lists (the ones that touch the static
 * ios.infoPlist), as prebuild would before writing Info.plist.
 */
function iosInfoPlistFor(profile: string): InfoPlist {
  const env = eas[profile]?.env
  if (!env) throw new Error(`no env for EAS profile ${profile}`)
  process.env = {...savedEnv, ...env, EAS_BUILD_PLATFORM: 'ios'}
  let config = appConfig().expo
  for (const entry of config.plugins) {
    if (
      typeof entry === 'string' &&
      entry.startsWith('./plugins/agentLive/withAgentLiveBackgroundAudio')
    ) {
      const plugin = require(path.join(ROOT, entry)) as (
        c: ExpoConfig,
      ) => ExpoConfig
      config = plugin(config)
    }
  }
  return config.ios.infoPlist
}

describe('iOS background modes', () => {
  it('development-live declares audio, and keeps remote-notification and location', () => {
    const modes = iosInfoPlistFor('development-live').UIBackgroundModes
    expect(modes).toEqual(['remote-notification', 'location', 'audio'])
  })

  it('development-live does not declare voip (no PushKit or CallKit)', () => {
    expect(iosInfoPlistFor('development-live').UIBackgroundModes).not.toContain(
      'voip',
    )
  })

  it.each(['production', 'testflight', 'preview', 'development'])(
    '%s is unchanged: no audio mode',
    profile => {
      expect(iosInfoPlistFor(profile).UIBackgroundModes).toEqual([
        'remote-notification',
        'location',
      ])
    },
  )

  it('adding the mode is idempotent and keeps existing modes', () => {
    const gate = require(path.join(ROOT, 'plugins/agentLive')) as {
      addBackgroundAudioMode(p: InfoPlist): InfoPlist
    }
    const once = gate.addBackgroundAudioMode({UIBackgroundModes: ['location']})
    expect(once.UIBackgroundModes).toEqual(['location', 'audio'])
    expect(gate.addBackgroundAudioMode(once)).toEqual(once)
    expect(gate.addBackgroundAudioMode({}).UIBackgroundModes).toEqual(['audio'])
  })
})

describe('iOS audio session', () => {
  it('is playAndRecord in every engine state', () => {
    expect(LIVE_IOS_AUDIO_POLICY.recording.audioCategory).toBe('playAndRecord')
    expect(
      LIVE_IOS_AUDIO_POLICY.recordingWithoutVoiceProcessing.audioCategory,
    ).toBe('playAndRecord')
    expect(LIVE_IOS_AUDIO_POLICY.playout.audioCategory).toBe('playAndRecord')
    expect(LIVE_IOS_AUDIO_POLICY.recording.audioMode).toBe('videoChat')
    expect(LIVE_IOS_AUDIO_POLICY.deactivateOnStop).toBe(true)
  })

  it('is a primary session (does not mix with other apps)', () => {
    for (const c of [
      LIVE_IOS_AUDIO_POLICY.recording,
      LIVE_IOS_AUDIO_POLICY.recordingWithoutVoiceProcessing,
      LIVE_IOS_AUDIO_POLICY.playout,
    ]) {
      expect(c.audioCategoryOptions).not.toContain('mixWithOthers')
      expect(c.audioCategoryOptions).toContain('allowBluetooth')
    }
  })

  it('the binding installs this policy instead of the SDK default', () => {
    jest.isolateModules(() => {
      const {createLiveKitRoom} = require('../room/livekit') as {
        createLiveKitRoom: (args: {sid: string}) => unknown
      }
      createLiveKitRoom({sid: 'ls_01JBX8M4Q2T7V9WZ3K5N6P8R0S'})
    })
    expect(mockRegisterGlobals).toHaveBeenCalledWith({
      autoConfigureAudioSession: false,
    })
    expect(mockSetupIOSAudioManagement).toHaveBeenCalledWith(
      true,
      LIVE_IOS_AUDIO_POLICY,
    )
  })
})
