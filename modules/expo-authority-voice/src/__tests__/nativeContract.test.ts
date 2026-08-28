/**
 * Verifies the JS wrapper contract that BOTH native modules must satisfy:
 *   - iOS   (Swift): AuthoritySpeechModule / AuthorityTtsModule
 *   - Android (Kotlin): expo.modules.authorityvoice.stt/tts.*
 *
 * We inject a fake native module through `requireNativeModule` and drive `Platform.OS`, then
 * assert the TS wrappers in `index.native.ts` (1) resolve the native module on Android (the
 * parity change) as well as iOS, (2) delegate every call with the right arguments, and (3)
 * degrade to no-ops when the native module is missing/unlinked. This is exactly the surface
 * the Kotlin implementation exposes, so keeping it green guards the JS<->native seam on both
 * platforms without needing a device.
 */
import {type SpeechModule} from '../STT/types'
import {type TtsModule} from '../TTS/types'

interface FakeTts {
  getVoices: jest.Mock
  speak: jest.Mock
  playClip: jest.Mock
  stop: jest.Mock
  pause: jest.Mock
  resume: jest.Mock
  addListener: jest.Mock
  remove: jest.Mock
}

interface FakeStt {
  getCapabilities: jest.Mock
  requestPermissions: jest.Mock
  start: jest.Mock
  stop: jest.Mock
  addListener: jest.Mock
  remove: jest.Mock
}

function makeFakeTts(): FakeTts {
  const remove = jest.fn()
  return {
    getVoices: jest.fn(() => [
      {id: 'v1', name: 'Voice One', language: 'en-US'},
    ]),
    speak: jest.fn(),
    playClip: jest.fn(),
    stop: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    addListener: jest.fn(() => ({remove})),
    remove,
  }
}

function makeFakeStt(): FakeStt {
  const remove = jest.fn()
  return {
    getCapabilities: jest.fn(() => ({
      backend: 'androidSpeechRecognizer',
      available: true,
      supportsPartialResults: true,
      osVersion: '14',
    })),
    requestPermissions: jest.fn(() => Promise.resolve(true)),
    start: jest.fn(),
    stop: jest.fn(),
    addListener: jest.fn(() => ({remove})),
    remove,
  }
}

/**
 * Load a fresh copy of a module under a chosen platform + injected native module.
 * `native === undefined` simulates the module being unlinked (requireNativeModule returns
 * undefined); `throwOnRequire` simulates it throwing at import time.
 */
function loadNative<T>(
  which: 'TTS' | 'STT',
  opts: {os: string; native?: unknown; throwOnRequire?: boolean},
): T {
  let loaded: unknown
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({
      Platform: {OS: opts.os, Version: '14'},
    }))
    jest.doMock('expo-modules-core', () => ({
      requireNativeModule: () => {
        if (opts.throwOnRequire) throw new Error('native module not found')
        return opts.native
      },
    }))
    loaded = require(`../${which}/index.native`)
  })
  return loaded as T
}

const loadTts = (opts: {
  os: string
  native?: unknown
  throwOnRequire?: boolean
}) => loadNative<{TTS: TtsModule}>('TTS', opts).TTS

const loadStt = (opts: {
  os: string
  native?: unknown
  throwOnRequire?: boolean
}) => loadNative<{STT: SpeechModule}>('STT', opts).STT

afterEach(() => {
  jest.resetModules()
  jest.restoreAllMocks()
})

describe('TTS native wrapper contract', () => {
  for (const os of ['ios', 'android']) {
    describe(`on ${os}`, () => {
      it('resolves the native module and delegates speak/playClip with a generated id', () => {
        const fake = makeFakeTts()
        const TTS = loadTts({os, native: fake})

        const id = TTS.speak('hello', {localeId: 'en-US', voiceId: 'v1'})
        expect(id).toMatch(/^utt_/)
        expect(fake.speak).toHaveBeenCalledWith('hello', id, {
          localeId: 'en-US',
          voiceId: 'v1',
        })

        const clipId = TTS.playClip('QUJD', {localeId: 'en-US'})
        expect(clipId).toMatch(/^utt_/)
        expect(clipId).not.toBe(id) // ids are unique per call
        expect(fake.playClip).toHaveBeenCalledWith('QUJD', clipId, {
          localeId: 'en-US',
        })
      })

      it('passes null options through when none are given', () => {
        const fake = makeFakeTts()
        const TTS = loadTts({os, native: fake})
        const id = TTS.speak('hi')
        expect(fake.speak).toHaveBeenCalledWith('hi', id, null)
      })

      it('delegates stop/pause/resume/getVoices', () => {
        const fake = makeFakeTts()
        const TTS = loadTts({os, native: fake})
        TTS.stop()
        TTS.pause()
        TTS.resume()
        expect(fake.stop).toHaveBeenCalledTimes(1)
        expect(fake.pause).toHaveBeenCalledTimes(1)
        expect(fake.resume).toHaveBeenCalledTimes(1)
        expect(TTS.getVoices()).toEqual([
          {id: 'v1', name: 'Voice One', language: 'en-US'},
        ])
      })

      it('addListener returns an unsubscribe that calls remove()', () => {
        const fake = makeFakeTts()
        const TTS = loadTts({os, native: fake})
        const listener = jest.fn()
        const off = TTS.addListener('onSpeechStart', listener)
        expect(fake.addListener).toHaveBeenCalledWith('onSpeechStart', listener)
        off()
        expect(fake.remove).toHaveBeenCalledTimes(1)
      })
    })
  }

  it('degrades to a no-op when the native module is unlinked (returns undefined)', () => {
    const TTS = loadTts({os: 'android', native: undefined})
    expect(() => TTS.speak('x')).not.toThrow()
    expect(TTS.speak('x')).toMatch(/^utt_/) // still returns an id, just does nothing
    expect(TTS.getVoices()).toEqual([])
    expect(() => TTS.stop()).not.toThrow()
    expect(TTS.addListener('onSpeechDone', jest.fn())()).toBeUndefined()
  })

  it('degrades to a no-op when requireNativeModule throws', () => {
    const TTS = loadTts({os: 'android', throwOnRequire: true})
    expect(() => TTS.speak('x')).not.toThrow()
    expect(TTS.getVoices()).toEqual([])
  })
})

describe('STT native wrapper contract', () => {
  for (const os of ['ios', 'android']) {
    describe(`on ${os}`, () => {
      it('delegates getCapabilities/requestPermissions/start/stop', async () => {
        const fake = makeFakeStt()
        const STT = loadStt({os, native: fake})

        expect(STT.getCapabilities().available).toBe(true)
        expect(fake.getCapabilities).toHaveBeenCalled()

        await expect(STT.requestPermissions()).resolves.toBe(true)

        STT.start('en-GB')
        expect(fake.start).toHaveBeenCalledWith('en-GB')

        STT.start() // default locale
        expect(fake.start).toHaveBeenCalledWith('en-US')

        STT.stop()
        expect(fake.stop).toHaveBeenCalledTimes(1)
      })

      it('addListener returns an unsubscribe that calls remove()', () => {
        const fake = makeFakeStt()
        const STT = loadStt({os, native: fake})
        const off = STT.addListener('onPartialTranscript', jest.fn())
        off()
        expect(fake.remove).toHaveBeenCalledTimes(1)
      })
    })
  }

  it('reports unavailable and denies permission when the native module is unlinked', async () => {
    const STT = loadStt({os: 'android', native: undefined})
    const caps = STT.getCapabilities()
    expect(caps.available).toBe(false)
    expect(caps.backend).toBe('unavailable')
    await expect(STT.requestPermissions()).resolves.toBe(false)
    expect(() => STT.start('en-US')).not.toThrow()
    expect(() => STT.stop()).not.toThrow()
  })
})
