/**
 * ACCESSIBILITY ASSIST — the pure panel decisions and the wire mappers.
 *
 * The rule these tests exist to protect: the three buttons appear for exactly
 * one person, on exactly their own turn, and NOTHING ever plays itself.
 */
import {describe, expect, it} from '@jest/globals'

import {
  ASSIST_CANCEL_LABEL,
  ASSIST_CONFIRM_LABEL,
  assistHeadline,
  assistIntentFace,
  assistIntentsFor,
  assistPanelMode,
  assistPanelVisible,
  assistPrompt,
  assistThinkingLine,
  describeAssistSuggestion,
} from '../assistPanel'
import {mapWireAssistInfo, mapWireAssistMove} from '../liveGameClient'
import {type AssistInfo, type AssistSuggestion} from '../types'

const INFO: AssistInfo = {
  seats: ['0'],
  intents: ['attack', 'defend', 'surprise'],
}

const SUGGESTION: AssistSuggestion = {
  intent: 'attack',
  move: {from: 'e2', to: 'e4'},
  reason: 'Push your pawn forward to e4 and take some space!',
  differentiated: true,
}

const base = {
  assist: INFO,
  seat: '0' as string | null,
  myTurn: true,
  gameover: false,
  pending: null,
  suggestion: null,
}

describe('assistPanelMode', () => {
  it('shows the three buttons on the granted seat’s own turn', () => {
    expect(assistPanelMode(base)).toBe('choose')
  })

  it('is hidden for everyone the match did not grant it to', () => {
    expect(assistPanelMode({...base, assist: null})).toBe('hidden')
    expect(assistPanelMode({...base, assist: {...INFO, seats: ['1']}})).toBe(
      'hidden',
    )
  })

  it('is hidden for a spectator', () => {
    expect(assistPanelMode({...base, seat: null})).toBe('hidden')
  })

  it('holds its place on the opponent’s turn instead of vanishing', () => {
    // Buttons that appear and disappear are buttons a low-vision player never
    // finds — the block stays put and says so; only the buttons stand down.
    expect(assistPanelMode({...base, myTurn: false})).toBe('waiting')
  })

  it('waiting outranks a stale pending ask or suggestion off-turn', () => {
    expect(
      assistPanelMode({
        ...base,
        myTurn: false,
        pending: 'attack',
        suggestion: SUGGESTION,
      }),
    ).toBe('waiting')
  })

  it('is on screen in every mode but hidden', () => {
    expect(assistPanelVisible('hidden')).toBe(false)
    for (const mode of [
      'waiting',
      'choose',
      'thinking',
      'suggestion',
    ] as const) {
      expect(assistPanelVisible(mode)).toBe(true)
    }
  })

  it('is hidden once the game is over', () => {
    expect(assistPanelMode({...base, gameover: true})).toBe('hidden')
  })

  it('shows the waiting state while an ask is in flight', () => {
    expect(assistPanelMode({...base, pending: 'defend'})).toBe('thinking')
  })

  it('shows the suggestion once it arrives, even if a pending flag lingers', () => {
    expect(
      assistPanelMode({...base, pending: 'attack', suggestion: SUGGESTION}),
    ).toBe('suggestion')
  })

  it('a suggestion never survives the game ending', () => {
    expect(
      assistPanelMode({...base, gameover: true, suggestion: SUGGESTION}),
    ).toBe('hidden')
  })
})

describe('assist button faces', () => {
  it('gives every intent a distinct label, emoji and spoken hint', () => {
    const faces = (['attack', 'defend', 'surprise'] as const).map(
      assistIntentFace,
    )
    expect(new Set(faces.map(f => f.label)).size).toBe(3)
    expect(new Set(faces.map(f => f.emoji)).size).toBe(3)
    for (const f of faces) {
      expect(f.label.length).toBeGreaterThan(0)
      // The hint is read aloud — it must be a sentence, not a keyword.
      expect(f.hint.split(' ').length).toBeGreaterThan(3)
    }
  })

  it('falls back to all three intents when the server names none', () => {
    expect(assistIntentsFor(null)).toEqual(['attack', 'defend', 'surprise'])
    expect(assistIntentsFor({seats: ['0'], intents: []})).toEqual([
      'attack',
      'defend',
      'surprise',
    ])
  })

  it('honours a server that offers a narrower set', () => {
    expect(assistIntentsFor({seats: ['0'], intents: ['defend']})).toEqual([
      'defend',
    ])
  })
})

describe('assist wording', () => {
  it('names the agent in the prompt, and falls back gracefully', () => {
    expect(assistPrompt('Bob')).toMatch(/Bob/)
    expect(assistPrompt(null)).toMatch(/Bob/)
    expect(assistPrompt('   ')).toMatch(/Bob/)
    expect(assistPrompt('Ada')).toMatch(/Ada/)
  })

  it('has a distinct waiting line per intent', () => {
    const lines = (['attack', 'defend', 'surprise'] as const).map(
      assistThinkingLine,
    )
    expect(new Set(lines).size).toBe(3)
  })

  it('uses the server’s reason as the headline', () => {
    expect(assistHeadline(SUGGESTION)).toBe(SUGGESTION.reason)
  })

  it('still says something warm when the server sends no reason', () => {
    expect(assistHeadline({...SUGGESTION, reason: ''}).length).toBeGreaterThan(
      0,
    )
    expect(
      assistHeadline({...SUGGESTION, reason: '', differentiated: false}),
    ).toMatch(/good move/i)
  })

  it('the confirm label describes the action in plain words', () => {
    expect(ASSIST_CONFIRM_LABEL).toBe('Play this move')
    expect(ASSIST_CANCEL_LABEL.length).toBeGreaterThan(0)
  })
})

describe('describeAssistSuggestion', () => {
  it('reads the reason and spells the squares out', () => {
    const spoken = describeAssistSuggestion(SUGGESTION)
    expect(spoken).toContain(SUGGESTION.reason)
    // 'e 2' not 'e2', so a screen reader does not say "e-twenty".
    expect(spoken).toContain('e 2')
    expect(spoken).toContain('e 4')
  })

  it('mentions a promotion in words', () => {
    const spoken = describeAssistSuggestion({
      ...SUGGESTION,
      move: {from: 'e7', to: 'e8', promotion: 'q'},
    })
    expect(spoken).toMatch(/queen/)
  })

  it('is empty with nothing to describe', () => {
    expect(describeAssistSuggestion(null)).toBe('')
  })
})

describe('mapWireAssistInfo', () => {
  it('maps a well-formed capability', () => {
    expect(
      mapWireAssistInfo({seats: ['0'], intents: ['attack', 'defend']}),
    ).toEqual({seats: ['0'], intents: ['attack', 'defend']})
  })

  it('treats anything unreadable as NO assist (opt-in, fail closed)', () => {
    expect(mapWireAssistInfo(null)).toBeNull()
    expect(mapWireAssistInfo(undefined)).toBeNull()
    expect(mapWireAssistInfo({})).toBeNull()
    expect(mapWireAssistInfo({seats: []})).toBeNull()
    expect(mapWireAssistInfo({seats: 'everyone'})).toBeNull()
    expect(mapWireAssistInfo(42)).toBeNull()
  })

  it('drops junk seats and unknown intents rather than trusting them', () => {
    expect(
      mapWireAssistInfo({seats: ['0', null, {}], intents: ['attack', 'nuke']}),
    ).toEqual({seats: ['0'], intents: ['attack']})
  })

  it('accepts a numeric seat — a dropped grant reads as "assist is off"', () => {
    expect(mapWireAssistInfo({seats: [0, 1]})?.seats).toEqual(['0', '1'])
  })
})

describe('mapWireAssistMove', () => {
  it('maps a well-formed suggestion', () => {
    expect(
      mapWireAssistMove({
        t: 'assist-move',
        intent: 'defend',
        move: {from: 'd8', to: 'd7'},
        reason: 'Get your queen somewhere safe.',
        differentiated: true,
      }),
    ).toEqual({
      intent: 'defend',
      move: {from: 'd8', to: 'd7'},
      reason: 'Get your queen somewhere safe.',
      differentiated: true,
    })
  })

  it('carries a promotion through', () => {
    const mapped = mapWireAssistMove({
      intent: 'attack',
      move: {from: 'e7', to: 'e8', promotion: 'q'},
      reason: 'Queen!',
    })
    expect(mapped?.move.promotion).toBe('q')
  })

  it('drops a suggestion it cannot read rather than half-rendering it', () => {
    expect(mapWireAssistMove({intent: 'attack'})).toBeNull()
    expect(mapWireAssistMove({intent: 'attack', move: {from: 'e2'}})).toBeNull()
    expect(
      mapWireAssistMove({intent: 'sideways', move: {from: 'e2', to: 'e4'}}),
    ).toBeNull()
  })

  it('defaults differentiated to true only when not explicitly false', () => {
    const move = {from: 'e2', to: 'e4'}
    expect(mapWireAssistMove({intent: 'attack', move})?.differentiated).toBe(
      true,
    )
    expect(
      mapWireAssistMove({intent: 'attack', move, differentiated: false})
        ?.differentiated,
    ).toBe(false)
  })
})
