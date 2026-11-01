/**
 * The One app's rejoin rule is the runtime workers' rule
 * (live-agent/src/rejoin.js, feat/agent-live-r2-workers-v2 @ 9fc23bd): the same
 * backoff and the same FINAL reasons. Change both together.
 */
import {describe, expect, it, jest} from '@jest/globals'

import {
  disconnectReasonOf,
  FINAL_REASONS,
  isFinal,
  LIVEKIT_DEPARTURE_TIMEOUT_S,
  reasonName,
  REJOIN_BACKOFF_MS,
} from '../rejoin'

// The real protocol enum (livekit-client's DisconnectReason), numbers and names.
const DisconnectReason = jest.requireActual<{
  DisconnectReason: Record<string, number> & Record<number, string>
}>('@livekit/protocol').DisconnectReason
const ENUM = DisconnectReason as Record<number, string>

describe('the runtime workers’ rule (R2 rev 4, 9fc23bd)', () => {
  it('backoff 1, 2, 4, 8, 16 s: 31 s, longer than LiveKit’s 30 s departure timeout', () => {
    expect(REJOIN_BACKOFF_MS).toEqual([1000, 2000, 4000, 8000, 16000])
    expect(REJOIN_BACKOFF_MS.reduce((a, b) => a + b, 0) / 1000).toBeGreaterThan(
      LIVEKIT_DEPARTURE_TIMEOUT_S,
    )
  })

  it('the same six FINAL reasons', () => {
    expect([...FINAL_REASONS].sort()).toEqual(
      [
        'CLIENT_INITIATED',
        'DUPLICATE_IDENTITY',
        'PARTICIPANT_REMOVED',
        'ROOM_DELETED',
        'ROOM_CLOSED',
        'USER_REJECTED',
      ].sort(),
    )
  })

  it('every FINAL reason is a real protocol DisconnectReason', () => {
    for (const name of FINAL_REASONS) {
      expect(
        typeof (DisconnectReason as unknown as Record<string, number>)[name],
      ).toBe('number')
    }
  })
})

describe('reasonName', () => {
  it('names a number through the enum, passes a name through, else UNKNOWN_REASON', () => {
    expect(reasonName(DisconnectReason.PARTICIPANT_REMOVED, ENUM)).toBe(
      'PARTICIPANT_REMOVED',
    )
    expect(reasonName('ROOM_CLOSED', ENUM)).toBe('ROOM_CLOSED')
    expect(reasonName(undefined, ENUM)).toBe('UNKNOWN_REASON')
    expect(reasonName(999, ENUM)).toBe('UNKNOWN_REASON')
    expect(reasonName(4, null)).toBe('UNKNOWN_REASON')
  })
})

describe('disconnectReasonOf', () => {
  it('every FINAL reason ends the session; nothing FINAL is a rejoin', () => {
    for (const name of FINAL_REASONS) {
      expect(isFinal(name)).toBe(true)
      expect(disconnectReasonOf(name)).not.toBe('network')
    }
  })

  it('every other protocol reason, and no reason at all, is a rejoin', () => {
    const others = Object.keys(DisconnectReason)
      .filter(k => Number.isNaN(Number(k)))
      .filter(k => !FINAL_REASONS.has(k))
    expect(others).toEqual(
      expect.arrayContaining([
        'UNKNOWN_REASON',
        'SIGNAL_CLOSE',
        'JOIN_FAILURE',
      ]),
    )
    for (const name of [...others, 'UNKNOWN_REASON']) {
      expect(isFinal(name)).toBe(false)
      expect(disconnectReasonOf(name)).toBe('network')
    }
  })
})
