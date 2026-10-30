/**
 * Ruling 2: the blind wire format is exactly
 * {"t":"blind","on":true|false,"src":"*"|"<sourceId>"}.
 */
import {describe, expect, it} from '@jest/globals'

import {
  ALL_SOURCES,
  BLIND_TOPIC,
  blindMessage,
  encodeBlindMessage,
} from '../blind'

const decode = (b: Uint8Array) => new TextDecoder().decode(b)

describe('blind wire format (ruling 2)', () => {
  it('blind on, all sources: exact bytes', () => {
    expect(decode(encodeBlindMessage(blindMessage(true)!))).toBe(
      '{"t":"blind","on":true,"src":"*"}',
    )
  })

  it('blind off, all sources: exact bytes', () => {
    expect(decode(encodeBlindMessage(blindMessage(false, ALL_SOURCES)!))).toBe(
      '{"t":"blind","on":false,"src":"*"}',
    )
  })

  it('one source: exact bytes', () => {
    expect(decode(encodeBlindMessage(blindMessage(true, 'screen_share')!))).toBe(
      '{"t":"blind","on":true,"src":"screen_share"}',
    )
  })

  it('carries exactly t, on, src: no identity of any kind', () => {
    const parsed = JSON.parse(decode(encodeBlindMessage(blindMessage(true)!)))
    expect(Object.keys(parsed)).toEqual(['t', 'on', 'src'])
  })

  it('refuses a source id that is not one', () => {
    expect(blindMessage(true, '')).toBeNull()
    expect(blindMessage(true, '* ')).toBeNull()
    expect(blindMessage(true, 'a b')).toBeNull()
    expect(blindMessage(true, 'x'.repeat(129))).toBeNull()
    expect(blindMessage('yes' as unknown as boolean)).toBeNull()
  })

  it('goes on the owner stage topic', () => {
    expect(BLIND_TOPIC).toBe('stage.reply')
  })
})
