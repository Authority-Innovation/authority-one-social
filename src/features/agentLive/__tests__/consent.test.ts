/**
 * The consent sheet's rules (design r2 §4.3, §6 step 3): per kind, all off
 * until the owner turns them on, every required kind decided, AI processing
 * needed to go live.
 */
import {describe, expect, it} from '@jest/globals'

import {reply} from '../__fixtures__/runtimeLive'
import {canGoLive, decisionsFor, initialChoices} from '../consent'

const REQUIRED = reply('startAwaitingConsent').body.consentRequired as string[]

describe('consent sheet', () => {
  it('starts with every kind the runtime asks about, all off', () => {
    expect(initialChoices(REQUIRED)).toEqual({
      record_audio: false,
      record_video: false,
      transcribe: false,
      ai_process: false,
      remember: false,
    })
  })

  it('decides every required kind: off is refused, never left out', () => {
    expect(decisionsFor(REQUIRED, {ai_process: true})).toEqual({
      record_audio: 'refused',
      record_video: 'refused',
      transcribe: 'refused',
      ai_process: 'given',
      remember: 'refused',
    })
  })

  it('a kind this app has no words for is still decided by the owner', () => {
    const required = [...REQUIRED, 'new_kind']
    expect(initialChoices(required).new_kind).toBe(false)
    expect(
      decisionsFor(required, {ai_process: true, new_kind: true}).new_kind,
    ).toBe('given')
  })

  it('kinds the runtime didn’t ask for are dropped', () => {
    expect(Object.keys(decisionsFor(REQUIRED, {smuggled: true}))).toEqual(
      REQUIRED,
    )
  })

  it('going live needs AI processing', () => {
    expect(canGoLive(REQUIRED, initialChoices(REQUIRED))).toBe(false)
    expect(canGoLive(REQUIRED, {ai_process: true})).toBe(true)
  })
})
