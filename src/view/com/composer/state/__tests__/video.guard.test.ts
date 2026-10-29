/**
 * processVideo is the bsky video upload the Composer starts from selectVideo
 * and when restoring a draft's video. The video service writes the blob into
 * the PDS, so a members/paid target must be refused before compression or
 * upload, whichever Composer path called it.
 */
import {type ImagePickerAsset} from 'expo-image-picker'
import {type BskyAgent} from '@atproto/api'
import {beforeEach, describe, expect, it, jest} from '@jest/globals'
import {setupI18n} from '@lingui/core'

jest.mock('#/lib/media/video/compress', () => ({
  compressVideo: jest.fn(() =>
    Promise.resolve({uri: 'file:///tmp/v.mp4', size: 10, mimeType: 'video/mp4'}),
  ),
}))
jest.mock('#/lib/media/video/upload', () => ({
  uploadVideo: jest.fn(() => Promise.reject(new Error('stop after upload'))),
}))
jest.mock('#/lib/media/video/util', () => ({
  createVideoAgent: jest.fn(),
}))
jest.mock('#/logger', () => ({
  logger: {debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn()},
}))

import {type ComposerTarget} from '#/lib/communities/composerTarget'
import {compressVideo} from '#/lib/media/video/compress'
import {uploadVideo} from '#/lib/media/video/upload'
import {processVideo} from '#/view/com/composer/state/video'

const i18n = setupI18n({locale: 'en', messages: {en: {}}})
const asset = {uri: 'file:///tmp/v.mov'} as ImagePickerAsset
const agent = {
  uploadBlob: jest.fn(),
  com: {atproto: {repo: {uploadBlob: jest.fn(), applyWrites: jest.fn()}}},
} as unknown as BskyAgent & {
  uploadBlob: jest.Mock
  com: {atproto: {repo: {uploadBlob: jest.Mock; applyWrites: jest.Mock}}}
}

function run(target: ComposerTarget) {
  const dispatch = jest.fn()
  const signal = new AbortController().signal
  return processVideo(
    asset,
    dispatch,
    agent,
    'did:plc:me',
    signal,
    i18n,
    target,
  ).then(() => dispatch)
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('processVideo guard', () => {
  it.each<[string, ComposerTarget]>([
    ['members', {kind: 'community', id: 'c1', tier: 'members'}],
    ['paid', {kind: 'community', id: 'c1', tier: 'paid'}],
    // No binding on a video upload, so public is refused (the bound
    // applyWrites is the only public PDS write).
    ['public community', {kind: 'community', id: 'c1', tier: 'public'}],
  ])('a %s target never compresses or uploads', async (_name, target) => {
    const dispatch = await run(target)
    expect(compressVideo).not.toHaveBeenCalled()
    expect(uploadVideo).not.toHaveBeenCalled()
    expect(agent.uploadBlob).not.toHaveBeenCalled()
    expect(agent.com.atproto.repo.uploadBlob).not.toHaveBeenCalled()
    expect(agent.com.atproto.repo.applyWrites).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({type: 'to_error'}),
    )
  })

  it.each<[string, ComposerTarget]>([
    ['profile', {kind: 'profile'}],
  ])('a %s target still uploads (control)', async (_name, target) => {
    await run(target)
    expect(compressVideo).toHaveBeenCalledTimes(1)
    expect(uploadVideo).toHaveBeenCalledTimes(1)
  })
})
