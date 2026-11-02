/**
 * The owner's consent sheet (design r2 §4.3, §6 step 3; D6, CR-1). Pure.
 *
 * - Per kind: one switch per kind the runtime lists in `consentRequired`, each
 *   OFF until the owner turns it on. "Don't record" is a valid answer: every
 *   kind left off goes out as `refused`, never omitted, so the decision is
 *   complete and explicit.
 * - A kind this app has no words for still gets a switch (named by its id) and
 *   is decided by the owner, never on their behalf.
 * - `ai_process` is what lets the agent hear and see the owner at all; the
 *   runtime starts the agent only once it is given [CR-1]. Going live without
 *   it would be a session with no agent, so the sheet requires it.
 *
 * All-party: this sheet is the owner's own. Guests decide for themselves on
 * their own link (the runtime admits each person only on their own rows), and
 * this app doesn't invite guests.
 */
import {sha256} from 'js-sha256'

import {type LiveDecision} from './api'

/**
 * The consent text the sheet shows. Bump when its words change, and add the
 * new version's words to the runtime's table (src/live/consent/texts.js)
 * first: it refuses a version or words it doesn't hold.
 */
export const CONSENT_TEXT_VERSION = 'one-app-v1'

/** What the sheet shows for one kind. */
export type ConsentWords = {title: string; detail: string}

/**
 * SHA-256 (hex) of the words the sheet showed for one kind, as the runtime
 * hashes its own copy: title, a newline, detail (review r404 d).
 */
export function consentWordsSha256({title, detail}: ConsentWords): string {
  return sha256(`${title}\n${detail}`)
}

/** The hash of the words shown, for every required kind. */
export function shownWordsSha256(
  required: string[],
  wordsFor: (kind: string) => ConsentWords,
): Record<string, string> {
  return Object.fromEntries(
    required.map(k => [k, consentWordsSha256(wordsFor(k))]),
  )
}

export const REQUIRED_TO_GO_LIVE = 'ai_process'

export type ConsentChoices = Record<string, boolean>

export function initialChoices(required: string[]): ConsentChoices {
  return Object.fromEntries(required.map(k => [k, false]))
}

export function canGoLive(required: string[], choices: ConsentChoices) {
  return (
    !required.includes(REQUIRED_TO_GO_LIVE) ||
    choices[REQUIRED_TO_GO_LIVE] === true
  )
}

/** Every required kind, given or refused. Kinds the runtime didn't ask for are dropped. */
export function decisionsFor(
  required: string[],
  choices: ConsentChoices,
): Record<string, LiveDecision> {
  return Object.fromEntries(
    required.map(k => [k, choices[k] === true ? 'given' : 'refused']),
  )
}
