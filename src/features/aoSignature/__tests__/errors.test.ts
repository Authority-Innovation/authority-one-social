import {describe, expect, it} from '@jest/globals'

import {
  aoPickerErrorWords,
  AOSignatureError,
  aoSignatureErrorWords,
  runtimeErrorCode,
} from '../errors'

const words = (e: unknown) => aoSignatureErrorWords(e).message
const refused = (status: number, code: string) =>
  AOSignatureError.fromResponse(status, code)

describe('honest error words (Studio parity)', () => {
  it.each([
    [409, 'owner-exists', 'already has an Authority One account'],
    [
      409,
      'already-bound',
      'already linked to a different Authority One account',
    ],
    [409, 'unlinked-contact-support', 'Contact support'],
    [403, 'full-session-required', 'fresh link code'],
    [403, 'not-a-person', "Agent accounts can't sign in"],
    [403, 'not-an-owner', 'nothing to link'],
    [429, 'rate-limited', 'Too many link attempts'],
    [403, 'link-code-invalid', 'start the link again'],
    [403, 'no-verified-email', 'verified email'],
    [403, 'not-allowlisted', 'invite-only'],
    [502, 'provision-failed', 'nothing was created'],
    [503, 'unavailable', 'try again in a moment'],
    [503, 'allowlist-unavailable', 'try again in a moment'],
    [502, 'session-unavailable', 'try again in a moment'],
    [503, 'ao-session-unavailable', 'try again in a moment'],
    [401, 'janus-reverify', 'Continue with Authority Signature'],
    [401, 'unauthorized', "wasn't accepted"],
    [429, '', 'Too many tries'],
    [500, '', 'try again in a moment'],
    [403, '', 'invite-only'],
  ])('%i %s', (status, code, phrase) => {
    expect(words(refused(status, code))).toContain(phrase)
  })

  it('a 418 says its status', () => {
    const d = aoSignatureErrorWords(refused(418, ''))
    expect(d.message).toContain('Couldn')
    expect(d.values).toEqual({status: 418})
  })

  it('client-side kinds', () => {
    expect(words(new AOSignatureError('no-ao-session'))).toContain(
      "isn't accepting",
    )
    expect(words(new AOSignatureError('link-mismatch'))).toContain(
      'nothing was changed',
    )
    expect(words(new AOSignatureError('transport'))).toContain(
      'check your connection',
    )
    expect(words(new AOSignatureError('cancelled'))).toContain('cancelled')
    expect(words(new AOSignatureError('needs-pds-session'))).toContain(
      'handle first',
    )
    expect(words(new Error('x'))).toContain('Something went wrong')
  })

  it('picker words', () => {
    const p = (e: AOSignatureError) => aoPickerErrorWords(e).message
    expect(p(refused(402, ''))).toContain('free agent')
    expect(p(refused(403, 'not-your-agent'))).toContain("isn't one of yours")
    expect(p(refused(400, 'invalid-handle'))).toContain("can't be used")
    expect(p(refused(403, 'not-provisioned'))).toContain('Choose or create')
    expect(p(refused(401, ''))).toContain('session ended')
    expect(p(refused(503, 'unavailable'))).toContain('try again in a moment')
  })

  it('code wins over error', () => {
    expect(runtimeErrorCode({error: 'reverify', code: 'janus-reverify'})).toBe(
      'janus-reverify',
    )
    expect(runtimeErrorCode({error: 'owner-exists'})).toBe('owner-exists')
    expect(runtimeErrorCode(null)).toBe('')
  })
})
