/**
 * The consent sheet's rules (design r2 §4.3, §6 step 3): per kind, all off
 * until the owner turns them on, every required kind decided, AI processing
 * needed to go live.
 */
import {describe, expect, it} from '@jest/globals'

import {RUNTIME_ONE_APP_V1_SHA256} from '../__fixtures__/consentWordsSha256'
import {reply} from '../__fixtures__/runtimeLive'
import {
  canGoLive,
  type ConsentWords,
  consentWordsSha256,
  decisionsFor,
  initialChoices,
  shownWordsSha256,
} from '../consent'

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

describe('r404 d: the words hash as the runtime hashes them', () => {
  // The runtime's own copy of the words (texts.js at ba7b6f0): title, a
  // newline, detail. Kinds the sheet has no words for show the kind id.
  const RUNTIME_WORDS: Record<string, ConsentWords> = {
    ai_process: {
      title: 'Let your agent hear and see you',
      detail:
        'Needed to go live. Your agent processes your voice and anything you show it, only during this session.',
    },
    retain_extended: {
      title: 'retain_extended',
      detail: 'Another use of this session.',
    },
  }

  it('title + newline + detail, SHA-256 hex, equal to the runtime constants', () => {
    for (const [kind, w] of Object.entries(RUNTIME_WORDS)) {
      expect(consentWordsSha256(w)).toBe(RUNTIME_ONE_APP_V1_SHA256[kind])
    }
  })

  it('any change to the words changes the hash', () => {
    const w = RUNTIME_WORDS.ai_process
    expect(consentWordsSha256({...w, detail: w.detail + ' '})).not.toBe(
      RUNTIME_ONE_APP_V1_SHA256.ai_process,
    )
    expect(consentWordsSha256({title: `${w.title}\n${w.detail}`, detail: ''}))
      .not.toBe(RUNTIME_ONE_APP_V1_SHA256.ai_process)
  })

  it('one hash per required kind, from the words given', () => {
    expect(
      shownWordsSha256(['ai_process', 'retain_extended'], k => RUNTIME_WORDS[k]),
    ).toEqual({
      ai_process: RUNTIME_ONE_APP_V1_SHA256.ai_process,
      retain_extended: RUNTIME_ONE_APP_V1_SHA256.retain_extended,
    })
  })
})
