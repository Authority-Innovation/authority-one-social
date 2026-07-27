/**
 * ACCESSIBILITY ASSIST — pure presentation logic for the three-button move
 * helper (ATTACK / DEFEND / SURPRISE).
 *
 * Extracted from the board component the way gameoverPanel.ts and series.ts
 * are, so the decisions that matter — when the buttons appear, what the panel
 * says, what a screen reader hears — are testable without rendering anything.
 *
 * DESIGN NOTES (they are requirements, not decoration):
 *  - The PANEL is present for the whole match once a seat has been granted
 *    assist — including the opponent's turn, where it holds its place with a
 *    quiet line instead of vanishing. Buttons that appear and disappear are
 *    buttons a player with low vision never finds; a stable, always-there
 *    block is the whole point. The tappable buttons themselves still only
 *    arm on this player's own turn (a dead button is a small cruelty to
 *    someone already finding the game hard) — hence 'waiting'.
 *  - Nothing auto-plays. The server recommends, the board highlights, the
 *    player taps once to play it. They are playing, not watching.
 *  - The highlight never relies on colour alone (the board is already carrying
 *    red-vs-blue for the pieces); the component pairs it with a ring and a
 *    marker, and every state is announced in words here.
 *  - Wording stays warm and plain. No notation, no jargon, no "optimal".
 */
import {
  type AssistInfo,
  type AssistIntent,
  type AssistSuggestion,
} from './types'

/** What the assist area should be showing right now. */
export type AssistPanelMode =
  | 'hidden' // not this player's match or seat (or the game is over)
  | 'waiting' // granted, but the opponent is to move: hold the place, no buttons
  | 'choose' // the three buttons, waiting for a tap
  | 'thinking' // asked, waiting for the server
  | 'suggestion' // a move is on the board, waiting for the confirming tap

/**
 * The single decision about what the assist area shows. Strict about WHO:
 * assist is a capability granted per seat and never leaks to another player or
 * a spectator. Deliberately NOT strict about WHEN any more — a granted seat
 * keeps the block on screen all match ('waiting' off-turn) so the buttons
 * always appear in the same place rather than blinking in and out.
 */
export function assistPanelMode({
  assist,
  seat,
  myTurn,
  gameover,
  pending,
  suggestion,
}: {
  assist: AssistInfo | null
  /** The seat this client holds; null = spectating. */
  seat: string | null
  myTurn: boolean
  gameover: boolean
  /** An intent we have asked for and not yet heard back about. */
  pending: AssistIntent | null
  suggestion: AssistSuggestion | null
}): AssistPanelMode {
  if (gameover) return 'hidden'
  if (!assist || seat === null) return 'hidden'
  if (!assist.seats.includes(seat)) return 'hidden'
  if (!myTurn) return 'waiting'
  if (suggestion) return 'suggestion'
  if (pending) return 'thinking'
  return 'choose'
}

/** Is the assist block on screen at all (any mode but 'hidden')? Used by the
 *  screen to reserve vertical room for it BEFORE sizing the board, so the
 *  buttons are never the thing that falls off the bottom. */
export function assistPanelVisible(mode: AssistPanelMode): boolean {
  return mode !== 'hidden'
}

/** The block's own heading — it names the feature so the player can be told
 *  "tap the green MOVE HELP buttons" and find it. */
export const ASSIST_TITLE = 'MOVE HELP'

/** Held place on the opponent's turn: says where the buttons went and that
 *  they are coming back. */
export const ASSIST_WAITING_LINE =
  'Your move help buttons appear here on your turn.'

/** Which intents to offer, in order — the server's list when it sent one. */
export function assistIntentsFor(assist: AssistInfo | null): AssistIntent[] {
  const intents = assist?.intents ?? []
  return intents.length ? intents : ['attack', 'defend', 'surprise']
}

/**
 * Button face for one intent. The emoji does real work here: it gives a
 * non-reading player something to aim for, and it makes the three buttons
 * distinguishable at a glance without depending on colour.
 */
export function assistIntentFace(intent: AssistIntent): {
  label: string
  emoji: string
  hint: string
} {
  switch (intent) {
    case 'attack':
      return {
        label: 'Attack',
        emoji: '⚔️',
        hint: 'Bob finds you a bold move that goes after their pieces',
      }
    case 'defend':
      return {
        label: 'Defend',
        emoji: '🛡️',
        hint: 'Bob finds you a safe move that keeps your pieces protected',
      }
    default:
      return {
        label: 'Surprise',
        emoji: '✨',
        hint: 'Bob finds you a fun, unexpected move',
      }
  }
}

/** The prompt above the three buttons. */
export function assistPrompt(agentName: string | null): string {
  const who = agentName?.trim() || 'Bob'
  return `Need a hand? ${who} can find you a move.`
}

/** What we say while waiting for the server. */
export function assistThinkingLine(intent: AssistIntent): string {
  switch (intent) {
    case 'attack':
      return 'Looking for a good attack…'
    case 'defend':
      return 'Looking for the safest move…'
    default:
      return 'Thinking of something fun…'
  }
}

/**
 * The label on the confirming button. It names the ACTION, not the notation —
 * "Play this move" is understood by everybody, "Play Nf3" is not.
 */
export const ASSIST_CONFIRM_LABEL = 'Play this move'

/** The label for going back to the three buttons without playing. */
export const ASSIST_CANCEL_LABEL = 'Show me another'

/**
 * Spoken description of a suggestion, for screen readers and for the a11y
 * label on the confirm button. Squares are read as letters and numbers because
 * that is what is written on nothing — the board has no coordinates — so the
 * piece and the reason carry the meaning.
 */
export function describeAssistSuggestion(
  suggestion: AssistSuggestion | null,
): string {
  if (!suggestion) return ''
  const {from, to, promotion} = suggestion.move
  const promo = promotion ? `, becoming a ${pieceWord(promotion)}` : ''
  return `${suggestion.reason} Play the piece on ${spellSquare(from)} to ${spellSquare(to)}${promo}.`
}

/** 'e2' → 'e 2' so a screen reader does not say "e-two-hundred". */
function spellSquare(square: string): string {
  return square.length === 2 ? `${square[0]} ${square[1]}` : square
}

function pieceWord(type: string): string {
  switch (type) {
    case 'q':
      return 'queen'
    case 'r':
      return 'rook'
    case 'b':
      return 'bishop'
    case 'n':
      return 'knight'
    default:
      return 'piece'
  }
}

/**
 * The headline shown with a suggestion. For games whose intents are not yet
 * differentiated the server says so, and we say "best move" rather than
 * pretending the button the player pressed chose this.
 */
export function assistHeadline(suggestion: AssistSuggestion): string {
  return (
    suggestion.reason ||
    (suggestion.differentiated ? 'Here you go!' : "Here's a good move.")
  )
}
