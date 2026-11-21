import {beforeEach, describe, expect, it} from '@jest/globals'

import {type PhotoContextConclusion} from '#/lib/photoContext/types'
import {
  adoptLegacyPhotoData,
  DEFAULT_PHOTO_PREFS,
  loadLastConclusion,
  loadPhotoPrefs,
  saveLastConclusion,
  savePhotoPrefs,
} from '../store'

// SOC-01: Photo Context opt-in and conclusions must be partitioned per account.

const mockStore = new Map<string, string>()
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (k: string) =>
      Promise.resolve(mockStore.has(k) ? mockStore.get(k)! : null),
    setItem: (k: string, v: string) => {
      mockStore.set(k, v)
      return Promise.resolve()
    },
    removeItem: (k: string) => {
      mockStore.delete(k)
      return Promise.resolve()
    },
  },
}))

const DID_A = 'did:plc:testaccounta'
const DID_B = 'did:plc:testaccountb'

const conclusion = {id: 'c1', count: 3} as PhotoContextConclusion

beforeEach(() => {
  mockStore.clear()
})

describe('SOC-01 photo context store is per-account', () => {
  it('account B does not inherit account A opt-in or last conclusion', async () => {
    await savePhotoPrefs(DID_A, {enabled: true})
    await saveLastConclusion(DID_A, conclusion)
    expect((await loadPhotoPrefs(DID_A)).enabled).toBe(true)
    expect((await loadLastConclusion(DID_A))?.id).toBe('c1')
    expect(await loadPhotoPrefs(DID_B)).toEqual(DEFAULT_PHOTO_PREFS)
    expect(await loadLastConclusion(DID_B)).toBeNull()
  })

  it('with no signed-in account nothing is read or written', async () => {
    await savePhotoPrefs(undefined, {enabled: true})
    await saveLastConclusion(undefined, conclusion)
    expect(await loadPhotoPrefs(undefined)).toEqual(DEFAULT_PHOTO_PREFS)
    expect(await loadLastConclusion(undefined)).toBeNull()
    expect(mockStore.size).toBe(0)
  })

  it('legacy device-wide data is adopted once by the first account, then removed', async () => {
    mockStore.set(
      '@authorityOne/photoContext/prefs',
      JSON.stringify({enabled: true}),
    )
    await adoptLegacyPhotoData(DID_A)
    expect((await loadPhotoPrefs(DID_A)).enabled).toBe(true)
    expect(mockStore.has('@authorityOne/photoContext/prefs')).toBe(false)
    await adoptLegacyPhotoData(DID_B)
    expect(await loadPhotoPrefs(DID_B)).toEqual(DEFAULT_PHOTO_PREFS)
  })
})
