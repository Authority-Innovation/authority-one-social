/**
 * STORY MODE mock transport — a tiny canned mystery so the scene pane + chat
 * lane are fully demoable offline while the runtime story engine is built in
 * parallel. Emits the SAME frames the live engine will (scene / chat), and
 * consumes the same (choice / chat), through the shared GameClient seam.
 */
import {type GameClient, type GameClientOptions, type SceneFrame} from './types'

export const STORY_AGENT_ID = 'agent'
export const STORY_AGENT_NAME = 'The Narrator'

/** Placeholder illustrations (stable seeds → stable images). The live engine
 *  sends its own generated case-file art URLs. */
const art = (seed: string) => `https://picsum.photos/seed/${seed}/800/450`

interface StoryBeat {
  scene: SceneFrame
  /** Narrator chat line accompanying the scene. */
  say?: string
  /** Where each choice leads. */
  next?: Record<string, string>
}

/** A three-beat authored branch so every UI state is reachable: choices,
 *  free-text beats, and a terminal scene. */
const BEATS: Record<string, StoryBeat> = {
  intro: {
    scene: {
      image: art('one-mystery-hall'),
      title: 'The Regatta Cup Vanishes',
      text: 'Storm outside, silence inside. The trophy cabinet at the yacht club stands open — and empty. Three guests linger in the hall, each with a reason to avoid your eyes.',
      choices: [
        {id: 'question-guests', label: 'Question the guests'},
        {id: 'inspect-cabinet', label: 'Inspect the cabinet'},
      ],
    },
    say: 'Take your time, detective. Ask me anything — or pick a lead to chase.',
    next: {'question-guests': 'guests', 'inspect-cabinet': 'cabinet'},
  },
  guests: {
    scene: {
      image: art('one-mystery-guests'),
      title: 'Three Uneasy Alibis',
      text: 'The commodore claims he was on the balcony. The chef never left the kitchen — or so she says. The young deckhand keeps glancing at the coat rack.',
      choices: [
        {id: 'press-deckhand', label: 'Press the deckhand'},
        {id: 'check-coats', label: 'Search the coat rack'},
      ],
    },
    say: 'One of them is lying. Chat with me if you want my read on the room.',
    next: {'press-deckhand': 'reveal', 'check-coats': 'reveal'},
  },
  cabinet: {
    scene: {
      image: art('one-mystery-cabinet'),
      title: 'Scratches on the Lock',
      text: 'No forced entry — the lock was opened with a key. But a smear of galley grease glints on the glass shelf where the cup once stood.',
      choices: [{id: 'to-kitchen', label: 'Head to the kitchen'}],
    },
    say: 'Galley grease, a key, no witnesses. Tell me your theory.',
    next: {'to-kitchen': 'reveal'},
  },
  reveal: {
    scene: {
      image: art('one-mystery-reveal'),
      title: 'Case Closed',
      text: 'Wrapped in an oilskin coat behind the rack: the Regatta Cup. The chef borrowed it to settle a bet with the commodore — and the deckhand helped her hide it. Mystery solved, reputations… negotiable.',
    },
    say: 'Well worked, detective. That is the whole case — for now. The full engine arrives soon.',
  },
}

/**
 * Same discipline as the board mock: async emission (never re-entrant),
 * timers cleared on disconnect, chat echoed back like the server does.
 */
export function createMockStoryClient(opts: GameClientOptions): GameClient {
  const {playerID, name, callbacks} = opts
  let connected = false
  let beatId = 'intro'
  const timers: Array<ReturnType<typeof setTimeout>> = []

  const later = (ms: number, fn: () => void) => {
    const id = setTimeout(() => {
      if (connected) fn()
    }, ms)
    timers.push(id)
  }

  const narratorSay = (text: string, delayMs = 700) => {
    later(delayMs, () =>
      callbacks.onChat({
        from: STORY_AGENT_ID,
        name: STORY_AGENT_NAME,
        text,
        ts: Date.now(),
      }),
    )
  }

  const emitBeat = (id: string, delayMs = 0) => {
    const beat = BEATS[id]
    if (!beat) return
    beatId = id
    later(delayMs, () => callbacks.onScene?.(beat.scene))
    if (beat.say) narratorSay(beat.say, delayMs + 700)
  }

  return {
    connect() {
      if (connected) return
      connected = true
      later(0, () => {
        callbacks.onConnection?.('online')
        callbacks.onPlayers([{id: playerID, name}])
      })
      emitBeat('intro')
    },

    disconnect() {
      connected = false
      for (const id of timers) clearTimeout(id)
      timers.length = 0
    },

    // Story matches have no board; the live engine would answer with an error
    // frame, the mock just ignores it.
    sendMove() {},

    sendChat(text: string) {
      if (!connected) return
      const trimmed = text.trim()
      if (!trimmed) return
      later(0, () =>
        callbacks.onChat({from: playerID, name, text: trimmed, ts: Date.now()}),
      )
      narratorSay(
        'Noted, detective. (The live game master will actually reason about that — pick a lead to keep moving.)',
        1100,
      )
    },

    sendChoice(id: string) {
      if (!connected) return
      const nextId = BEATS[beatId]?.next?.[id]
      if (!nextId) return
      emitBeat(nextId, 500)
    },
  }
}
